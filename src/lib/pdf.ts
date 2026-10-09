import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Cell } from "@/lib/excel";
import type { Settings } from "@/lib/types";
import { fmtDate } from "@/lib/util";

export interface PdfSection {
  heading?: string;
  head: string[];
  body: Cell[][];
  /** Start this section on a fresh page. */
  newPage?: boolean;
}

const NAVY: [number, number, number] = [18, 59, 104];

/** Downloads a PDF report made of one or more tables, with the meet name on every page. */
export function downloadTablePdf(opts: {
  filename: string;
  title: string;
  settings: Settings | null;
  sections: PdfSection[];
  landscape?: boolean;
}) {
  const doc = new jsPDF({ orientation: opts.landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const meet = opts.settings?.meet_name || "Interschool Sports Meet";
  const sub = [opts.settings?.venue, fmtDate(opts.settings?.meet_date)].filter(Boolean).join(" • ");

  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...NAVY);
    doc.text(meet.toUpperCase(), pageW / 2, 12, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    if (sub) doc.text(sub, pageW / 2, 17, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(opts.title, pageW / 2, 23, { align: "center" });
    doc.setFont("helvetica", "normal");
  };

  let y = 28;
  opts.sections.forEach((s, i) => {
    if (i > 0 && s.newPage) {
      doc.addPage();
      y = 28;
    }
    if (s.heading) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(s.heading, 14, y + 4);
      doc.setFont("helvetica", "normal");
      y += 6;
    }
    autoTable(doc, {
      startY: y,
      head: [s.head],
      body: s.body.map((r) => r.map((c) => (c ?? "") as string | number)),
      margin: { top: 28 },
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: NAVY },
      alternateRowStyles: { fillColor: [244, 247, 251] },
      didDrawPage: header,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${p} of ${pages}`, pageW - 14, doc.internal.pageSize.getHeight() - 6, { align: "right" });
  }
  doc.save(opts.filename.endsWith(".pdf") ? opts.filename : opts.filename + ".pdf");
}
