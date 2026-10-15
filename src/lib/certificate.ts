import { jsPDF } from "jspdf";
import type { MeetSnapshot } from "@/lib/load";
import type { Athlete, Category, Gender, MeetEvent, RelayTeam, Result, School, Settings } from "@/lib/types";
import { fmtDate, POSITION_LABEL, POSITION_WORD } from "@/lib/util";

export interface CertificateData {
  kind: "merit" | "participation";
  name: string;
  /** Boys → "Master", Girls → "Kumari" on the victory template. */
  gender?: Gender;
  /** Printed certificate number, e.g. W00042-00137-7F3A. Filled in when the PDF is built if missing. */
  number?: string;
  school: string;
  category: string;
  /** Event name for merit; comma-separated event list for participation. */
  event: string;
  position?: 1 | 2 | 3;
  performance?: string;
  bib?: number | null;
}

const NAVY: [number, number, number] = [18, 59, 104];
const GOLD: [number, number, number] = [184, 134, 11];
const MEDAL: Record<number, [number, number, number]> = {
  1: [212, 175, 55],
  2: [168, 169, 173],
  3: [176, 112, 62],
};

/** Draws the default certificate template on the current page (A4 landscape). */
function drawCertificate(doc: jsPDF, c: CertificateData, s: Settings | null) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const cx = W / 2;

  // Borders
  doc.setFillColor(253, 251, 245);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(3);
  doc.rect(8, 8, W - 16, H - 16);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.rect(13, 13, W - 26, H - 26);
  doc.setLineWidth(0.3);
  doc.rect(15, 15, W - 30, H - 30);

  // Header
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text((s?.meet_name || "Interschool Sports Meet").toUpperCase(), cx, 33, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80);
  const sub = [s?.organiser, s?.venue].filter(Boolean).join(" • ");
  if (sub) doc.text(sub, cx, 40, { align: "center" });

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(32);
  doc.setTextColor(...GOLD);
  doc.text(c.kind === "merit" ? "CERTIFICATE OF MERIT" : "CERTIFICATE OF PARTICIPATION", cx, 58, { align: "center" });

  doc.setFont("times", "italic");
  doc.setFontSize(14);
  doc.setTextColor(60);
  doc.text("This certificate is proudly presented to", cx, 74, { align: "center" });

  // Name
  doc.setFont("times", "bold");
  doc.setFontSize(30);
  doc.setTextColor(20);
  doc.text(c.name.toUpperCase(), cx, 92, { align: "center", maxWidth: W - 70 });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(cx - 80, 96, cx + 80, 96);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(50);
  doc.text(`of ${c.school}`, cx, 106, { align: "center", maxWidth: W - 60 });

  // Achievement
  doc.setFont("times", "normal");
  doc.setFontSize(16);
  doc.setTextColor(30);
  const line =
    c.kind === "merit" && c.position
      ? `for securing ${POSITION_WORD[c.position]} PLACE in ${c.event} (${c.category})`
      : `for participating in ${c.event} (${c.category})`;
  const lines = doc.splitTextToSize(line, W - 70);
  doc.text(lines, cx, 121, { align: "center" });
  let y = 121 + lines.length * 7;
  doc.setFontSize(12);
  doc.setTextColor(80);
  const extra = [c.performance ? `Performance: ${c.performance}` : "", c.bib ? `Bib No. ${c.bib}` : ""]
    .filter(Boolean)
    .join("     ");
  if (extra) {
    doc.text(extra, cx, y + 2, { align: "center" });
    y += 8;
  }

  // Medal badge for winners
  if (c.kind === "merit" && c.position) {
    doc.setFillColor(...MEDAL[c.position]);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(1);
    doc.circle(W - 45, 45, 14, "FD");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(POSITION_LABEL[c.position], W - 45, 48, { align: "center" });
  }

  // Footer: date and signatures
  const footY = H - 34;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40);
  const cols = [W * 0.2, W * 0.5, W * 0.8];
  doc.text(fmtDate(s?.meet_date) || " ", cols[0], footY - 2, { align: "center" });
  doc.line(cols[0] - 30, footY, cols[0] + 30, footY);
  doc.text("Date", cols[0], footY + 6, { align: "center" });
  doc.line(cols[1] - 30, footY, cols[1] + 30, footY);
  doc.text(s?.director_name || "Meet Director / PE HOD", cols[1], footY + 6, { align: "center" });
  doc.line(cols[2] - 30, footY, cols[2] + 30, footY);
  doc.text(s?.principal_name || "Principal", cols[2], footY + 6, { align: "center" });

  if (c.number) {
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Certificate No: ${c.number}`, W - 20, H - 17, { align: "right" });
  }
}

// ---------------------------------------------------------------------------
// Certificate numbers: W<result>-<athlete>-<check> for winners, P<athlete>-<check> for participation.
// The check code must match public.certificate_check() in the database.
// ---------------------------------------------------------------------------

const pad5 = (n: number) => String(n).padStart(5, "0");

/** Full certificate number for a core like "W00042-00137" (adds the 4-character check code). */
export async function certificateNumber(core: string, salt: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${core}`));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${core}-${hex.slice(0, 4).toUpperCase()}`;
}

/** Adds certificate numbers to every certificate that has a core but no number yet. */
export async function withNumbers<T extends CertificateData & { core?: string }>(certs: T[], salt: string | undefined): Promise<T[]> {
  if (!salt) return certs;
  return Promise.all(certs.map(async (c) => (c.number || !c.core ? c : { ...c, number: await certificateNumber(c.core, salt) })));
}

// ---------------------------------------------------------------------------
// Victory certificate: the meet's own artwork (public/certificate-template.png, 1536×1024)
// with the athlete's details written onto it. Positions below are in template pixels.
// ---------------------------------------------------------------------------

const TEMPLATE_URL = "/certificate-template.png";
const TPL_W = 1536;
const TPL_H = 1024;
/** Page is the template's 3:2 shape, 297 mm wide (fits A4 landscape when printed). */
const PAGE_W = 297;
const PAGE_H = (PAGE_W * TPL_H) / TPL_W;
const PX = PAGE_W / TPL_W; // mm per template pixel

/** Printed placeholder text that gets replaced: "Master/ Kumari." and "FIRST/SECOND/THIRD in I/II/III/IV/V". */
const PLACEHOLDERS = [
  { x0: 148, x1: 410, y0: 497, y1: 542 },
  { x0: 318, x1: 1252, y0: 603, y1: 652 },
];

const INK: [number, number, number] = [22, 44, 102];
const RED: [number, number, number] = [178, 30, 40];

let templatePromise: Promise<string> | null = null;

/**
 * Loads the template once, paints over the placeholder text by blending the background just
 * above and below each area (keeps the watermark looking continuous), and returns a JPEG data URL.
 */
function loadTemplate(): Promise<string> {
  templatePromise ??= new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TPL_W;
      canvas.height = TPL_H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, TPL_W, TPL_H);
      for (const r of PLACEHOLDERS) {
        const w = r.x1 - r.x0;
        const h = r.y1 - r.y0;
        const above = ctx.getImageData(r.x0, r.y0 - 3, w, 1).data;
        const below = ctx.getImageData(r.x0, r.y1 + 3, w, 1).data;
        const patch = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++) {
          const t = (y + 1) / (h + 1);
          for (let x = 0; x < w; x++) {
            for (let ch = 0; ch < 3; ch++) {
              patch.data[(y * w + x) * 4 + ch] = above[x * 4 + ch] * (1 - t) + below[x * 4 + ch] * t;
            }
            patch.data[(y * w + x) * 4 + 3] = 255;
          }
        }
        ctx.putImageData(patch, r.x0, r.y0);
      }
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      templatePromise = null;
      reject(new Error("Could not load the certificate template image."));
    };
    img.src = TEMPLATE_URL;
  });
  return templatePromise;
}

/** Writes text centred on (cx, y), shrinking the font until it fits maxW. */
function fitText(doc: jsPDF, text: string, cx: number, y: number, maxW: number, size: number) {
  let s = size;
  doc.setFontSize(s);
  while (s > 8 && doc.getTextWidth(text) > maxW) doc.setFontSize((s -= 0.5));
  doc.text(text, cx, y, { align: "center" });
}

function drawVictory(doc: jsPDF, c: CertificateData, template: string) {
  doc.addImage(template, "JPEG", 0, 0, PAGE_W, PAGE_H, "victory-template", "FAST");
  doc.setTextColor(...INK);

  // "Master." / "Kumari." where the template printed both options.
  doc.setFont("times", "italic");
  doc.setFontSize(23);
  doc.text(c.gender === "Girls" ? "Kumari." : "Master.", 160 * PX, 528 * PX);

  // Name on the first line, school on the second (the template already prints "School" after it).
  doc.setFont("times", "bold");
  fitText(doc, c.name.toUpperCase(), 894 * PX, 519 * PX, 940 * PX, 25);
  const school = c.school.replace(/\s+school\s*$/i, "");
  fitText(doc, school.toUpperCase(), 735 * PX, 573 * PX, 1050 * PX, 19);

  // "for having secured FIRST in 100m, SUB JUNIOR - BOYS" — the next printed line continues "Category in the …".
  const parts: { text: string; style: string; color: [number, number, number] }[] = [
    { text: "for having secured ", style: "italic", color: INK },
    { text: c.position ? POSITION_WORD[c.position] : "", style: "bold", color: RED },
    { text: ` in ${c.event}, ${c.category}`, style: "italic", color: INK },
  ];
  let size = 23;
  const widthAt = () =>
    parts.reduce((w, p) => {
      doc.setFont("times", p.style);
      doc.setFontSize(size);
      return w + doc.getTextWidth(p.text);
    }, 0);
  while (size > 9 && widthAt() > 920 * PX) size -= 0.5;
  let x = 768 * PX - widthAt() / 2;
  for (const p of parts) {
    doc.setFont("times", p.style);
    doc.setFontSize(size);
    doc.setTextColor(...p.color);
    doc.text(p.text, x, 637 * PX);
    x += doc.getTextWidth(p.text);
  }

  if (c.number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(`Certificate No: ${c.number}`, 768 * PX, 968 * PX, { align: "center" });
  }
}

/**
 * Builds a PDF with one certificate per page: winners on the meet's victory template,
 * participation on the built-in design.
 */
export async function certificatesPdf(
  input: (CertificateData & { core?: string })[],
  settings: Settings | null,
): Promise<jsPDF> {
  const certs = await withNumbers(input, settings?.cert_salt);
  const template = certs.some((c) => c.kind === "merit") ? await loadTemplate() : null;
  const pageOf = (c: CertificateData): [number, number] => (c.kind === "merit" ? [PAGE_W, PAGE_H] : [297, 210]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: pageOf(certs[0]) });
  certs.forEach((c, i) => {
    if (i > 0) doc.addPage(pageOf(c), "landscape");
    if (c.kind === "merit" && template) drawVictory(doc, c, template);
    else drawCertificate(doc, c, settings);
  });
  return doc;
}

export async function downloadCertificates(certs: CertificateData[], settings: Settings | null, filename: string) {
  if (!certs.length) return;
  (await certificatesPdf(certs, settings)).save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}

/** Object URL of a single-certificate PDF, for live preview in an iframe. */
export async function certificatePreviewUrl(cert: CertificateData, settings: Settings | null): Promise<string> {
  const blob = (await certificatesPdf([cert], settings)).output("blob");
  return URL.createObjectURL(blob);
}

export function safeFileName(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
}

export interface Lookups {
  schoolById: Map<number, School>;
  categoryById: Map<number, Category>;
  eventById: Map<number, MeetEvent>;
}

export type KeyedCertificate = CertificateData & {
  key: string;
  /** Certificate number without its check code, e.g. "W00042-00137". */
  core: string;
  resultId?: number;
  schoolId: number;
};

/** One merit certificate per placed athlete; relay results give one per team member. */
export function meritCertificates(results: Result[], snap: MeetSnapshot, l: Lookups): KeyedCertificate[] {
  const athletes = new Map(snap.athletes.map((a) => [a.id, a]));
  const teams = new Map(snap.teams.map((t) => [t.id, t]));
  const out: KeyedCertificate[] = [];
  for (const r of results) {
    const ev = l.eventById.get(r.event_id);
    if (!ev) continue;
    const category = l.categoryById.get(ev.category_id)?.name ?? "";
    const base = { kind: "merit" as const, category, event: ev.name, position: r.position, performance: r.performance };
    const people: Athlete[] = [];
    if (r.athlete_id) {
      const a = athletes.get(r.athlete_id);
      if (a) people.push(a);
    } else if (r.relay_team_id) {
      const team: RelayTeam | undefined = teams.get(r.relay_team_id);
      if (team)
        snap.members
          .filter((m) => m.team_id === team.id)
          .forEach((m) => {
            const a = athletes.get(m.athlete_id);
            if (a) people.push(a);
          });
    }
    for (const a of people)
      out.push({
        ...base,
        key: `m-${r.id}-${a.id}`,
        core: `W${pad5(r.id)}-${pad5(a.id)}`,
        resultId: r.id,
        schoolId: a.school_id,
        name: a.name,
        gender: a.gender,
        school: l.schoolById.get(a.school_id)?.name ?? "",
        bib: a.bib,
      });
  }
  return out;
}

/** One participation certificate per athlete, listing all their events (individual and relay). */
export function participationCertificates(snap: MeetSnapshot, l: Lookups): KeyedCertificate[] {
  const evNames = new Map<number, string[]>();
  for (const e of snap.entries) {
    const ev = l.eventById.get(e.event_id);
    if (ev) evNames.set(e.athlete_id, [...(evNames.get(e.athlete_id) ?? []), ev.name]);
  }
  const teamEvent = new Map(snap.teams.map((t) => [t.id, t.event_id]));
  for (const m of snap.members) {
    const ev = l.eventById.get(teamEvent.get(m.team_id) ?? -1);
    if (ev) evNames.set(m.athlete_id, [...(evNames.get(m.athlete_id) ?? []), ev.name]);
  }
  return snap.athletes
    .filter((a) => evNames.has(a.id))
    .map((a) => ({
      kind: "participation" as const,
      key: `p-${a.id}`,
      core: `P${pad5(a.id)}`,
      schoolId: a.school_id,
      name: a.name,
      gender: a.gender,
      school: l.schoolById.get(a.school_id)?.name ?? "",
      category: l.categoryById.get(a.category_id)?.name ?? "",
      event: evNames.get(a.id)!.join(", "),
      bib: a.bib,
    }));
}
