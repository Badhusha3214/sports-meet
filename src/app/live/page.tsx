"use client";

import { useEffect, useState } from "react";
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

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" } as Record<number, string>;

/** Public, read-only scoreboard. Refreshes every 20 seconds. */
export default function LivePage() {
  const [info, setInfo] = useState<MeetInfo | null>(null);
  const [points, setPoints] = useState<PointsRow[]>([]);
  const [results, setResults] = useState<PublicResult[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const load = async () => {
      const sb = supabase();
      const [i, p, r] = await Promise.all([sb.rpc("public_meet_info"), sb.rpc("school_points"), sb.rpc("public_results")]);
      setInfo(((i.data as MeetInfo[] | null) ?? [])[0] ?? null);
      setPoints((p.data as PointsRow[]) ?? []);
      setResults((r.data as PublicResult[]) ?? []);
      setUpdated(new Date());
    };
    void load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const byCategory = new Map<string, Map<string, PublicResult[]>>();
  for (const r of results) {
    const cat = byCategory.get(r.category) ?? new Map<string, PublicResult[]>();
    cat.set(r.event, [...(cat.get(r.event) ?? []), r]);
    byCategory.set(r.category, cat);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-[#123b68] px-4 py-6 text-center text-white">
        <h1 className="text-2xl font-bold sm:text-3xl">{info?.meet_name || "Interschool Sports Meet"}</h1>
        <p className="text-blue-100">{[info?.venue, fmtDate(info?.meet_date)].filter(Boolean).join(" • ")}</p>
        <p className="mt-1 text-xs text-blue-200">Live results{updated && ` • updated ${updated.toLocaleTimeString()}`}</p>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        {info && !info.public_results ? (
          <p className="rounded-xl bg-white p-8 text-center text-slate-600">Results are not public yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <section className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">🏆 Championship points</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1">#</th>
                    <th>School</th>
                    <th className="text-center">🥇</th>
                    <th className="text-center">🥈</th>
                    <th className="text-center">🥉</th>
                    <th className="text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={p.school_id} className="border-t border-slate-100">
                      <td className="py-2 font-bold text-slate-500">{i + 1}</td>
                      <td className="pr-2 font-medium">{p.school}</td>
                      <td className="text-center">{p.gold}</td>
                      <td className="text-center">{p.silver}</td>
                      <td className="text-center">{p.bronze}</td>
                      <td className="text-right text-base font-bold text-blue-800">{p.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="space-y-4">
              {!results.length && <p className="rounded-xl bg-white p-8 text-center text-slate-500">No results yet.</p>}
              {[...byCategory].map(([cat, evs]) => (
                <div key={cat} className="rounded-xl bg-white p-4 shadow-sm">
                  <h2 className="mb-2 font-bold text-[#123b68]">{cat}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        )}
      </main>
    </div>
  );
}
