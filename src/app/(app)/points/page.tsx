"use client";

import { useMemo } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import { Card, Empty, ExportButtons, Loading, PageHeader, Table, Td } from "@/components/ui";
import { downloadExcel } from "@/lib/excel";
import { EMPTY_SNAPSHOT, loadSnapshot, SNAPSHOT_TABLES } from "@/lib/load";
import { downloadTablePdf } from "@/lib/pdf";
import { supabase } from "@/lib/supabase/client";
import type { PointsRow } from "@/lib/types";
import { POSITION_LABEL } from "@/lib/util";

export default function PointsPage() {
  const { events, categories, schoolById, settings, ready } = useMeet();
  const { data: snap, loading } = useLive(loadSnapshot, EMPTY_SNAPSHOT, SNAPSHOT_TABLES);
  const { data: points } = useLive(
    async () => ((await supabase().rpc("school_points")).data as PointsRow[]) ?? [],
    [] as PointsRow[],
    ["results"],
  );

  // Results in category → event → position order.
  const resultRows = useMemo(() => {
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
        return [
          categories.find((c) => c.id === ev?.category_id)?.name ?? "",
          ev?.name ?? "",
          POSITION_LABEL[r.position],
          a ? a.bib ?? "" : "",
          a ? a.name : t ? `Team ${t.team_label}` : "",
          schoolById.get(schoolId)?.name ?? "",
          r.performance,
        ];
      });
  }, [snap, events, categories, schoolById]);

  const pointsRows = points.map((p, i) => [i + 1, p.school, p.gold, p.silver, p.bronze, p.points]);
  const pointsHead = ["Rank", "School", "Gold", "Silver", "Bronze", "Points"];
  const resultsHead = ["Category", "Event", "Position", "Bib", "Name", "School", "Performance"];

  if (!ready || loading) return <Loading />;

  return (
    <>
      <PageHeader
        title="Points Table & Results"
        description={`Points — individual: ${settings?.points_first} / ${settings?.points_second} / ${settings?.points_third}; relay: ${settings?.relay_points_first} / ${settings?.relay_points_second} / ${settings?.relay_points_third} (1st / 2nd / 3rd).${
          categories.some((c) => !c.counts_for_points)
            ? ` Not counted for school points: ${categories
                .filter((c) => !c.counts_for_points)
                .map((c) => c.name)
                .join(", ")}.`
            : ""
        } Change in Meet Setup.`}
        actions={
          <ExportButtons
            onExcel={() =>
              downloadExcel("Points_and_Results", [
                { name: "Points Table", rows: [pointsHead, ...pointsRows] },
                { name: "Results", rows: [resultsHead, ...resultRows] },
              ])
            }
            onPdf={() =>
              downloadTablePdf({
                filename: "Points_and_Results",
                title: "Championship Points & Results",
                settings,
                sections: [
                  { heading: "Championship points", head: pointsHead, body: pointsRows },
                  { heading: "Results", head: resultsHead, body: resultRows, newPage: true },
                ],
              })
            }
          />
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <h2 className="mb-3 text-lg font-bold">🏆 Championship points</h2>
          <Table head={pointsHead}>
            {points.map((p, i) => (
              <tr key={p.school_id} className={i === 0 && p.points > 0 ? "bg-yellow-50" : undefined}>
                <Td className="font-bold text-slate-500">{i + 1}</Td>
                <Td className="font-semibold">{p.school}</Td>
                <Td>{p.gold}</Td>
                <Td>{p.silver}</Td>
                <Td>{p.bronze}</Td>
                <Td className="text-lg font-bold text-blue-800">{p.points}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-bold">All results ({resultRows.length})</h2>
          {!resultRows.length ? (
            <Empty>No results entered yet.</Empty>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <Table head={resultsHead}>
                {resultRows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <Td key={j} className={j === 4 ? "font-semibold" : "text-xs"}>
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
    </>
  );
}
