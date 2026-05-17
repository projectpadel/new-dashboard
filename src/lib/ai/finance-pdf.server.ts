import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DashboardAiSnapshot } from "@/lib/ai/dashboard-snapshot.server";

export type FinanceReportKind = "weekly" | "monthly";

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = w.length > maxChars ? w.slice(0, maxChars) : w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildFinanceReportPdf(
  snapshot: DashboardAiSnapshot,
  kind: FinanceReportKind,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const { height } = page.getSize();
  let y = height - 56;
  const left = 48;
  const lineHeight = 14;

  const draw = (text: string, bold = false, size = 11) => {
    for (const ln of wrapLines(text, 88)) {
      if (y < 48) break;
      page.drawText(ln, {
        x: left,
        y,
        size,
        font: bold ? fontBold : font,
        color: rgb(0.12, 0.14, 0.18),
      });
      y -= lineHeight;
    }
  };

  const week = snapshot.finance.weeklyPeriod;
  const month = snapshot.finance.monthlyPeriod;
  const title =
    kind === "weekly" ? "Laporan Keuangan Mingguan" : "Laporan Keuangan Bulanan";

  const fmt = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
      n,
    );

  draw("Padel Club — Dashboard Admin", true, 13);
  draw(title, true, 12);
  draw(`Dibuat: ${new Date(snapshot.generatedAt).toLocaleString("id-ID", { timeZone: snapshot.timezone })}`);
  draw(`Zona waktu: ${snapshot.timezone}`);
  y -= 6;
  draw(`Sumber transaksi: ${snapshot.finance.dataSource}`);
  if (kind === "weekly") {
    draw(`Pendapatan 7 hari terakhir: ${week.revenueFormatted}`);
    draw(`Pending: ${fmt(week.pendingIdr)}`);
    draw(`Refund: ${fmt(week.refundIdr)}`);
  } else {
    draw(`Pendapatan bulan berjalan: ${fmt(month.revenueIdr)}`);
  }
  const delta = kind === "weekly" ? week.deltaVsPreviousPct : month.deltaVsPreviousPct;
  draw(
    delta != null
      ? `Perubahan vs periode sebelumnya: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`
      : "Perubahan vs periode sebelumnya: n/a",
  );
  y -= 8;
  draw("Ringkasan keseluruhan", true);
  draw(`Total pendapatan (all time): ${snapshot.finance.totalRevenueAllTimeFormatted}`);
  draw(
    `MTD — pendapatan: ${snapshot.finance.monthToDate.revenueFormatted}, reservasi: ${snapshot.finance.monthToDate.bookings}`,
  );
  y -= 8;
  if (kind === "weekly" && snapshot.finance.weeklyPeriod.dailyTrend.length) {
    draw("Tren harian (7 hari)", true);
    for (const row of snapshot.finance.weeklyPeriod.dailyTrend) {
      draw(
        `${row.date}: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(row.amountIdr)}`,
      );
    }
  } else if (kind === "monthly") {
    draw("12 bulan terakhir (pendapatan)", true);
    for (const m of snapshot.finance.last12Months.slice(-6)) {
      draw(
        `${m.label}: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(m.revenueIdr)} · ${m.bookings} booking`,
      );
    }
  }
  y -= 8;
  draw("Pengguna", true);
  draw(
    `Total profil: ${snapshot.users.totalProfiles} · Aktif 7 hari: ${snapshot.users.activeLast7Days} · Aktif 30 hari: ${snapshot.users.activeLast30Days} · Onboarded: ${snapshot.users.onboardedPct}%`,
  );

  const dateSlug = snapshot.generatedAt.slice(0, 10);
  const filename =
    kind === "weekly"
      ? `laporan-keuangan-mingguan-${dateSlug}.pdf`
      : `laporan-keuangan-bulanan-${dateSlug}.pdf`;

  return { bytes: await doc.save(), filename };
}
