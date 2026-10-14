"use client";

import { useMemo, useState } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, ExportButtons, Field, inputCls, Loading, Note, PageHeader, Table, Td } from "@/components/ui";
import { downloadExcel } from "@/lib/excel";
import { EMPTY_SNAPSHOT, loadSnapshot, SNAPSHOT_TABLES } from "@/lib/load";
import { downloadTablePdf } from "@/lib/pdf";
import { supabase } from "@/lib/supabase/client";
import { RELAY_MAX, RELAY_MIN } from "@/lib/types";
import { cx } from "@/lib/util";

export default function RelaysPage() {
  const { events, schools, schoolById, categoryById, settings, ready } = useMeet();
  const toast = useToast();
  const { data: snap, loading, refresh } = useLive(loadSnapshot, EMPTY_SNAPSHOT, SNAPSHOT_TABLES);
  const relayEvents = events.filter((e) => e.kind === "relay");
  const [eventId, setEventId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const event = relayEvents.find((e) => String(e.id) === eventId) ?? relayEvents[0];
  const athletes = useMemo(() => new Map(snap.athletes.map((a) => [a.id, a])), [snap.athletes]);
  const eventTeams = snap.teams
    .filter((t) => t.event_id === event?.id)
    .sort((a, b) => a.team_label.length - b.team_label.length || a.team_label.localeCompare(b.team_label));
  const taken = new Set(snap.members.filter((m) => eventTeams.some((t) => t.id === m.team_id)).map((m) => m.athlete_id));
  const membersOf = (teamId: number) =>
    snap.members
      .filter((m) => m.team_id === teamId)
      .map((m) => athletes.get(m.athlete_id))
      .filter((a): a is NonNullable<typeof a> => !!a);

  // Athletes of a school in this relay's category who aren't already in a team for it.
  const freeRunners = (sid: number) =>
    snap.athletes
      .filter((a) => event && a.category_id === event.category_id && a.school_id === sid && !taken.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  const candidates = schoolId ? freeRunners(Number(schoolId)) : [];

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= RELAY_MAX ? p : [...p, id]));

  const save = async () => {
    if (!event || !schoolId) return toast.error("Choose the relay event and school.");
    if (picked.length < RELAY_MIN || picked.length > RELAY_MAX)
      return toast.error(`Choose ${RELAY_MIN} to ${RELAY_MAX} runners.`);
    setSaving(true);
    const sb = supabase();
    // The database gives the team the next free letter in this relay.
    const { data: team, error } = await sb
      .from("relay_teams")
      .insert({ event_id: event.id, school_id: Number(schoolId) })
      .select("id, team_label")
      .single();
    if (error) {
      setSaving(false);
      return toast.error(error);
    }
    const res = await sb.from("relay_members").insert(picked.map((athlete_id) => ({ team_id: team.id, athlete_id })));
    if (res.error) {
      await sb.from("relay_teams").delete().eq("id", team.id);
      toast.error(res.error);
    } else {
      toast.ok(`Team ${team.team_label} saved with ${picked.length} runners.`);
      setPicked([]);
    }
    setSaving(false);
    void refresh();
  };

  const addRunner = async (teamId: number, athleteId: string) => {
    if (!athleteId) return;
    const { error } = await supabase().from("relay_members").insert({ team_id: teamId, athlete_id: Number(athleteId) });
    if (error) toast.error(error);
    void refresh();
  };

  const removeRunner = async (teamId: number, athleteId: number) => {
    const { error } = await supabase().from("relay_members").delete().eq("team_id", teamId).eq("athlete_id", athleteId);
    if (error) toast.error(error);
    void refresh();
  };

  const removeTeam = async (teamId: number, label: string) => {
    if (!confirm(`Delete team ${label}? Its result (if any) is also removed.`)) return;
    const { error } = await supabase().from("relay_teams").delete().eq("id", teamId);
    if (error) toast.error(error);
    else toast.ok("Team deleted.");
    void refresh();
  };

  const exportHead = ["Category", "Event", "Team", "School", "Runners", "No. of runners"];
  const allRows = () =>
    snap.teams
      .map((t) => {
        const ev = events.find((e) => e.id === t.event_id);
        const runners = membersOf(t.id);
        return [
          categoryById.get(ev?.category_id ?? -1)?.name ?? "",
          ev?.name ?? "",
          t.team_label,
          schoolById.get(t.school_id)?.name ?? "",
          runners.map((a) => `${a.bib ?? "—"} ${a.name}`).join(", "),
          runners.length,
        ];
      })
      .sort((a, b) => `${a[0]}|${a[1]}|${String(a[2]).padStart(3)}`.localeCompare(`${b[0]}|${b[1]}|${String(b[2]).padStart(3)}`));

  if (!ready || loading) return <Loading />;
  if (!relayEvents.length) return <Empty>No relay events are set up. Add one in Meet Setup with type “relay”.</Empty>;

  return (
    <>
      <PageHeader
        title="Relay Teams"
        description={`Each team has ${RELAY_MIN}–${RELAY_MAX} runners from one school and category. Team letters (A, B, C…) are given automatically, one per team.`}
        actions={
          <ExportButtons
            disabled={!snap.teams.length}
            onExcel={() => downloadExcel("Relay_Teams", [{ name: "Relay Teams", rows: [exportHead, ...allRows()] }])}
            onPdf={() =>
              downloadTablePdf({
                filename: "Relay_Teams",
                title: "Relay Teams",
                settings,
                landscape: true,
                sections: [{ head: exportHead, body: allRows() }],
              })
            }
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-3 font-bold">New team</h2>
          <div className="space-y-3">
            <Field label="Relay event">
              <select
                className={inputCls}
                value={event ? String(event.id) : ""}
                onChange={(e) => {
                  setEventId(e.target.value);
                  setPicked([]);
                }}
              >
                {relayEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {categoryById.get(e.category_id)?.name} — {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="School">
              <select
                className={inputCls}
                value={schoolId}
                onChange={(e) => {
                  setSchoolId(e.target.value);
                  setPicked([]);
                }}
              >
                <option value="">Select school</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {schoolId && !candidates.length && (
              <Note>No available athletes from this school in {categoryById.get(event?.category_id ?? -1)?.name}. Register them first.</Note>
            )}
            {!!candidates.length && (
              <div>
                <div className="mb-1 flex justify-between text-sm font-semibold text-slate-700">
                  <span>Runners</span>
                  <span className={cx(picked.length >= RELAY_MIN ? "text-emerald-700" : "text-slate-500")}>
                    {picked.length} selected ({RELAY_MIN}–{RELAY_MAX})
                  </span>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {candidates.map((a) => (
                    <label
                      key={a.id}
                      className={cx(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                        picked.includes(a.id) ? "border-blue-600 bg-blue-50" : "border-slate-200",
                        !picked.includes(a.id) && picked.length >= RELAY_MAX && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={picked.includes(a.id)}
                        disabled={!picked.includes(a.id) && picked.length >= RELAY_MAX}
                        onChange={() => toggle(a.id)}
                      />
                      <b className="w-12 tabular-nums">{a.bib ?? "—"}</b> {a.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Button
              variant="success"
              className="w-full"
              onClick={save}
              disabled={saving || !schoolId || picked.length < RELAY_MIN}
            >
              {saving ? "Saving…" : `Save team (${picked.length} runners)`}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">
            {categoryById.get(event?.category_id ?? -1)?.name} — {event?.name} ({eventTeams.length} teams)
          </h2>
          {!eventTeams.length ? (
            <Empty>No teams yet for this relay.</Empty>
          ) : (
            <Table head={["Team", "School", "Runners", ""]}>
              {eventTeams.map((t) => {
                const runners = membersOf(t.id);
                const spare = freeRunners(t.school_id);
                return (
                  <tr key={t.id}>
                    <Td className="text-lg font-bold">{t.team_label}</Td>
                    <Td className="text-xs font-semibold">{schoolById.get(t.school_id)?.name}</Td>
                    <Td className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {runners.map((a) => (
                          <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                            <b>{a.bib ?? "—"}</b> {a.name}
                            {runners.length > RELAY_MIN && (
                              <button
                                className="ml-0.5 text-slate-400 hover:text-red-600"
                                title="Remove runner"
                                onClick={() => removeRunner(t.id, a.id)}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                      <div className={cx("mt-1", runners.length < RELAY_MIN ? "font-semibold text-red-600" : "text-slate-500")}>
                        {runners.length} runner(s){runners.length < RELAY_MIN && ` — needs at least ${RELAY_MIN}`}
                      </div>
                      {runners.length < RELAY_MAX && !!spare.length && (
                        <select
                          className={cx(inputCls, "mt-1 max-w-xs py-1 text-xs")}
                          value=""
                          onChange={(e) => addRunner(t.id, e.target.value)}
                        >
                          <option value="">+ Add runner…</option>
                          {spare.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.bib ?? "—"} — {a.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removeTeam(t.id, t.team_label)}>
                        Delete
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
