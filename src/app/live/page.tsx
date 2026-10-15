"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildStandings,
  ChampionCard,
  groupCategories,
  StandingTable,
  ViewChips,
  type AthleteScore,
  type CategoryPoints,
  type StandingsView,
} from "@/components/standings";
import { supabase } from "@/lib/supabase/client";
import type { EventKind, PointsRow } from "@/lib/types";
import { fmtDate, POSITION_LABEL } from "@/lib/util";

interface PublicResult {
  event_id: number;
  event: string;
  kind: EventKind;
  category: string;
  category_order: number;
  position: number;
  performance: string;
  competitor: string;
  school: string;
}

interface MeetInfo {
  meet_name: string;
  venue: string;
  meet_date: string | null;
  public_results: boolean;
}

interface PublicCategory {
  id: number;
  name: string;
  sort_order: number;
  counts_for_points: boolean;
}

interface PublicScore {
  athlete_id: number;
  category_id: number;
  name: string;
  bib: number | null;
  school: string;
  gold: number;
  silver: number;
  bronze: number;
  points: number;
  wins: string | null;
}

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" } as Record<number, string>;

/** Public, read-only scoreboard (same views as the staff Points Table). Refreshes every 20 seconds. */
export default function LivePage() {
  const [info, setInfo] = useState<MeetInfo | null>(null);
  const [schools, setSchools] = useState<{ id: number; name: string }[]>([]);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [catPoints, setCatPoints] = useState<CategoryPoints[]>([]);
  const [scores, setScores] = useState<AthleteScore[]>([]);
  const [results, setResults] = useState<PublicResult[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<StandingsView>("overall");

  useEffect(() => {
    const load = async () => {
      const sb = supabase();
      const [i, p, cp, c, sc, r] = await Promise.all([
        sb.rpc("public_meet_info"),
        sb.rpc("school_points"),
        sb.rpc("school_category_points"),
        sb.rpc("public_categories"),
        sb.rpc("public_individual_scores"),
        sb.rpc("public_results"),
      ]);
      setInfo(((i.data as MeetInfo[] | null) ?? [])[0] ?? null);
      setSchools(((p.data as PointsRow[] | null) ?? []).map((x) => ({ id: x.school_id, name: x.school })));
      setCatPoints((cp.data as CategoryPoints[]) ?? []);
      setCategories((c.data as PublicCategory[]) ?? []);
      setScores(
        ((sc.data as PublicScore[] | null) ?? []).map((x) => ({
          athleteId: x.athlete_id,
          name: x.name,
          bib: x.bib,
          school: x.school,
          categoryId: x.category_id,
          gold: x.gold,
          silver: x.silver,
          bronze: x.bronze,
          points: x.points,
          wins: x.wins ? x.wins.split(" · ") : [],
        })),
      );
      setResults((r.data as PublicResult[]) ?? []);
      setUpdated(new Date());
    };
    void load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  // Girls' and boys' categories of an age group are shown together (e.g. KIDDIES).
  const groups = useMemo(() => groupCategories(categories), [categories]);
  const selected = groups.find((g) => g.key === view) ?? null;
  const standings = useMemo(
    () => buildStandings(schools, categories, catPoints, selected ? selected.categories.map((c) => c.id) : null),
    [schools, categories, catPoints, selected],
  );
  const excluded = categories.filter((c) => !c.counts_for_points);

  // Results grouped category → event, limited to the chosen age group.
  const byCategory = new Map<string, Map<string, PublicResult[]>>();
  for (const r of results) {
    if (selected && !selected.categories.some((c) => c.name === r.category)) continue;
    const cat = byCategory.get(r.category) ?? new Map<string, PublicResult[]>();
    cat.set(r.event, [...(cat.get(r.event) ?? []), r]);
    byCategory.set(r.category, cat);
  }
  const resultCount = (g: { categories: { name: string }[] }) =>
    results.filter((r) => g.categories.some((c) => c.name === r.category)).length;

  const resultsSection = (
    <section className="space-y-4">
      {!byCategory.size && (
        <p className="rounded-xl bg-white p-8 text-center text-slate-500">No results{selected ? " in this age group" : ""} yet.</p>
      )}
      {[...byCategory].map(([cat, evs]) => (
        <div key={cat} className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-[#123b68]">{cat}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...evs].map(([ev, rows]) => (
              <div key={ev} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1 text-sm font-semibold">{ev}</div>
                {rows.map((r) => (
                  <div key={r.position} className="flex items-baseline gap-2 py-0.5 text-sm">
                    <span>{MEDAL[r.position] ?? POSITION_LABEL[r.position]}</span>
                    <span className="font-medium">{r.competitor}</span>
                    <span className="truncate text-xs text-slate-500">{r.school}</span>
                    {r.performance && <span className="ml-auto text-xs font-semibold">{r.performance}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-[#123b68] px-4 py-6 text-center text-white">
        <h1 className="text-2xl font-bold sm:text-3xl">{info?.meet_name || "Interschool Sports Meet"}</h1>
        <p className="text-blue-100">{[info?.venue, fmtDate(info?.meet_date)].filter(Boolean).join(" • ")}</p>
        <p className="mt-1 text-xs text-blue-200">
          Live results{updated && ` • updated ${updated.toLocaleTimeString()}`} •{" "}
          <a href="/verify" className="underline">
            Verify a certificate
          </a>
        </p>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        {info && !info.public_results ? (
          <p className="rounded-xl bg-white p-8 text-center text-slate-600">Results are not public yet.</p>
        ) : (
          <>
            <ViewChips groups={groups} view={view} onChange={setView} count={resultCount} />

            {view === "individual" ? (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  Best girl and best boy in each age group from individual events (relays not included). Ties go to more golds, then
                  silvers, then bronzes; otherwise joint champions.
                </p>
                <div className="space-y-5">
                  {groups.map((g) => (
                    <section key={g.key}>
                      <h2 className="mb-2 text-lg font-bold text-[#123b68]">{g.name}</h2>
                      <div className="grid gap-4 md:grid-cols-2">
                        {g.categories.map((c) => (
                          <ChampionCard key={c.id} category={c} scores={scores} top={4} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {selected && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {selected.categories.map((c) => (
                      <ChampionCard key={c.id} category={c} scores={scores} top={6} />
                    ))}
                  </div>
                )}
                <section className="rounded-xl bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-bold">{selected ? `🏅 ${selected.name} — schools` : "🏆 Championship points"}</h2>
                  <p className="mb-3 text-xs text-slate-500">
                    {selected
                      ? `${selected.categories.map((c) => c.name).join(" + ")} added together.${
                          selected.counts_for_points ? "" : " Not added to the overall total."
                        }`
                      : excluded.length
                        ? `All categories except ${excluded.map((c) => c.name).join(", ")}.`
                        : "All categories added together."}
                  </p>
                  <StandingTable standings={standings} />
                </section>
                {resultsSection}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
