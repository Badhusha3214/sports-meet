"use client";

import { useMemo, useState } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, inputCls, Loading, PageHeader } from "@/components/ui";
import { downloadCertificates, meritCertificates, safeFileName } from "@/lib/certificate";
import { EMPTY_SNAPSHOT, loadSnapshot, SNAPSHOT_TABLES } from "@/lib/load";
import { supabase } from "@/lib/supabase/client";
import type { Result } from "@/lib/types";
import { cx, POSITION_LABEL } from "@/lib/util";

interface Competitor {
  key: string;
  athleteId: number | null;
  teamId: number | null;
  bib: string;
  name: string;
  school: string;
  detail: string;
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const MEDAL_BTN: Record<number, string> = {
  1: "border-yellow-400 bg-yellow-50 text-yellow-900",
  2: "border-slate-400 bg-slate-100 text-slate-800",
  3: "border-orange-400 bg-orange-50 text-orange-900",
};
const MEDAL_ON: Record<number, string> = {
  1: "border-yellow-500 bg-yellow-400 text-yellow-950",
  2: "border-slate-500 bg-slate-400 text-white",
  3: "border-orange-600 bg-orange-500 text-white",
};

export default function PrizeEntryPage() {
  const meet = useMeet();
  const { categories, events, schoolById, settings, ready } = meet;
  const toast = useToast();
  const { data: snap, loading, refresh } = useLive(loadSnapshot, EMPTY_SNAPSHOT, SNAPSHOT_TABLES);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const catId = categoryId ?? categories[0]?.id ?? null;
  const catEvents = events.filter((e) => e.category_id === catId);
  const event = events.find((e) => e.id === eventId && e.category_id === catId) ?? catEvents[0] ?? null;

  const resultsByEvent = useMemo(() => {
    const m = new Map<number, Result[]>();
    for (const r of snap.results) m.set(r.event_id, [...(m.get(r.event_id) ?? []), r]);
    return m;
  }, [snap.results]);

  const competitors: Competitor[] = useMemo(() => {
    if (!event) return [];
    const athletes = new Map(snap.athletes.map((a) => [a.id, a]));
    if (event.kind === "relay") {
      return snap.teams
        .filter((t) => t.event_id === event.id)
        .map((t) => {
          const names = snap.members
            .filter((m) => m.team_id === t.id)
            .map((m) => athletes.get(m.athlete_id))
            .map((a) => (a ? `${a.bib ?? "—"} ${a.name}` : ""))
            .join(", ");
          const school = schoolById.get(t.school_id)?.name ?? "";
          return { key: `t${t.id}`, athleteId: null, teamId: t.id, bib: `Team ${t.team_label}`, name: school, school: "", detail: names };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return snap.entries
      .filter((e) => e.event_id === event.id)
      .map((e) => athletes.get(e.athlete_id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({
        key: `a${a.id}`,
        athleteId: a.id,
        teamId: null,
        bib: a.bib ? String(a.bib) : "—",
        name: a.name,
        school: schoolById.get(a.school_id)?.name ?? "",
        detail: "",
      }))
      .sort((a, b) => (Number(a.bib) || 1e9) - (Number(b.bib) || 1e9) || a.name.localeCompare(b.name));
  }, [event, snap, schoolById]);

  const eventResults = event ? resultsByEvent.get(event.id) ?? [] : [];
  const resultOf = (c: Competitor) =>
    eventResults.find((r) => (c.athleteId ? r.athlete_id === c.athleteId : r.relay_team_id === c.teamId));

  const filtered = q.trim()
    ? competitors.filter((c) => `${c.bib} ${c.name} ${c.school} ${c.detail}`.toLowerCase().includes(q.trim().toLowerCase()))
    : competitors;

  const setPosition = async (c: Competitor, pos: 1 | 2 | 3) => {
    if (!event || busy) return;
    setBusy(true);
    const sb = supabase();
    try {
      const mine = resultOf(c);
      if (mine?.position === pos) {
        const { error } = await sb.from("results").delete().eq("id", mine.id);
        if (error) throw error;
        toast.ok(`${POSITION_LABEL[pos]} place cleared.`);
      } else {
        const holder = eventResults.find((r) => r.position === pos);
        const ids = [holder?.id, mine?.id].filter((x): x is number => !!x);
        if (ids.length) {
          const { error } = await sb.from("results").delete().in("id", ids);
          if (error) throw error;
        }
        const { error } = await sb.from("results").insert({
          event_id: event.id,
          athlete_id: c.athleteId,
          relay_team_id: c.teamId,
          position: pos,
          performance: mine?.performance ?? "",
        });
        if (error) throw error;
        toast.ok(`${MEDAL[pos]} ${c.name} — ${POSITION_LABEL[pos]} in ${event.name}`);
      }
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const savePerformance = async (r: Result, value: string) => {
    if (value.trim() === r.performance) return;
    const { error } = await supabase().from("results").update({ performance: value }).eq("id", r.id);
    if (error) toast.error(error);
    else {
      toast.ok("Performance saved.");
      void refresh();
    }
  };

  const certificateFor = (rs: Result[], label: string) => {
    const certs = meritCertificates(rs, snap, meet);
    if (!certs.length) return toast.error("No winners to print yet.");
    downloadCertificates(certs, settings, `Certificates_${safeFileName(label)}`);
  };

  if (!ready || loading) return <Loading />;

  const podium = ([1, 2, 3] as const).map((p) => eventResults.find((r) => r.position === p));
  const competitorOf = (r: Result) =>
    competitors.find((c) => (r.athlete_id ? c.athleteId === r.athlete_id : c.teamId === r.relay_team_id));

  return (
    <>
      <PageHeader
        title="Prize Entry"
        description="Pick the event, then tap the medal next to each winner. Certificates are ready the moment you save."
      />

      {/* Step 1: category */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => {
          const evs = events.filter((e) => e.category_id === c.id);
          const done = evs.filter((e) => (resultsByEvent.get(e.id)?.length ?? 0) > 0).length;
          return (
            <button
              key={c.id}
              onClick={() => {
                setCategoryId(c.id);
                setEventId(null);
                setQ("");
              }}
              className={cx(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold",
                c.id === catId ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white hover:border-blue-400",
              )}
            >
              {c.name}
              <span className={cx("ml-2 text-xs", c.id === catId ? "text-blue-100" : "text-slate-400")}>
                {done}/{evs.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Step 2: event */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {catEvents.map((e) => {
          const n = resultsByEvent.get(e.id)?.length ?? 0;
          return (
            <button
              key={e.id}
              onClick={() => {
                setEventId(e.id);
                setQ("");
              }}
              className={cx(
                "rounded-xl border-2 px-3 py-3 text-left",
                e.id === event?.id ? "border-blue-700 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300",
              )}
            >
              <div className="font-bold">{e.name}</div>
              <div className={cx("text-xs", n >= 3 ? "font-semibold text-emerald-700" : "text-slate-500")}>
                {n >= 3 ? "✓ Done" : n ? `${n}/3 placed` : "Not started"}
              </div>
            </button>
          );
        })}
      </div>

      {!event ? (
        <Empty>No events in this category. Add them in Meet Setup.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Step 3: tap winners */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-lg font-bold">
                {event.name} <span className="text-sm font-normal text-slate-500">· {competitors.length} competitors</span>
              </h2>
              <input
                className={cx(inputCls, "max-w-xs text-base")}
                placeholder="Type bib no. or name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                inputMode="search"
              />
            </div>
            {!competitors.length ? (
              <Empty>
                {event.kind === "relay"
                  ? "No relay teams entered for this event yet. Create them on the Relay Teams page."
                  : "No athletes entered in this event yet."}
              </Empty>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const r = resultOf(c);
                  return (
                    <div key={c.key} className={cx("flex flex-wrap items-center gap-3 py-2", r && "bg-emerald-50/50")}>
                      <div className="w-20 shrink-0 text-center text-xl font-bold tabular-nums text-slate-800">{c.bib}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{c.name}</div>
                        <div className="truncate text-xs text-slate-500">{c.school || c.detail}</div>
                      </div>
                      <div className="flex gap-1.5">
                        {([1, 2, 3] as const).map((p) => (
                          <button
                            key={p}
                            disabled={busy}
                            onClick={() => setPosition(c, p)}
                            aria-pressed={r?.position === p}
                            className={cx(
                              "h-12 w-14 rounded-xl border-2 text-sm font-bold transition disabled:opacity-60",
                              r?.position === p ? MEDAL_ON[p] : cx(MEDAL_BTN[p], "opacity-70 hover:opacity-100"),
                            )}
                          >
                            {MEDAL[p]}
                            <div className="text-[10px] leading-none">{POSITION_LABEL[p]}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!filtered.length && <p className="py-6 text-center text-sm text-slate-500">No match for “{q}”.</p>}
              </div>
            )}
          </Card>

          {/* Podium with performance and instant certificates */}
          <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <Card>
              <h3 className="mb-3 font-bold">Podium — {event.name}</h3>
              <div className="space-y-2">
                {podium.map((r, i) => {
                  const p = (i + 1) as 1 | 2 | 3;
                  const c = r && competitorOf(r);
                  return (
                    <div key={p} className={cx("rounded-xl border-2 p-3", r ? MEDAL_BTN[p] : "border-dashed border-slate-200")}>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{MEDAL[p]}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold">{c ? c.name : <span className="text-slate-400">Not set</span>}</div>
                          {c && <div className="truncate text-xs opacity-80">{c.school || `${c.bib}`}</div>}
                        </div>
                        {r && (
                          <Button size="sm" variant="outline" title="Download certificate" onClick={() => certificateFor([r], `${event.name}_${p}`)}>
                            📜
                          </Button>
                        )}
                      </div>
                      {r && (
                        <input
                          key={`${r.id}-${r.performance}`}
                          className={cx(inputCls, "mt-2 bg-white/80")}
                          placeholder={event.kind === "field" ? "Distance e.g. 4.25m (optional)" : "Time e.g. 12.8s (optional)"}
                          defaultValue={r.performance}
                          onBlur={(e) => savePerformance(r, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <Button
                variant="success"
                className="mt-3 w-full"
                disabled={!eventResults.length}
                onClick={() => certificateFor(eventResults.sort((a, b) => a.position - b.position), event.name)}
              >
                📜 Download all certificates for this event
              </Button>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
