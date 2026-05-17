import { getOpenAIApiKey, getOpenAIModel } from "@/lib/ai/openai-key.server";
import {
  buildDashboardSnapshotForAi,
  snapshotToPromptText,
  type DashboardAiSnapshot,
} from "@/lib/ai/dashboard-snapshot.server";
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
      description: "Ambil ulang snapshot KPI dashboard (keuangan & pengguna).",
      parameters: { type: "object", properties: {} },
    },
  },
];

function systemPrompt(snapshot: DashboardAiSnapshot): string {
  return `Anda adalah AI Assistant untuk dashboard admin klub padel.

Kemampuan:
- Menjawab pertanyaan tentang keuangan, reservasi, dan pengguna berdasarkan data dashboard.
- Memberikan saran strategi promosi yang konkret (segmentasi, timing, paket, okupansi rendah) berdasarkan angka di snapshot.
- Membuat laporan PDF keuangan mingguan atau bulanan dengan tool export_finance_pdf bila pengguna meminta unduhan/laporan PDF.

Aturan:
- Jawab dalam Bahasa Indonesia kecuali pengguna meminta bahasa lain.
- Angka uang sebutkan dalam IDR; gunakan data snapshot, jangan mengarang angka.
- Jika data tidak cukup, jelaskan apa yang kurang.
- Untuk permintaan PDF/laporan/file unduhan, panggil export_finance_pdf.

Data dashboard (JSON, ${snapshot.timezone}):
${snapshotToPromptText(snapshot)}`;
}

async function runTool(
  name: string,
  argsJson: string,
  snapshot: DashboardAiSnapshot,
): Promise<{ result: string; attachments: AiPdfAttachment[]; snapshot: DashboardAiSnapshot }> {
  const attachments: AiPdfAttachment[] = [];
  let snap = snapshot;

  if (name === "refresh_dashboard_snapshot") {
    snap = await buildDashboardSnapshotForAi();
    return { result: snapshotToPromptText(snap), attachments, snapshot: snap };
  }

  if (name === "export_finance_pdf") {
    let reportType: FinanceReportKind = "weekly";
    try {
      const parsed = JSON.parse(argsJson || "{}") as { reportType?: string };
      if (parsed.reportType === "monthly" || parsed.reportType === "weekly") {
        reportType = parsed.reportType;
      }
    } catch {
      /* default weekly */
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
        reportType,
        filename,
        message: "PDF berhasil dibuat; pengguna dapat mengunduh dari lampiran chat.",
      }),
      attachments,
      snapshot: snap,
    };
  }

  return { result: JSON.stringify({ error: `Tool tidak dikenal: ${name}` }), attachments, snapshot: snap };
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
  const maxRounds = 6;

  while (rounds < maxRounds) {
    rounds += 1;
    const { message } = await openaiRequest({
      model,
      messages: apiMessages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.4,
    });

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
    if (!reply) throw new Error("Model tidak mengembalikan teks balasan.");
    return { reply, attachments: allAttachments };
  }

  throw new Error("Terlalu banyak langkah tool OpenAI; coba pertanyaan yang lebih singkat.");
}
