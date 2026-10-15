"use client";

import { useMemo, useState } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import {
  buildStandings,
  ChampionCard,
  championsOf,
  StandingTable,
  ViewChips,
  type AthleteScore,
  type CategoryPoints,
  type Standing,
  type StandingsView,
} from "@/components/standings";
import { Card, Empty, ExportButtons, Loading, PageHeader, Table, Td } from "@/components/ui";
import { downloadExcel, type Cell, type Sheet } from "@/lib/excel";
import { EMPTY_SNAPSHOT, loadSnapshot, SNAPSHOT_TABLES } from "@/lib/load";
import { downloadTablePdf } from "@/lib/pdf";
import { supabase } from "@/lib/supabase/client";
import { POSITION_LABEL } from "@/lib/util";

const STANDING_HEAD = ["Rank", "School", "Gold", "Silver", "Bronze", "Points"];
const RESULTS_HEAD = ["Category", "Event", "Position", "Bib", "Name", "School", "Performance"];
const CHAMPION_HEAD = ["Category", "Individual Champion", "Bib", "School", "Gold", "Silver", "Bronze", "Points"];
const standingRows = (st: Standing[]) => st.map((s, i) => [i + 1, s.school, s.gold, s.silver, s.bronze, s.points]);

export default function PointsPage() {
  const { events, categories, schools, schoolById, eventById, settings, ready } = useMeet();
  const [view, setView] = useState<StandingsView>("overall");
  const selected = typeof view === "number" ? categories.find((c) => c.id === view) ?? null : null;
  const { data: snap, loading } = useLive(loadSnapshot, EMPTY_SNAPSHOT, SNAPSHOT_TABLES);
  const { data: catPoints } = useLive(
    async () => ((await supabase().rpc("school_category_points")).data as CategoryPoints[]) ?? [],
    [] as CategoryPoints[],
    ["results"],
  );

  const standings = useMemo(
    () => buildStandings(schools, categories, catPoints, selected?.id ?? null),
    [schools, categories, catPoints, selected],
  );

  // Individual scores: individual (non-relay) events only, using the individual points.
  const athleteScores = useMemo(() => {
    const pts: Record<number, number> = { 1: settings?.points_first ?? 5, 2: settings?.points_second ?? 3, 3: settings?.points_third ?? 1 };
    const athletes = new Map(snap.athletes.map((a) => [a.id, a]));
    const scores = new Map<number, AthleteScore>();
    for (const r of snap.results) {
      const ev = eventById.get(r.event_id);
      const a = r.athlete_id ? athletes.get(r.athlete_id) : undefined;
      if (!ev || ev.kind === "relay" || !a) continue;
      const s = scores.get(a.id) ?? {
        athleteId: a.id,
        name: a.name,
        bib: a.bib,
        school: schoolById.get(a.school_id)?.name ?? "",
        categoryId: a.category_id,
        gold: 0,
        silver: 0,
        bronze: 0,
        points: 0,
        wins: [],
      };
      if (r.position === 1) s.gold++;
      if (r.position === 2) s.silver++;
      if (r.position === 3) s.bronze++;
      s.points += pts[r.position] ?? 0;
      s.wins.push(`${ev.name} ${POSITION_LABEL[r.position]}`);
      scores.set(a.id, s);
    }
    return [...scores.values()];
  }, [snap, eventById, schoolById, settings]);

  // All results in category → event → position order, tagged with their category for filtering.
  const allResults = useMemo(() => {
    const athletes = new Map(snap.athletes.map((a) => [a.id, a]));
    const teams = new Map(snap.teams.map((t) => [t.id, t]));
    const evOrder = new Map(events.map((e, i) => [e.id, i]));
    const catOrder = new Map(categories.map((c, i) => [c.id, i]));
    return [...snap.results]
      .sort((a, b) => {
        const ea = events.find((e) => e.id === a.event_id);
        const eb = events.find((e) => e.id === b.event_id);
        return (
          (catOrder.get(ea?.category_id ?? -1) ?? 0) - (catOrder.get(eb?.category_id ?? -1) ?? 0) ||
          (evOrder.get(a.event_id) ?? 0) - (evOrder.get(b.event_id) ?? 0) ||
          a.position - b.position
        );
      })
      .map((r) => {
        const ev = events.find((e) => e.id === r.event_id);
        const a = r.athlete_id ? athletes.get(r.athlete_id) : undefined;
        const t = r.relay_team_id ? teams.get(r.relay_team_id) : undefined;
        const schoolId = a?.school_id ?? t?.school_id ?? -1;
        return {
          categoryId: ev?.category_id ?? -1,
          row: [
            categories.find((c) => c.id === ev?.category_id)?.name ?? "",
            ev?.name ?? "",
            POSITION_LABEL[r.position],
            a ? a.bib ?? "" : "",
            a ? a.name : t ? `Team ${t.team_label}` : "",
            schoolById.get(schoolId)?.name ?? "",
            r.performance,
          ] as Cell[],
        };
      });
  }, [snap, events, categories, schoolById]);

  const shownResults = allResults.filter((r) => !selected || r.categoryId === selected.id).map((r) => r.row);
  const excluded = categories.filter((c) => !c.counts_for_points);
  const resultCount = (catId: number) => allResults.filter((r) => r.categoryId === catId).length;

  const championRows = (): Cell[][] =>
    categories.flatMap((c) => {
      const { champions } = championsOf(athleteScores, c.id);
      if (!champions.length) return [[c.name, "—", "", "", "", "", "", ""]];
      return champions.map((s) => [
        c.name,
        champions.length > 1 ? `${s.name} (joint)` : s.name,
        s.bib ?? "",
        s.school,
        s.gold,
        s.silver,
        s.bronze,
        s.points,
      ]);
    });

  // Exports always include overall, every category, the individual champions and all results.
  const exportSections = () => [
    { title: "Overall", rows: standingRows(buildStandings(schools, categories, catPoints, null)) },
    ...categories.map((c) => ({
      title: c.counts_for_points ? c.name : `${c.name} (not in overall)`,
      rows: standingRows(buildStandings(schools, categories, catPoints, c.id)),
    })),
  ];

  if (!ready || loading) return <Loading />;

  return (
    <>
      <PageHeader
        title="Points Table"
        description={`Points — individual: ${settings?.points_first} / ${settings?.points_second} / ${settings?.points_third}; relay: ${settings?.relay_points_first} / ${settings?.relay_points_second} / ${settings?.relay_points_third} (1st / 2nd / 3rd).${
          excluded.length ? ` Not added to overall: ${excluded.map((c) => c.name).join(", ")}.` : ""
        } Change in Meet Setup.`}
        actions={
          <ExportButtons
            onExcel={() =>
              downloadExcel("Points_Table", [
                ...exportSections().map((s): Sheet => ({ name: s.title, rows: [STANDING_HEAD, ...s.rows] })),
                { name: "Individual Champions", rows: [CHAMPION_HEAD, ...championRows()] },
                { name: "Results", rows: [RESULTS_HEAD, ...allResults.map((r) => r.row)] },
              ])
            }
            onPdf={() =>
              downloadTablePdf({
                filename: "Points_Table",
                title: "Championship Points",
                settings,
                sections: [
                  ...exportSections().map((s, i) => ({ heading: s.title, head: STANDING_HEAD, body: s.rows, newPage: i > 0 })),
                  { heading: "Individual Champions", head: CHAMPION_HEAD, body: championRows(), newPage: true },
                  { heading: "Results", head: RESULTS_HEAD, body: allResults.map((r) => r.row), newPage: true },
                ],
              })
            }
          />
        }
      />

      <ViewChips categories={categories} view={view} onChange={setView} count={resultCount} />

      {view === "individual" ? (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Best athlete in each category from individual events (relays not included): {settings?.points_first} / {settings?.points_second} /{" "}
            {settings?.points_third} points for 1st / 2nd / 3rd. Ties go to more golds, then silvers, then bronzes; otherwise joint champions.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((c) => (
              <ChampionCard key={c.id} category={c} scores={athleteScores} top={4} />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {selected && (
            <div className="max-w-xl">
              <ChampionCard category={selected} scores={athleteScores} top={6} />
            </div>
          )}
          <Card>
            <h2 className="text-lg font-bold">{selected ? `🏅 ${selected.name} — schools` : "🏆 Overall championship"}</h2>
            <p className="mb-3 text-xs text-slate-500">
              {selected
                ? selected.counts_for_points
                  ? "Points from this category only."
                  : "Points from this category only — this category is not added to the overall total."
                : excluded.length
                  ? `All categories except ${excluded.map((c) => c.name).join(", ")}.`
                  : "All categories added together."}
            </p>
            <StandingTable standings={standings} />
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-bold">
              Results — {selected ? selected.name : "Overall"} ({shownResults.length})
            </h2>
            {!shownResults.length ? (
              <Empty>No results entered{selected ? " in this category" : ""} yet.</Empty>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto">
                <Table head={selected ? RESULTS_HEAD.slice(1) : RESULTS_HEAD}>
                  {shownResults.map((r, i) => (
                    <tr key={i}>
                      {(selected ? r.slice(1) : r).map((c, j) => (
                        <Td key={j} className={(selected ? j + 1 : j) === 4 ? "font-semibold" : "text-xs"}>
                          {c}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
