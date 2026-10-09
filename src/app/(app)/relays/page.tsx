"use client";

import { useMemo, useState } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, ExportButtons, Field, inputCls, Loading, Note, PageHeader, Table, Td } from "@/components/ui";
import { downloadExcel } from "@/lib/excel";
import { EMPTY_SNAPSHOT, loadSnapshot, SNAPSHOT_TABLES } from "@/lib/load";
import { downloadTablePdf } from "@/lib/pdf";
import { supabase } from "@/lib/supabase/client";

export default function RelaysPage() {
  const { events, schools, schoolById, categoryById, settings, ready } = useMeet();
  const toast = useToast();
  const { data: snap, loading, refresh } = useLive(loadSnapshot, EMPTY_SNAPSHOT, SNAPSHOT_TABLES);
  const relayEvents = events.filter((e) => e.kind === "relay");
  const [eventId, setEventId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [legs, setLegs] = useState<string[]>(["", "", "", ""]);
  const [saving, setSaving] = useState(false);

  const event = relayEvents.find((e) => String(e.id) === eventId) ?? relayEvents[0];
  const athletes = useMemo(() => new Map(snap.athletes.map((a) => [a.id, a])), [snap.athletes]);
  const eventTeams = snap.teams.filter((t) => t.event_id === event?.id);
  const taken = new Set(snap.members.filter((m) => eventTeams.some((t) => t.id === m.team_id)).map((m) => m.athlete_id));

  const candidates = snap.athletes
    .filter((a) => event && a.category_id === event.category_id && String(a.school_id) === schoolId && !taken.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const nextLabel = () => {
    const used = new Set(eventTeams.filter((t) => String(t.school_id) === schoolId).map((t) => t.team_label));
    return "ABCDEFGH".split("").find((l) => !used.has(l)) ?? "Z";
  };

  const save = async () => {
    if (!event || !schoolId) return toast.error("Choose the relay event and school.");
    const ids = legs.map(Number);
    if (ids.some((x) => !x) || new Set(ids).size !== 4) return toast.error("Choose 4 different runners, one for each leg.");
    setSaving(true);
    const sb = supabase();
    const { data: team, error } = await sb
      .from("relay_teams")
      .insert({ event_id: event.id, school_id: Number(schoolId), team_label: nextLabel() })
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      return toast.error(error);
    }
    const res = await sb.from("relay_members").insert(ids.map((athlete_id, i) => ({ team_id: team.id, athlete_id, leg: i + 1 })));
    if (res.error) {
      await sb.from("relay_teams").delete().eq("id", team.id);
      toast.error(res.error);
    } else {
      toast.ok("Relay team saved.");
      setLegs(["", "", "", ""]);
    }
    setSaving(false);
    void refresh();
  };

  const remove = async (teamId: number) => {
    if (!confirm("Delete this relay team? Its result (if any) is also removed.")) return;
    const { error } = await supabase().from("relay_teams").delete().eq("id", teamId);
    if (error) toast.error(error);
    else toast.ok("Team deleted.");
    void refresh();
  };

  const allRows = () =>
    snap.teams
      .map((t) => {
        const ev = events.find((e) => e.id === t.event_id);
        return [
          categoryById.get(ev?.category_id ?? -1)?.name ?? "",
          ev?.name ?? "",
          schoolById.get(t.school_id)?.name ?? "",
          t.team_label,
          ...[1, 2, 3, 4].map((leg) => {
            const m = snap.members.find((x) => x.team_id === t.id && x.leg === leg);
            const a = m && athletes.get(m.athlete_id);
            return a ? `${a.bib ?? "—"} ${a.name}` : "";
          }),
        ];
      })
      .sort((a, b) => a.join("|").localeCompare(b.join("|")));

  if (!ready || loading) return <Loading />;
  if (!relayEvents.length) return <Empty>No relay events are set up. Add one in Meet Setup with type “relay”.</Empty>;

  return (
    <>
      <PageHeader
        title="Relay Teams"
        description="Each team has exactly 4 runners from the same school and category. Runners keep their own bib numbers."
        actions={
          <ExportButtons
            disabled={!snap.teams.length}
            onExcel={() =>
              downloadExcel("Relay_Teams", [
                { name: "Relay Teams", rows: [["Category", "Event", "School", "Team", "Leg 1", "Leg 2", "Leg 3", "Leg 4"], ...allRows()] },
              ])
            }
            onPdf={() =>
              downloadTablePdf({
                filename: "Relay_Teams",
                title: "Relay Teams",
                settings,
                landscape: true,
                sections: [{ head: ["Category", "Event", "School", "Team", "Leg 1", "Leg 2", "Leg 3", "Leg 4"], body: allRows() }],
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
                  setLegs(["", "", "", ""]);
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
                  setLegs(["", "", "", ""]);
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
            {schoolId &&
              legs.map((v, i) => (
                <Field key={i} label={`Leg ${i + 1}`}>
                  <select
                    className={inputCls}
                    value={v}
                    onChange={(e) => setLegs((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))}
                  >
                    <option value="">Select runner</option>
                    {candidates
                      .filter((a) => String(a.id) === v || !legs.includes(String(a.id)))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bib ?? "—"} — {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
              ))}
            <Button variant="success" className="w-full" onClick={save} disabled={saving || !schoolId}>
              {saving ? "Saving…" : `Save team ${schoolId ? nextLabel() : ""}`}
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
            <Table head={["School", "Team", "Runners", ""]}>
              {eventTeams
                .sort((a, b) => (schoolById.get(a.school_id)?.name ?? "").localeCompare(schoolById.get(b.school_id)?.name ?? ""))
                .map((t) => (
                  <tr key={t.id}>
                    <Td className="font-semibold">{schoolById.get(t.school_id)?.name}</Td>
                    <Td>{t.team_label}</Td>
                    <Td className="text-xs">
                      {snap.members
                        .filter((m) => m.team_id === t.id)
                        .sort((a, b) => a.leg - b.leg)
                        .map((m) => {
                          const a = athletes.get(m.athlete_id);
                          return (
                            <div key={m.leg}>
                              {m.leg}. <b>{a?.bib ?? "—"}</b> {a?.name}
                            </div>
                          );
                        })}
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(t.id)}>
                        Delete
                      </Button>
                    </Td>
                  </tr>
                ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
