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
  queryMatchesForAi,
  queryTournamentsForAi,
  queryProgramsForAi,
  queryInstructorsForAi,
  queryNotificationsForAi,
  queryCourtScheduleForAi,
  queryUsersStatsForAi,
  queryUserMembershipForAi,
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
        "Ambil jumlah dan daftar transaksi keuangan. Bisa filter per tanggal spesifik (dateFrom/dateTo), per periode (week/month/all), per status, per booking, per user.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["week", "month", "all"], description: "Rentang waktu (diabaikan jika dateFrom/dateTo diisi)" },
          dateFrom: { type: "string", description: "Tanggal awal YYYY-MM-DD (spesifik, override period)" },
          dateTo: { type: "string", description: "Tanggal akhir YYYY-MM-DD (spesifik, override period)" },
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
        "Ambil data reservasi court_bookings: total, user paling sering booking, daftar terbaru, filter tanggal spesifik, filter tipe booking.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["week", "month", "all"], description: "Rentang waktu (diabaikan jika dateFrom diisi)" },
          dateFrom: { type: "string", description: "Tanggal awal YYYY-MM-DD (override period)" },
          dateTo: { type: "string", description: "Tanggal akhir YYYY-MM-DD" },
          bookingId: { type: "string", description: "UUID court_bookings — detail satu reservasi" },
          userId: { type: "string", description: "Filter reservasi milik user ini" },
          bookingType: { type: "string", enum: ["match", "program", "program_league_match"], description: "Filter tipe booking" },
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
        "Cari pengguna by user_id, email, nama/username, atau filter by role/rank. Bisa list semua user dengan role tertentu (misal superadmin).",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "UUID user_id spesifik" },
          email: { type: "string", description: "Email (partial match)" },
          search: { type: "string", description: "Nama atau username (partial)" },
          role: { type: "string", description: "Filter role (superadmin, admin, user, dll)" },
          rank: { type: "string", enum: ["cupu", "pemula", "standard", "ciamik", "ndewo"], description: "Filter rank" },
          limit: { type: "number", description: "Maks hasil (default 15)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_users_stats",
      description:
        "Ambil statistik pengguna: total user, breakdown per role (superadmin, user, dll), breakdown per rank, active 7/30 hari, onboarded vs belum. Untuk pertanyaan 'berapa banyak user', 'berapa superadmin', 'user aktif', dll.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", description: "Hitung jumlah user dengan role spesifik ini" },
          rank: { type: "string", description: "Hitung jumlah user dengan rank spesifik ini" },
          onboarded: { type: "boolean", description: "Filter onboarded true/false" },
          activeDays: { type: "number", description: "Hitung user aktif dalam N hari terakhir" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_user_membership",
      description:
        "Ambil data membership/keanggotaan lengkap satu user: profil, statistik aktivitas (total booking, total jam, total spend), program yang diikuti (status membership), match yang diikuti, hadiah, daily sign-in, coins. Untuk pertanyaan detail tentang aktivitas/membership satu pengguna.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "UUID user_id" },
          email: { type: "string", description: "Email user (partial match)" },
          search: { type: "string", description: "Nama/username user (partial)" },
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
      name: "query_matches",
      description:
        "Ambil data match/pertandingan: daftar match, status (open/locked/completed/invalid), join requests pending, undangan pending, voting hasil.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["all", "open", "locked", "completed", "invalid"], description: "Filter status match" },
          matchId: { type: "string", description: "UUID matches.id untuk detail satu match" },
          limit: { type: "number", description: "Maks baris (default 20)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_tournaments",
      description:
        "Ambil data turnamen: daftar turnamen, status, jumlah tim, tim yang menunggu review.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter status (open, registration, in_progress, dll) — partial match" },
          tournamentId: { type: "string", description: "UUID tournaments.id untuk detail satu turnamen" },
          limit: { type: "number", description: "Maks baris (default 20)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_programs",
      description:
        "Ambil data program/kelas: daftar program, peserta, tingkat okupansi, status aktif/archived.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter status program (archived, cancelled, active, dll)" },
          programId: { type: "string", description: "UUID programs.id untuk detail satu program" },
          limit: { type: "number", description: "Maks baris (default 20)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_instructors",
      description:
        "Ambil data instruktur: daftar instruktur, tarif per jam, rating, ketersediaan (open_to_book), program yang diajar.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Cari nama atau bio instruktur (partial)" },
          instructorId: { type: "string", description: "UUID instructors.id untuk detail satu instruktur" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_notifications",
      description:
        "Ambil data notifikasi: daftar notifikasi terbaru, read rate, filter per user/tipe.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "Filter notifikasi milik user tertentu" },
          type: { type: "string", description: "Filter tipe notifikasi (booking, match, payment, dll)" },
          limit: { type: "number", description: "Maks baris (default 30)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_court_schedule",
      description:
        "Ambil jadwal & okupansi court: booking per hari atau rentang, estimasi okupansi persen, total jam terpakai.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Tanggal spesifik YYYY-MM-DD (default hari ini)" },
          from: { type: "string", description: "Tanggal awal rentang YYYY-MM-DD" },
          to: { type: "string", description: "Tanggal akhir rentang YYYY-MM-DD" },
          court: { type: "number", description: "Filter court number tertentu" },
        },
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
- Menjawab pertanyaan match/pertandingan: status, join request, undangan, voting hasil.
- Menjawab pertanyaan turnamen: daftar, status, tim terdaftar, tim perlu review.
- Menjawab pertanyaan program/kelas: peserta, okupansi, instruktur terkait.
- Menjawab pertanyaan instruktur: tarif, rating, ketersediaan, program yang diajar.
- Menjawab pertanyaan notifikasi: daftar, read rate, filter per user/tipe.
- Menjawab pertanyaan jadwal & okupansi court: booking per hari/rentang, estimasi okupansi.
- Menyebut **nama + email + user_id** saat membahas pengguna (jangan hanya UUID tanpa konteks).
- Menyebut **booking ID (court_bookings.id)** saat membahas reservasi tertentu.
- Saran promosi berdasarkan angka snapshot.
- PDF laporan keuangan via export_finance_pdf.

## Aturan wajib
- Bahasa Indonesia kecuali diminta lain.
- Jika tool mengembalikan \`dataAvailable: false\` atau \`ok: false\`, jawab singkat bahwa **Anda tidak dapat menampilkan data tersebut saat ini** — jangan sebut error SQL, kolom database, atau stack trace.
- **Jangan mengarang angka atau nama.** Jika pertanyaan butuh daftar/nama/jumlah spesifik, panggil tool yang sesuai.
- Snapshot di bawah adalah ringkasan; untuk detail terbaru atau filter spesifik selalu gunakan tool.
- Uang dalam IDR.
- Rank pemain: beginner (0–19 poin), bronze (20+), silver (40+), gold (70+), platinum (90+) — kolom profiles.rank & total_score.

## Kamus data (penting)
- court_bookings.id = ID reservasi yang admin maksud dengan "booking id".
- profiles.user_id = ID pengguna (sama dengan auth).
- matches.id = ID pertandingan.
- tournaments.id = ID turnamen.
- programs.id = ID program/kelas.
- instructors.id = ID instruktur.
- Transaksi aktif di tabel: lihat operations.transactionDataSource.
- reference_id pada transaksi sering = court_bookings.id untuk pembayaran booking.

## Tool yang tersedia & kapan dipakai
| Pertanyaan tentang | Tool |
|---|---|
| Jumlah/daftar transaksi, keuangan, filter tanggal | query_transactions |
| Reservasi, top booker, filter tanggal/tipe | query_bookings |
| Cari user by email/nama/UUID/role/rank | lookup_user |
| Statistik pengguna (total, per role, per rank, aktif) | query_users_stats |
| Membership/aktivitas detail satu user | query_user_membership |
| Match/pertandingan, join request, undangan | query_matches |
| Turnamen, tim, review | query_tournaments |
| Program/kelas, peserta, okupansi | query_programs |
| Instruktur, tarif, rating | query_instructors |
| Notifikasi, read rate | query_notifications |
| Jadwal court, okupansi per hari/rentang | query_court_schedule |
| Laporan PDF keuangan | export_finance_pdf |
| Refresh KPI snapshot | refresh_dashboard_snapshot |

## Contoh penggunaan tool
- "Berapa total user?" → query_users_stats
- "Ada berapa superadmin?" → query_users_stats role superadmin
- "User dengan rank ciamik?" → query_users_stats rank ciamik ATAU lookup_user rank ciamik (untuk daftar nama)
- "User aktif 7 hari terakhir?" → query_users_stats activeDays 7
- "Siapa saja yang role superadmin?" → lookup_user role superadmin
- "Data membership user X?" → query_user_membership search X
- "Berapa total jam booking user Y?" → query_user_membership search Y
- "Program apa yang diikuti user Z?" → query_user_membership search Z
- "Transaksi tanggal 15 Mei 2026?" → query_transactions dateFrom 2026-05-15 dateTo 2026-05-15
- "Transaksi bulan ini yang pending?" → query_transactions period month status pending
- "Booking tanggal 20 Mei?" → query_bookings dateFrom 2026-05-20 dateTo 2026-05-20
- "Booking tipe match minggu ini?" → query_bookings period week bookingType match
- "Berapa match yang open?" → query_matches status open
- "Turnamen yang buka registrasi?" → query_tournaments status registration
- "Program mana yang paling penuh?" → query_programs (sort by occupancyPct)
- "Siapa instruktur rating tertinggi?" → query_instructors
- "Berapa okupansi court minggu ini?" → query_court_schedule from [senin] to [minggu]
- "Notifikasi yang belum dibaca user X?" → query_notifications userId X
- "User paling sering booking" → query_bookings topBookersLimit 10

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
        dateFrom: typeof args.dateFrom === "string" ? args.dateFrom : undefined,
        dateTo: typeof args.dateTo === "string" ? args.dateTo : undefined,
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
        dateFrom: typeof args.dateFrom === "string" ? args.dateFrom : undefined,
        dateTo: typeof args.dateTo === "string" ? args.dateTo : undefined,
        bookingType: typeof args.bookingType === "string" ? args.bookingType : undefined,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "lookup_user") {
      const data = await lookupUserForAi({
        userId: typeof args.userId === "string" ? args.userId : undefined,
        email: typeof args.email === "string" ? args.email : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
        role: typeof args.role === "string" ? args.role : undefined,
        rank: typeof args.rank === "string" ? args.rank : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_users_stats") {
      const data = await queryUsersStatsForAi({
        role: typeof args.role === "string" ? args.role : undefined,
        rank: typeof args.rank === "string" ? args.rank : undefined,
        onboarded: typeof args.onboarded === "boolean" ? args.onboarded : undefined,
        activeDays: typeof args.activeDays === "number" ? args.activeDays : undefined,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_user_membership") {
      const data = await queryUserMembershipForAi({
        userId: typeof args.userId === "string" ? args.userId : undefined,
        email: typeof args.email === "string" ? args.email : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_matches") {
      const data = await queryMatchesForAi({
        status: typeof args.status === "string" ? args.status : undefined,
        matchId: typeof args.matchId === "string" ? args.matchId : undefined,
        limit: typeof args.limit === "number" ? args.limit : 20,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_tournaments") {
      const data = await queryTournamentsForAi({
        status: typeof args.status === "string" ? args.status : undefined,
        tournamentId: typeof args.tournamentId === "string" ? args.tournamentId : undefined,
        limit: typeof args.limit === "number" ? args.limit : 20,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_programs") {
      const data = await queryProgramsForAi({
        status: typeof args.status === "string" ? args.status : undefined,
        programId: typeof args.programId === "string" ? args.programId : undefined,
        limit: typeof args.limit === "number" ? args.limit : 20,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_instructors") {
      const data = await queryInstructorsForAi({
        search: typeof args.search === "string" ? args.search : undefined,
        instructorId: typeof args.instructorId === "string" ? args.instructorId : undefined,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_notifications") {
      const data = await queryNotificationsForAi({
        userId: typeof args.userId === "string" ? args.userId : undefined,
        type: typeof args.type === "string" ? args.type : undefined,
        limit: typeof args.limit === "number" ? args.limit : 30,
      });
      return { result: JSON.stringify({ ok: true, dataAvailable: true, ...data }, null, 2), attachments, snapshot: snap };
    }

    if (name === "query_court_schedule") {
      const data = await queryCourtScheduleForAi({
        date: typeof args.date === "string" ? args.date : undefined,
        from: typeof args.from === "string" ? args.from : undefined,
        to: typeof args.to === "string" ? args.to : undefined,
        court: typeof args.court === "number" ? args.court : undefined,
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
