import { getOpenAIApiKey, getOpenAIModel } from "@/lib/ai/openai-key.server";
import {
  buildDashboardSnapshotForAi,
  snapshotToPromptText,
  type DashboardAiSnapshot,
} from "@/lib/ai/dashboard-snapshot.server";
import {
  lookupUserForAi,
  queryBookingsForAi,
  queryTransactionsForAi,
  type AiPeriod,
} from "@/lib/ai/dashboard-queries.server";
import {
  AI_DATA_UNAVAILABLE_REPLY,
  logAiDataError,
  safeAiCall,
  toolDataUnavailable,
} from "@/lib/ai/ai-safe";
import { buildFinanceReportPdf, type FinanceReportKind } from "@/lib/ai/finance-pdf.server";
import type { AiChatResult, AiPdfAttachment } from "@/lib/ai/types";

export type { AiChatResult, AiPdfAttachment };

export type AiChatRole = "user" | "assistant" | "system";

export type AiChatMessage = {
  role: AiChatRole;
  content: string;
};

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_transactions",
      description:
        "Ambil jumlah dan daftar transaksi keuangan (dari tabel transaksi/transactions/payment_ledger). Gunakan untuk pertanyaan berapa banyak transaksi, transaksi per booking ID, atau transaksi per user.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["week", "month", "all"], description: "Rentang waktu" },
          status: {
            type: "string",
            enum: ["all", "success", "pending", "refund"],
            description: "Filter status normalisasi",
          },
          limit: { type: "number", description: "Maks baris daftar (default 25)" },
          bookingId: { type: "string", description: "UUID court_bookings.id" },
          userId: { type: "string", description: "UUID profiles.user_id (pembayar)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_bookings",
      description:
        "Ambil data reservasi court_bookings: total, user paling sering booking, daftar terbaru, atau detail satu booking by ID.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["week", "month", "all"] },
          bookingId: { type: "string", description: "UUID court_bookings — detail satu reservasi" },
          userId: { type: "string", description: "Filter reservasi milik user ini" },
          topBookersLimit: { type: "number", description: "Jumlah top booker (default 10)" },
          recentLimit: { type: "number", description: "Jumlah reservasi terbaru (default 15)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lookup_user",
      description:
        "Cari pengguna by user_id (UUID), email, atau nama/username. Sertakan jumlah booking mereka.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
          email: { type: "string" },
          search: { type: "string", description: "Nama atau username (partial)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "export_finance_pdf",
      description:
        "Buat file PDF laporan keuangan mingguan atau bulanan dari data dashboard terbaru.",
      parameters: {
        type: "object",
        properties: {
          reportType: {
            type: "string",
            enum: ["weekly", "monthly"],
            description: "weekly = 7 hari terakhir, monthly = bulan berjalan",
          },
        },
        required: ["reportType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "refresh_dashboard_snapshot",
      description: "Ambil ulang snapshot KPI dashboard (keuangan, pengguna, operasional).",
      parameters: { type: "object", properties: {} },
    },
  },
];

function systemPrompt(snapshot: DashboardAiSnapshot): string {
  return `Anda adalah AI Assistant untuk dashboard admin klub padel GPC.

## Kemampuan
- Menjawab pertanyaan keuangan, jumlah transaksi, reservasi (court_bookings), dan pengguna.
- Menyebut **nama + email + user_id** saat membahas pengguna (jangan hanya UUID tanpa konteks).
- Menyebut **booking ID (court_bookings.id)** saat membahas reservasi tertentu.
- Saran promosi berdasarkan angka snapshot.
- PDF laporan keuangan via export_finance_pdf.

## Aturan wajib
- Bahasa Indonesia kecuali diminta lain.
- Jika tool mengembalikan \`dataAvailable: false\` atau \`ok: false\`, jawab singkat bahwa **Anda tidak dapat menampilkan data tersebut saat ini** — jangan sebut error SQL, kolom database, atau stack trace.
- **Jangan mengarang angka atau nama.** Jika pertanyaan butuh daftar/nama/jumlah spesifik, panggil tool:
  - Jumlah/daftar transaksi → query_transactions
  - Reservasi / siapa paling sering booking / booking by ID → query_bookings
  - Cari user by email/nama/UUID → lookup_user
- Snapshot di bawah adalah ringkasan; untuk detail terbaru atau filter spesifik selalu gunakan tool.
- Uang dalam IDR.
- Rank pemain: beginner (0–19 poin), bronze (20+), silver (40+), gold (70+), platinum (90+) — kolom profiles.rank & total_score.

## Kamus data (penting)
- court_bookings.id = ID reservasi yang admin maksud dengan "booking id".
- profiles.user_id = ID pengguna (sama dengan auth).
- Transaksi aktif di tabel: lihat operations.transactionDataSource.
- reference_id pada transaksi sering = court_bookings.id untuk pembayaran booking.

## Kapan memakai tool (contoh)
- "Berapa jumlah transaksi?" → query_transactions period month atau all
- "Siapa yang reservasi booking ID xxx?" → query_bookings bookingId xxx
- "User paling sering booking" → query_bookings topBookersLimit 10
- "Transaksi untuk user Y" → lookup_user lalu query_transactions userId

Data dashboard (${snapshot.timezone}, generated ${snapshot.generatedAt}):
${snapshotToPromptText(snapshot)}`;
}

function parsePeriod(v: unknown): AiPeriod {
  if (v === "week" || v === "month" || v === "all") return v;
  return "month";
}

function safeParseArgs(argsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function runTool(
  name: string,
  argsJson: string,
  snapshot: DashboardAiSnapshot,
): Promise<{ result: string; attachments: AiPdfAttachment[]; snapshot: DashboardAiSnapshot }> {
  const attachments: AiPdfAttachment[] = [];
  let snap = snapshot;
  const args = safeParseArgs(argsJson);

  try {
    if (name === "refresh_dashboard_snapshot") {
      snap = await buildDashboardSnapshotForAi();
      return { result: snapshotToPromptText(snap), attachments, snapshot: snap };
    }

    if (name === "query_transactions") {
      const data = await queryTransactionsForAi({
        period: parsePeriod(args.period),
        status: (args.status as "all" | "success" | "pending" | "refund") ?? "all",
        limit: typeof args.limit === "number" ? args.limit : 25,
        bookingId: typeof args.bookingId === "string" ? args.bookingId : undefined,
        userId: typeof args.userId === "string" ? args.userId : undefined,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_bookings") {
      const data = await queryBookingsForAi({
        period: parsePeriod(args.period),
        bookingId: typeof args.bookingId === "string" ? args.bookingId : undefined,
        userId: typeof args.userId === "string" ? args.userId : undefined,
        topBookersLimit: typeof args.topBookersLimit === "number" ? args.topBookersLimit : 10,
        recentLimit: typeof args.recentLimit === "number" ? args.recentLimit : 15,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "lookup_user") {
      const data = await lookupUserForAi({
        userId: typeof args.userId === "string" ? args.userId : undefined,
        email: typeof args.email === "string" ? args.email : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "export_finance_pdf") {
      let reportType: FinanceReportKind = "weekly";
      if (args.reportType === "monthly" || args.reportType === "weekly") {
        reportType = args.reportType;
      }
      const { bytes, filename } = await buildFinanceReportPdf(snap, reportType);
      attachments.push({
        filename,
        mimeType: "application/pdf",
        base64:
          typeof Buffer !== "undefined"
            ? Buffer.from(bytes).toString("base64")
            : btoa(String.fromCharCode(...bytes)),
      });
      return {
        result: JSON.stringify({
          ok: true,
          dataAvailable: true,
          reportType,
          filename,
          message: "PDF berhasil dibuat; pengguna dapat mengunduh dari lampiran chat.",
        }),
        attachments,
        snapshot: snap,
      };
    }

    return {
      result: toolDataUnavailable("Tool tidak dikenal."),
      attachments,
      snapshot: snap,
    };
  } catch (err) {
    logAiDataError(`tool:${name}`, err);
    return { result: toolDataUnavailable(), attachments, snapshot: snap };
  }
}

async function openaiRequest(body: Record<string, unknown>): Promise<{
  message: { content?: string | null; tool_calls?: OpenAIToolCall[] };
}> {
  const apiKey = await getOpenAIApiKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errText.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAIToolCall[] } }>;
  };
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error("OpenAI mengembalikan respons kosong.");
  return { message };
}

export async function runAiAssistantChat(messages: AiChatMessage[]): Promise<AiChatResult> {
  try {
    let snapshot = await buildDashboardSnapshotForAi();
    const allAttachments: AiPdfAttachment[] = [];

    const apiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt(snapshot) },
      ...messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    const model = getOpenAIModel();
    let rounds = 0;
    const maxRounds = 8;

    while (rounds < maxRounds) {
      rounds += 1;
      let message: { content?: string | null; tool_calls?: OpenAIToolCall[] };
      try {
        ({ message } = await openaiRequest({
          model,
          messages: apiMessages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.25,
        }));
      } catch (err) {
        logAiDataError("openai", err);
        return { reply: AI_DATA_UNAVAILABLE_REPLY, attachments: allAttachments };
      }

      const toolCalls = message.tool_calls;
      if (toolCalls?.length) {
        apiMessages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          const { result, attachments, snapshot: nextSnap } = await runTool(
            tc.function.name,
            tc.function.arguments,
            snapshot,
          );
          snapshot = nextSnap;
          allAttachments.push(...attachments);
          apiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
        if (rounds === 1 && apiMessages[0]?.role === "system") {
          apiMessages[0] = { role: "system", content: systemPrompt(snapshot) };
        }
        continue;
      }

      const reply = (message.content ?? "").trim();
      if (!reply) {
        return { reply: AI_DATA_UNAVAILABLE_REPLY, attachments: allAttachments };
      }
      return { reply, attachments: allAttachments };
    }

    return {
      reply:
        "Maaf, pertanyaan ini membutuhkan terlalu banyak langkah. Coba pecah menjadi pertanyaan yang lebih singkat.",
      attachments: allAttachments,
    };
  } catch (err) {
    logAiDataError("runAiAssistantChat", err);
    return { reply: AI_DATA_UNAVAILABLE_REPLY, attachments: [] };
  }
}
