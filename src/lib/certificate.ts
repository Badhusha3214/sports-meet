import { jsPDF } from "jspdf";
import type { MeetSnapshot } from "@/lib/load";
import type { Athlete, Category, MeetEvent, RelayTeam, Result, School, Settings } from "@/lib/types";
import { fmtDate, POSITION_LABEL, POSITION_WORD } from "@/lib/util";

export interface CertificateData {
  kind: "merit" | "participation";
  name: string;
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
}

export function certificatesPdf(certs: CertificateData[], settings: Settings | null): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  certs.forEach((c, i) => {
    if (i > 0) doc.addPage();
    drawCertificate(doc, c, settings);
  });
  return doc;
}

export function downloadCertificates(certs: CertificateData[], settings: Settings | null, filename: string) {
  if (!certs.length) return;
  certificatesPdf(certs, settings).save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}

/** Object URL of a single-certificate PDF, for live preview in an iframe. */
export function certificatePreviewUrl(cert: CertificateData, settings: Settings | null): string {
  const blob = certificatesPdf([cert], settings).output("blob");
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

export type KeyedCertificate = CertificateData & { key: string; resultId?: number; schoolId: number };

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
          .sort((a, b) => a.leg - b.leg)
          .forEach((m) => {
            const a = athletes.get(m.athlete_id);
            if (a) people.push(a);
          });
    }
    for (const a of people)
      out.push({
        ...base,
        key: `m-${r.id}-${a.id}`,
        resultId: r.id,
        schoolId: a.school_id,
        name: a.name,
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
      schoolId: a.school_id,
      name: a.name,
      school: l.schoolById.get(a.school_id)?.name ?? "",
      category: l.categoryById.get(a.category_id)?.name ?? "",
      event: evNames.get(a.id)!.join(", "),
      bib: a.bib,
    }));
}
