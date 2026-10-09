"use client";

import { useRef, useState } from "react";
import { useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, Note, PageHeader } from "@/components/ui";
import { downloadExcel } from "@/lib/excel";
import { loadSnapshot } from "@/lib/load";
import { supabase } from "@/lib/supabase/client";
import { errorMessage, fmtDate, POSITION_LABEL, todayISO } from "@/lib/util";

export default function BackupPage() {
  const meet = useMeet();
  const { isAdmin, settings, schools, categories, events, schoolById, categoryById, eventById, reload } = meet;
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!isAdmin) return <Empty>Only an administrator can back up or restore data.</Empty>;

  const backupJson = async () => {
    setBusy(true);
    try {
      const snap = await loadSnapshot();
      const data = {
        app: "sports-meet",
        version: 1,
        exported_at: new Date().toISOString(),
        settings,
        schools,
        categories,
        events,
        athletes: snap.athletes,
        entries: snap.entries,
        relay_teams: snap.teams,
        relay_members: snap.members,
        results: snap.results,
      };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      a.download = `SportsMeet_Backup_${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.ok("Backup downloaded. Keep it somewhere safe (e.g. Google Drive).");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const fullExcel = async () => {
    setBusy(true);
    try {
      const snap = await loadSnapshot();
      const athlete = new Map(snap.athletes.map((a) => [a.id, a]));
      const team = new Map(snap.teams.map((t) => [t.id, t]));
      downloadExcel(`SportsMeet_Full_Export_${todayISO()}`, [
        {
          name: "Athletes",
          rows: [
            ["Bib", "Name", "School", "DOB", "Gender", "Category"],
            ...snap.athletes.map((a) => [a.bib, a.name, schoolById.get(a.school_id)?.name, fmtDate(a.dob), a.gender, categoryById.get(a.category_id)?.name]),
          ],
        },
        {
          name: "Entries",
          rows: [
            ["Bib", "Name", "School", "Category", "Event"],
            ...snap.entries.map((e) => {
              const a = athlete.get(e.athlete_id);
              return [a?.bib, a?.name, schoolById.get(a?.school_id ?? -1)?.name, categoryById.get(a?.category_id ?? -1)?.name, eventById.get(e.event_id)?.name];
            }),
          ],
        },
        {
          name: "Relay Teams",
          rows: [
            ["Event", "Category", "School", "Team", "Leg", "Bib", "Name"],
            ...snap.members.map((m) => {
              const t = team.get(m.team_id);
              const ev = eventById.get(t?.event_id ?? -1);
              const a = athlete.get(m.athlete_id);
              return [ev?.name, categoryById.get(ev?.category_id ?? -1)?.name, schoolById.get(t?.school_id ?? -1)?.name, t?.team_label, m.leg, a?.bib, a?.name];
            }),
          ],
        },
        {
          name: "Results",
          rows: [
            ["Category", "Event", "Position", "Bib", "Name / Team", "School", "Performance"],
            ...snap.results.map((r) => {
              const ev = eventById.get(r.event_id);
              const a = r.athlete_id ? athlete.get(r.athlete_id) : undefined;
              const t = r.relay_team_id ? team.get(r.relay_team_id) : undefined;
              return [
                categoryById.get(ev?.category_id ?? -1)?.name,
                ev?.name,
                POSITION_LABEL[r.position],
                a?.bib,
                a?.name ?? (t ? `Team ${t.team_label}` : ""),
                schoolById.get(a?.school_id ?? t?.school_id ?? -1)?.name,
                r.performance,
              ];
            }),
          ],
        },
      ]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast.error("That file is not a valid backup (.json).");
    }
    const typed = prompt(`Restoring REPLACES ALL current data with the backup "${file.name}".\nType RESTORE to continue.`);
    if (typed !== "RESTORE") return;
    setBusy(true);
    const { error } = await supabase().rpc("restore_backup", { p: data });
    setBusy(false);
    if (error) return toast.error(`Restore failed, nothing was changed: ${errorMessage(error)}`);
    toast.ok("Backup restored.");
    await reload();
  };

  return (
    <>
      <PageHeader title="Backup & Restore" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-lg font-bold">💾 Backup</h2>
          <p className="mb-4 text-sm text-slate-600">
            Download a complete copy of the meet (settings, schools, categories, events, athletes, entries, relays, results). Do this
            before and after each meet day.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="success" onClick={backupJson} disabled={busy}>
              ⬇ Download backup file (.json)
            </Button>
            <Button variant="outline" onClick={fullExcel} disabled={busy}>
              ⬇ Full data export (Excel)
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Athlete photos are stored separately and are not inside the backup file.</p>
        </Card>
        <Card>
          <h2 className="mb-1 text-lg font-bold">♻️ Restore</h2>
          <Note>Restoring deletes all current meet data and replaces it with the backup. Download a fresh backup first.</Note>
          <Button variant="danger" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Working…" : "Restore from backup file…"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = "";
            }}
          />
        </Card>
      </div>
    </>
  );
}
