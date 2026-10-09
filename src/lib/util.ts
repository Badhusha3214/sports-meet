import type { Category, Gender } from "@/lib/types";

/** ISO yyyy-mm-dd -> dd-mm-yyyy */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export const POSITION_LABEL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };
export const POSITION_WORD: Record<number, string> = { 1: "FIRST", 2: "SECOND", 3: "THIRD" };

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong.";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e && typeof e.message === "string") {
    const msg = e.message;
    if (msg.includes("athletes_no_duplicates")) return "This athlete is already registered (same name, school and DOB).";
    if (msg.includes("athletes_bib_key")) return "That bib number is already used by another athlete.";
    if (msg.includes("results_event_id_position_key")) return "That position is already taken in this event. Clear it first.";
    if (msg.includes("results_event_id_athlete_id_key") || msg.includes("results_event_id_relay_team_id_key"))
      return "This competitor already has a position in this event.";
    if (msg.includes("violates foreign key") && msg.includes("athletes"))
      return "This is still used by registered athletes, so it can't be deleted.";
    return msg;
  }
  return "Something went wrong.";
}

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Reads every row, paging past the API's 1000-row limit. */
export async function fetchAll<T>(build: (from: number, to: number) => Page<T>): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

/** Categories an athlete may enter, youngest (most specific) first. */
export function eligibleCategories(categories: Category[], gender: Gender | "", dob: string): Category[] {
  if (!gender || !dob) return [];
  return categories
    .filter((c) => c.gender === gender && dob >= c.dob_from && (!c.dob_to || dob <= c.dob_to))
    .sort((a, b) => b.dob_from.localeCompare(a.dob_from));
}

/** The default category is the youngest one the athlete qualifies for. */
export function defaultCategory(categories: Category[], gender: Gender | "", dob: string): Category | undefined {
  return eligibleCategories(categories, gender, dob)[0];
}

export function byText<T>(get: (x: T) => string) {
  return (a: T, b: T) => get(a).localeCompare(get(b));
}
