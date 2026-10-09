import * as XLSX from "xlsx";
import { pad } from "@/lib/util";

export type Cell = string | number | null | undefined;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

/** Downloads an .xlsx workbook. The first row of each sheet is treated as the header. */
export function downloadExcel(filename: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.map((r) => r.map((c) => c ?? "")));
    const header = s.rows[0] ?? [];
    ws["!cols"] = header.map((_, i) => ({
      wch: Math.min(45, Math.max(8, ...s.rows.map((r) => String(r[i] ?? "").length + 2))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
}

export function normalizeHeader(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.]+/g, " ");
}

/** Reads the first sheet into objects keyed by normalised header text. */
export async function readFirstSheet(file: File): Promise<Record<string, unknown>[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return raw.map((r) => {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(r)) o[normalizeHeader(k)] = r[k];
    return o;
  });
}

export function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    const k = normalizeHeader(n);
    if (k in row && row[k] !== "") return row[k];
  }
  return "";
}

/**
 * Converts an Excel cell to ISO yyyy-mm-dd without timezone shifts.
 * Accepts Excel date serials, yyyy-mm-dd and dd-mm-yyyy / dd/mm/yyyy.
 */
export function excelDate(v: unknown): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d && d.y ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : "";
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return "";
}

function valid(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${pad(m)}-${pad(d)}`;
}
