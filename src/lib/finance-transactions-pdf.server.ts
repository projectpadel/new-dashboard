import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { FinanceRecentRow } from "@/lib/admin-finance.functions";
import {
  describeTransactionFilters,
  referenceTypeLabel,
  type FinanceTransactionsFilterInput,
} from "@/lib/finance-reference-types";

const FINANCE_TZ = "Asia/Jakarta";

/** A4 landscape (points). */
const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 40;
const ROW_H = 14;
const BODY_SIZE = 8;
const TITLE_SIZE = 14;
const META_SIZE = 9;

const LEDGER_KIND_LABEL: Record<string, string> = {
  court_booking: "Court booking",
  match_backfill_total: "Match (backfill)",
};

const COLUMNS: { label: string; width: number }[] = [
  { label: "Waktu", width: 118 },
  { label: "Jenis / referensi", width: 178 },
  { label: "Referensi", width: 88 },
  { label: "Status", width: 72 },
  { label: "Jumlah", width: 92 },
];

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function typeLabel(row: FinanceRecentRow): string {
  if (row.ledger_kind) return LEDGER_KIND_LABEL[row.ledger_kind] ?? row.ledger_kind;
  return referenceTypeLabel(row.reference_type);
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { timeZone: FINANCE_TZ });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function cellTexts(row: FinanceRecentRow): string[] {
  return [
    formatCreatedAt(row.created_at),
    typeLabel(row),
    row.reference_id ? `${row.reference_id.slice(0, 8)}…` : "—",
    String(row.status),
    fmtIDR(row.amount_idr),
  ];
}

export async function buildTransactionsListPdf(
  rows: FinanceRecentRow[],
  filters?: FinanceTransactionsFilterInput,
  opts?: { truncated?: boolean; exportCap?: number },
): Promise<{ base64: string; filename: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    size: number,
    bold = false,
    color = rgb(0.12, 0.14, 0.18),
  ) => {
    page.drawText(text, {
      x,
      y: yPos - size,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  const drawTableHeader = () => {
    let x = MARGIN;
    const headerY = y;
    page.drawRectangle({
      x: MARGIN,
      y: headerY - ROW_H,
      width: PAGE_W - MARGIN * 2,
      height: ROW_H,
      color: rgb(0.12, 0.14, 0.18),
    });
    for (const col of COLUMNS) {
      drawText(col.label, x + 2, headerY - 2, BODY_SIZE, true, rgb(1, 1, 1));
      x += col.width;
    }
    y -= ROW_H;
  };

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    drawTableHeader();
  };

  drawText("Riwayat Transaksi", MARGIN, y, TITLE_SIZE, true);
  y -= 18;
  drawText(`Filter: ${describeTransactionFilters(filters)}`, MARGIN, y, META_SIZE, false, rgb(0.35, 0.38, 0.42));
  y -= 12;
  drawText(
    `Dibuat: ${new Date().toLocaleString("id-ID", { timeZone: FINANCE_TZ })} · ${rows.length} baris`,
    MARGIN,
    y,
    META_SIZE,
    false,
    rgb(0.35, 0.38, 0.42),
  );
  y -= 16;

  drawTableHeader();

  for (let i = 0; i < rows.length; i++) {
    if (y < MARGIN + ROW_H) newPage();

    if (i % 2 === 0) {
      page.drawRectangle({
        x: MARGIN,
        y: y - ROW_H,
        width: PAGE_W - MARGIN * 2,
        height: ROW_H,
        color: rgb(0.96, 0.97, 0.98),
      });
    }

    const texts = cellTexts(rows[i]);
    let x = MARGIN;
    for (let c = 0; c < COLUMNS.length; c++) {
      const maxChars = Math.floor(COLUMNS[c].width / (BODY_SIZE * 0.45));
      drawText(truncate(texts[c], maxChars), x + 2, y - 2, BODY_SIZE);
      x += COLUMNS[c].width;
    }
    y -= ROW_H;
  }

  if (opts?.truncated && opts.exportCap) {
    if (y < MARGIN + 20) newPage();
    drawText(
      `Hanya ${opts.exportCap.toLocaleString("id-ID")} baris terbaru yang disertakan (batas ekspor).`,
      MARGIN,
      y,
      META_SIZE,
      false,
      rgb(0.45, 0.48, 0.52),
    );
  }

  const bytes = await doc.save();
  const base64 = Buffer.from(bytes).toString("base64");
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `riwayat-transaksi-${stamp}.pdf`;

  return { base64, filename };
}
