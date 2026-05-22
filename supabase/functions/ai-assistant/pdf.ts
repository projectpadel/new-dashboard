import { jsPDF } from "npm:jspdf@2.5.2";
import autoTable from "npm:jspdf-autotable@3.8.4";

export type PdfReportInput = {
  title: string;
  subtitle?: string;
  summary?: string;
  columns: string[];
  rows: string[][];
};

export function buildPdfReport(input: PdfReportInput): { base64: string; filename: string } {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text(input.title, margin, y);
  y += 8;

  if (input.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(input.subtitle, margin, y);
    doc.setTextColor(0);
    y += 6;
  }

  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`, margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [input.columns],
    body: input.rows.map((r) => r.map(String)),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  if (input.summary) {
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(input.summary, 180);
    doc.text(lines, margin, finalY + 10);
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const safeTitle = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const filename = `${safeTitle}-${stamp}.pdf`;
  const dataUri = doc.output("datauristring");
  const base64 = dataUri.split(",")[1] ?? "";

  return { base64, filename };
}
