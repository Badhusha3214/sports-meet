"use client";

import Link from "next/link";
import { useMeet, useLive } from "@/components/meet-context";
import { Card, Loading, PageHeader } from "@/components/ui";
import { EMPTY_SNAPSHOT, loadSnapshot, SNAPSHOT_TABLES } from "@/lib/load";
import { supabase } from "@/lib/supabase/client";
import type { PointsRow } from "@/lib/types";
import { fmtDate } from "@/lib/util";

export default function Dashboard() {
  const { settings, events, categories, ready } = useMeet();
  const { data: snap, loading } = useLive(loadSnapshot, EMPTY_SNAPSHOT, SNAPSHOT_TABLES);
  const { data: points } = useLive(
    async () => ((await supabase().rpc("school_points")).data as PointsRow[]) ?? [],
    [] as PointsRow[],
    ["results"],
  );

  if (!ready || loading) return <Loading />;

  const scoredEvents = new Set(snap.results.map((r) => r.event_id)).size;
  const stats = [
    { label: "Athletes", value: snap.athletes.length, href: "/athletes" },
    { label: "Event entries", value: snap.entries.length, href: "/events" },
    { label: "Schools taking part", value: new Set(snap.athletes.map((a) => a.school_id)).size, href: "/athletes" },
    { label: "Relay teams", value: snap.teams.length, href: "/relays" },
    { label: "Events completed", value: `${scoredEvents} / ${events.length}`, href: "/results" },
    { label: "Without bib", value: snap.athletes.filter((a) => !a.bib).length, href: "/bibs" },
  ];

  return (
    <>
      <PageHeader
        title={settings?.meet_name || "Dashboard"}
        description={[settings?.venue, fmtDate(settings?.meet_date)].filter(Boolean).join(" • ") || "Meet overview"}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-400">
            <div className="text-3xl font-bold text-blue-800">{s.value}</div>
            <div className="text-sm text-slate-600">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">🏆 Points table</h2>
            <Link href="/points" className="text-sm text-blue-700 hover:underline">
              Full table →
            </Link>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {points.slice(0, 6).map((p, i) => (
                <tr key={p.school_id} className="border-t border-slate-100">
                  <td className="w-8 py-2 font-bold text-slate-400">{i + 1}</td>
                  <td>{p.school}</td>
                  <td className="text-right text-xs text-slate-500">
                    🥇{p.gold} 🥈{p.silver} 🥉{p.bronze}
                  </td>
                  <td className="w-14 text-right text-base font-bold text-blue-800">{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["🏅", "Enter prizes", "/results"],
              ["📜", "Certificates", "/certificates"],
              ["🏃", "Register athlete", "/athletes?new=1"],
              ["📥", "Excel import", "/import"],
              ["📋", "Start lists", "/events"],
              ["🔁", "Relay teams", "/relays"],
            ].map(([icon, label, href]) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold hover:border-blue-400 hover:bg-blue-50"
              >
                <span className="text-xl">{icon}</span>
                {label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-bold">Categories & events</h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="font-semibold">{c.name}</div>
              <div className="text-xs text-slate-500">Born on/after {fmtDate(c.dob_from)}</div>
              <div className="mt-1 text-slate-700">
                {events
                  .filter((e) => e.category_id === c.id)
                  .map((e) => e.name)
                  .join(", ")}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
