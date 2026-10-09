"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AthleteForm } from "@/components/athlete-form";
import { useLive, useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, ExportButtons, inputCls, Loading, PageHeader, Table, Td } from "@/components/ui";
import { downloadExcel } from "@/lib/excel";
import { EMPTY_SNAPSHOT, loadSnapshot } from "@/lib/load";
import { downloadTablePdf } from "@/lib/pdf";
import { supabase } from "@/lib/supabase/client";
import type { Athlete } from "@/lib/types";
import { fmtDate } from "@/lib/util";

function AthletesInner() {
  const { schools, categories, schoolById, categoryById, eventById, settings, isAdmin, ready } = useMeet();
  const toast = useToast();
  const params = useSearchParams();
  const { data: snap, loading, refresh } = useLive(loadSnapshot, EMPTY_SNAPSHOT, ["athletes", "entries", "relay_members"]);
  const [q, setQ] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [editing, setEditing] = useState<Athlete | null>(null);
  const [formOpen, setFormOpen] = useState(params.get("new") === "1");
  const [photos, setPhotos] = useState<Record<string, string>>({});

  // Event names per athlete, including relays.
  const eventsOf = useMemo(() => {
    const m = new Map<number, string[]>();
    const add = (id: number, name?: string) => name && m.set(id, [...(m.get(id) ?? []), name]);
    snap.entries.forEach((e) => add(e.athlete_id, eventById.get(e.event_id)?.name));
    const teamEvent = new Map(snap.teams.map((t) => [t.id, t.event_id]));
    snap.members.forEach((mb) => add(mb.athlete_id, eventById.get(teamEvent.get(mb.team_id) ?? -1)?.name));
    return m;
  }, [snap, eventById]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return snap.athletes
      .filter(
        (a) =>
          (!schoolId || String(a.school_id) === schoolId) &&
          (!categoryId || String(a.category_id) === categoryId) &&
          (!needle || `${a.name} ${a.bib ?? ""} ${schoolById.get(a.school_id)?.name}`.toLowerCase().includes(needle)),
      )
      .sort((a, b) => (a.bib ?? 1e9) - (b.bib ?? 1e9) || a.name.localeCompare(b.name));
  }, [snap.athletes, q, schoolId, categoryId, schoolById]);

  // Signed URLs for the photos currently on screen.
  const visible = list.slice(0, 300);
  const photoKey = visible.map((a) => a.photo_path).filter(Boolean).join("|");
  useEffect(() => {
    const paths = photoKey ? photoKey.split("|").filter((p) => !photos[p]) : [];
    if (!paths.length) return;
    void (async () => {
      const { data } = await supabase().storage.from("photos").createSignedUrls(paths, 3600);
      const next: Record<string, string> = {};
      for (const d of (data ?? []) as { path: string | null; signedUrl: string }[]) {
        if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
      }
      setPhotos((p) => ({ ...p, ...next }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  const rows = () =>
    list.map((a) => [
      a.bib ?? "",
      a.name,
      schoolById.get(a.school_id)?.name ?? "",
      fmtDate(a.dob),
      a.gender,
      categoryById.get(a.category_id)?.name ?? "",
      (eventsOf.get(a.id) ?? []).join(", "),
    ]);

  const exportExcel = () =>
    downloadExcel("Athletes", [{ name: "Athletes", rows: [["Bib", "Name", "School", "DOB", "Gender", "Category", "Events"], ...rows()] }]);

  const exportPdf = () => {
    const bySchool = new Map<string, ReturnType<typeof rows>>();
    rows().forEach((r) => bySchool.set(String(r[2]), [...(bySchool.get(String(r[2])) ?? []), r]));
    downloadTablePdf({
      filename: "Athletes",
      title: "Registered Athletes",
      settings,
      landscape: true,
      sections: [...bySchool]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([school, rs], i) => ({
          heading: `${school} (${rs.length})`,
          newPage: i > 0,
          head: ["Bib", "Name", "DOB", "Gender", "Category", "Events"],
          body: rs.map((r) => [r[0], r[1], r[3], r[4], r[5], r[6]]),
        })),
    });
  };

  const remove = async (a: Athlete) => {
    if (!confirm(`Delete ${a.name}? Their entries, relay places and results will also be removed.`)) return;
    const { error } = await supabase().from("athletes").delete().eq("id", a.id);
    if (error) return toast.error(error);
    if (a.photo_path) await supabase().storage.from("photos").remove([a.photo_path]);
    toast.ok(`${a.name} deleted.`);
    void refresh();
  };

  if (!ready || loading) return <Loading />;

  return (
    <>
      <PageHeader
        title="Athletes"
        description={`${snap.athletes.length} registered`}
        actions={
          <>
            <ExportButtons onExcel={exportExcel} onPdf={exportPdf} disabled={!list.length} />
            <Button
              variant="success"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              + Register athlete
            </Button>
          </>
        }
      />
      <Card>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <input className={inputCls} placeholder="Search name, bib or school" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={inputCls} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {!list.length ? (
          <Empty>No athletes found. Register one, or use Excel Import for bulk upload.</Empty>
        ) : (
          <>
            <Table head={["Photo", "Bib", "Name", "School", "DOB", "Category", "Events", ""]}>
              {visible.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <Td>
                    {a.photo_path && photos[a.photo_path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photos[a.photo_path]} alt="" className="h-10 w-10 rounded-md object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-slate-100" />
                    )}
                  </Td>
                  <Td className="font-bold tabular-nums">{a.bib ?? "—"}</Td>
                  <Td className="font-semibold">{a.name}</Td>
                  <Td className="text-xs">{schoolById.get(a.school_id)?.name}</Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(a.dob)}</Td>
                  <Td className="text-xs">{categoryById.get(a.category_id)?.name}</Td>
                  <Td className="text-xs">{(eventsOf.get(a.id) ?? []).join(", ") || <span className="text-red-600">No events</span>}</Td>
                  <Td className="whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(a);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>{" "}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(a)}>
                        Delete
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
            {list.length > visible.length && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Showing first {visible.length} of {list.length}. Use search or filters to narrow down. Exports include all.
              </p>
            )}
          </>
        )}
      </Card>
      <AthleteForm
        open={formOpen}
        athlete={editing}
        eventIds={editing ? snap.entries.filter((e) => e.athlete_id === editing.id).map((e) => e.event_id) : []}
        onClose={() => setFormOpen(false)}
        onSaved={() => void refresh()}
      />
    </>
  );
}

export default function AthletesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AthletesInner />
    </Suspense>
  );
}
