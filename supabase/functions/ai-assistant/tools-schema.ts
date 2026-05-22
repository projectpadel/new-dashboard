export const OPENAI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_users",
      description:
        "Statistik & daftar pengguna teragregasi. Filter role/rank/search. Jika filter aktif, gunakan matched_users & totals.filtered.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string" },
          rank: { type: "string" },
          search: { type: "string", description: "Nama/username/email partial" },
          membership_tier: { type: "string", enum: ["basic", "gold"] },
          active_days: { type: "number", description: "User aktif N hari terakhir" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_bookings",
      description:
        "Reservasi court teragregasi: totals, by_type, by_day_of_week, top_bookers, recent. Filter tanggal/period/tipe.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["week", "month", "all"] },
          date_from: { type: "string" },
          date_to: { type: "string" },
          booking_type: { type: "string", enum: ["match", "program", "program_league_match"] },
          user_id: { type: "string" },
          booking_id: { type: "string" },
          top_limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_transactions",
      description:
        "WAJIB untuk mutasi/transaksi/pendapatan/keuangan. Ambil data transaksi (tabel transaksi) + counts, total_amount_idr, total_revenue_success_idr (pendapatan sukses), by_status. Tanggal: YYYY-MM-DD atau 20/05/2026. Mutasi tanpa tanggal: period month atau all.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["week", "month", "all"], description: "Rentang default jika tanpa tanggal spesifik" },
          date: { type: "string", description: "Satu hari: 2026-05-20 atau 20/05/2026" },
          date_from: { type: "string" },
          date_to: { type: "string" },
          status: { type: "string", enum: ["all", "success", "pending", "refund"] },
          user_id: { type: "string" },
          booking_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_programs",
      description: "Program/kelas: per_program occupancy, top_full, low_occupancy.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          program_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_matches",
      description: "Match: by_status, funnel KPIs, recent_matches.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["all", "open", "locked", "completed", "invalid"] },
          match_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_court_schedule",
      description: "Okupansi & jadwal court per rentang tanggal: by_date, peak_hour, sample bookings.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string" },
          date_from: { type: "string" },
          date_to: { type: "string" },
          court: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_membership",
      description: "Profil & aktivitas lengkap satu user (booking, program, match, signin).",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          email: { type: "string" },
          search: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_pdf_report",
      description: "Buat PDF tabel dari columns + rows yang Anda susun dari data tool.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          summary: { type: "string" },
          columns: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: "string" } } },
        },
        required: ["title", "columns", "rows"],
      },
    },
  },
];
