"use client";

import { useMemo, useState } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import { Button, Card, Empty, ExportButtons, inputCls, Loading, PageHeader, Table, Td } from "@/components/ui";
import { downloadExcel, type Cell } from "@/lib/excel";
import { EMPTY_SNAPSHOT, loadSnapshot, SNAPSHOT_TABLES } from "@/lib/load";
import { downloadTablePdf } from "@/lib/pdf";
import type { MeetEvent } from "@/lib/types";

interface StartList {
  event: MeetEvent;
  title: string;
  head: string[];
  rows: Cell[][];
}

export default function StartListsPage() {
  const { categories, events, schoolById, categoryById, settings, ready } = useMeet();
  const { data: snap, loading } = useLive(loadSnapshot, EMPTY_SNAPSHOT, SNAPSHOT_TABLES);
  const [categoryId, setCategoryId] = useState("");
  const [eventId, setEventId] = useState("");

  const lists = useMemo(() => {
    const athletes = new Map(snap.athletes.map((a) => [a.id, a]));
    const build = (ev: MeetEvent): StartList => {
      const title = `${categoryById.get(ev.category_id)?.name ?? ""} — ${ev.name}`;
      if (ev.kind === "relay") {
        const rows = snap.teams
          .filter((t) => t.event_id === ev.id)
          .map((t) => [
            schoolById.get(t.school_id)?.name ?? "",
            t.team_label,
            snap.members
              .filter((m) => m.team_id === t.id)
              .map((m) => {
                const a = athletes.get(m.athlete_id);
                return a ? `${a.bib ?? "—"} ${a.name}` : "";
              })
              .join(", "),
            "",
          ]);
        rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
        return { event: ev, title, head: ["School", "Team", "Runners (bib, name)", "Result"], rows: rows.map((r, i) => [i + 1, ...r]) };
      }
      const rows = snap.entries
        .filter((e) => e.event_id === ev.id)
        .map((e) => athletes.get(e.athlete_id))
        .filter((a): a is NonNullable<typeof a> => !!a)
        .sort((a, b) => (a.bib ?? 1e9) - (b.bib ?? 1e9) || a.name.localeCompare(b.name))
        .map((a, i) => [i + 1, a.bib ?? "—", a.name, schoolById.get(a.school_id)?.name ?? "", ""]);
      return { event: ev, title, head: ["Bib", "Name", "School", "Result"], rows };
    };
    return events.map(build);
  }, [events, snap, schoolById, categoryById]);

  const catEvents = events.filter((e) => !categoryId || String(e.category_id) === categoryId);
  const current = lists.find((l) => String(l.event.id) === eventId) ?? lists.find((l) => catEvents.includes(l.event)) ?? null;
  const scope = lists.filter((l) => catEvents.includes(l.event) && l.rows.length);

  const excel = (ls: StartList[], name: string) =>
    downloadExcel(
      name,
      ls.map((l) => ({ name: `${l.event.id}-${l.title.replace(" — ", " ")}`.slice(0, 31), rows: [[l.title], ["No.", ...l.head], ...l.rows] })),
    );
  const pdf = (ls: StartList[], name: string) =>
    downloadTablePdf({
      filename: name,
      title: "Start Lists",
      settings,
      sections: ls.map((l, i) => ({ heading: `${l.title} (${l.rows.length})`, head: ["No.", ...l.head], body: l.rows, newPage: i > 0 })),
    });

  if (!ready || loading) return <Loading />;

  return (
    <>
      <PageHeader
        title="Start Lists"
        description="Event-wise lists for officials, with a blank Result column for writing in."
        actions={
          <>
            <Button variant="outline" onClick={() => excel(scope, "Start_Lists")} disabled={!scope.length}>
              ⬇ All lists (Excel)
            </Button>
            <Button variant="outline" onClick={() => pdf(scope, "Start_Lists")} disabled={!scope.length}>
              ⬇ All lists (PDF)
            </Button>
          </>
        }
      />
      <Card>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <select
            className={inputCls}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setEventId("");
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={inputCls} value={current ? String(current.event.id) : ""} onChange={(e) => setEventId(e.target.value)}>
            {catEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {categoryById.get(e.category_id)?.name} — {e.name} ({lists.find((l) => l.event.id === e.id)?.rows.length ?? 0})
              </option>
            ))}
          </select>
        </div>
        {!current ? (
          <Empty>No events.</Empty>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-lg font-bold">{current.title}</h2>
              <ExportButtons
                onExcel={() => excel([current], current.title.replace(/[^a-z0-9]+/gi, "_"))}
                onPdf={() => pdf([current], current.title.replace(/[^a-z0-9]+/gi, "_"))}
                disabled={!current.rows.length}
              />
            </div>
            {!current.rows.length ? (
              <Empty>No entries in this event yet.</Empty>
            ) : (
              <Table head={["No.", ...current.head.slice(0, -1)]}>
                {current.rows.map((r, i) => (
                  <tr key={i}>
                    {r.slice(0, -1).map((c, j) => (
                      <Td key={j} className={j === 1 ? "font-bold" : undefined}>
                        {c}
                      </Td>
                    ))}
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
      </Card>
    </>
  );
}
