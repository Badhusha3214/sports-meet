"use client";

import { cx } from "@/lib/util";

// Shared by the staff Points Table and the public /live page so both rank the same way.

export interface Medals {
  gold: number;
  silver: number;
  bronze: number;
  points: number;
}

/** Points per school per category, as returned by school_category_points(). */
export interface CategoryPoints extends Medals {
  school_id: number;
  category_id: number;
}

export interface Standing extends Medals {
  schoolId: number;
  school: string;
}

export interface AthleteScore extends Medals {
  athleteId: number;
  name: string;
  bib: number | null;
  school: string;
  categoryId: number;
  wins: string[];
}

interface CategoryLike {
  id: number;
  name: string;
  counts_for_points: boolean;
}

export const byMedals = (a: Medals, b: Medals) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze;

/**
 * One row per school, ranked by points, then golds, silvers, bronzes.
 * Overall (categoryId = null) adds up only the categories that count; otherwise just that category.
 */
export function buildStandings(
  schools: { id: number; name: string }[],
  categories: CategoryLike[],
  rows: CategoryPoints[],
  categoryId: number | null,
): Standing[] {
  const counted = new Set(categoryId !== null ? [categoryId] : categories.filter((c) => c.counts_for_points).map((c) => c.id));
  return schools
    .map((s) => {
      const mine = rows.filter((r) => r.school_id === s.id && counted.has(r.category_id));
      const total = (k: keyof Medals) => mine.reduce((n, r) => n + r[k], 0);
      return { schoolId: s.id, school: s.name, gold: total("gold"), silver: total("silver"), bronze: total("bronze"), points: total("points") };
    })
    .sort((a, b) => byMedals(a, b) || a.school.localeCompare(b.school));
}

/** Ranked athletes of a category and its champion(s) — joint champions when fully tied. */
export function championsOf(scores: AthleteScore[], categoryId: number) {
  const ranked = scores.filter((s) => s.categoryId === categoryId).sort((a, b) => byMedals(a, b) || a.name.localeCompare(b.name));
  const champions = ranked.length && ranked[0].points > 0 ? ranked.filter((s) => byMedals(s, ranked[0]) === 0) : [];
  return { ranked, champions };
}

/** Champion of a category in a gold box, followed by the next few athletes. */
export function ChampionCard({ category, scores, top }: { category: CategoryLike; scores: AthleteScore[]; top: number }) {
  const { ranked, champions } = championsOf(scores, category.id);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-bold">{category.name}</h3>
        <span className="text-xs text-slate-500">Individual champion</span>
      </div>
      {!champions.length ? (
        <p className="text-sm text-slate-500">No individual results yet.</p>
      ) : (
        <>
          {champions.map((s) => (
            <div key={s.athleteId} className="mb-2 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏃</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {s.name} {champions.length > 1 && <span className="text-xs font-normal text-amber-700">(joint)</span>}
                  </div>
                  <div className="truncate text-xs text-slate-600">
                    {s.bib ? `Bib ${s.bib} · ` : ""}
                    {s.school}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-blue-800">{s.points}</div>
                  <div className="text-[11px] text-slate-500">
                    🥇{s.gold} 🥈{s.silver} 🥉{s.bronze}
                  </div>
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-600">{s.wins.join(" · ")}</div>
            </div>
          ))}
          {ranked.length > champions.length && (
            <table className="w-full text-xs">
              <tbody>
                {ranked.slice(champions.length, top).map((s) => (
                  <tr key={s.athleteId} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                    <td className="truncate pr-2 text-slate-500">{s.school}</td>
                    <td className="whitespace-nowrap pr-2 text-slate-500">
                      🥇{s.gold} 🥈{s.silver} 🥉{s.bronze}
                    </td>
                    <td className="text-right font-bold text-blue-800">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

/** Overall / Individual Champions / one chip per category. */
export type StandingsView = "overall" | "individual" | number;

export function ViewChips({
  categories,
  view,
  onChange,
  count,
}: {
  categories: CategoryLike[];
  view: StandingsView;
  onChange: (v: StandingsView) => void;
  count?: (categoryId: number) => number;
}) {
  const chip = (active: boolean, muted = false) =>
    cx(
      "rounded-full px-4 py-2 text-sm font-semibold",
      active ? "bg-blue-700 text-white" : "border border-slate-300 bg-white hover:border-blue-400",
      muted && !active && "text-slate-500",
    );
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button onClick={() => onChange("overall")} className={cx(chip(view === "overall"), "font-bold")}>
        🏆 Overall
      </button>
      <button onClick={() => onChange("individual")} className={cx(chip(view === "individual"), "font-bold")}>
        🏃 Individual Champions
      </button>
      {categories.map((c) => (
        <button key={c.id} onClick={() => onChange(c.id)} className={chip(view === c.id, !c.counts_for_points)}>
          {c.name}
          {count && <span className={cx("ml-1.5 text-xs", view === c.id ? "text-blue-100" : "text-slate-400")}>{count(c.id)}</span>}
        </button>
      ))}
    </div>
  );
}

/** School ranking table. */
export function StandingTable({ standings }: { standings: Standing[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Rank</th>
            <th className="px-3 py-2">School</th>
            <th className="px-3 py-2 text-center">🥇</th>
            <th className="px-3 py-2 text-center">🥈</th>
            <th className="px-3 py-2 text-center">🥉</th>
            <th className="px-3 py-2 text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {standings.map((s, i) => (
            <tr key={s.schoolId} className={i === 0 && s.points > 0 ? "bg-yellow-50" : undefined}>
              <td className="px-3 py-2 font-bold text-slate-500">{s.points > 0 && i === 0 ? "🥇" : i + 1}</td>
              <td className="px-3 py-2 font-semibold">{s.school}</td>
              <td className="px-3 py-2 text-center">{s.gold}</td>
              <td className="px-3 py-2 text-center">{s.silver}</td>
              <td className="px-3 py-2 text-center">{s.bronze}</td>
              <td className="px-3 py-2 text-right text-lg font-bold text-blue-800">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
