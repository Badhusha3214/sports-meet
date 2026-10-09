"use client";

import { useMemo, useRef, useState } from "react";
import { useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Empty, Note, PageHeader, Table, Td } from "@/components/ui";
import { downloadExcel, excelDate, pick, readFirstSheet } from "@/lib/excel";
import { loadAthletes, loadRelayTeams } from "@/lib/load";
import { supabase } from "@/lib/supabase/client";
import type { Category, Gender, MeetEvent } from "@/lib/types";
import { defaultCategory, errorMessage, fmtDate } from "@/lib/util";

interface RelayPick {
  event: MeetEvent;
  team: string;
  leg: number | null;
}

interface Row {
  row: number;
  name: string;
  schoolText: string;
  schoolId: number | null;
  dob: string;
  gender: string;
  category: Category | null;
  events: MeetEvent[];
  relays: RelayPick[];
  warnings: string[];
  errors: string[];
  status?: "added" | "duplicate" | "failed";
  message?: string;
}

interface RelayGroup {
  key: string;
  event: MeetEvent;
  schoolId: number;
  team: string;
  runners: { row: Row; leg: number }[];
  problem: string | null;
}

/** Lower-cases and strips punctuation so "4x100m relay", "4×100M Relay" and "4 x 100m relay" all match. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']+/g, "")
    .trim();

const rowKey = (name: string, schoolId: number | null, dob: string) => `${norm(name)}|${schoolId}|${dob}`;

/** Groups relay runners from valid rows into teams and checks each team has 4 runners on legs 1–4. */
function buildRelayGroups(rows: Row[]): RelayGroup[] {
  const groups = new Map<string, RelayGroup>();
  for (const r of rows) {
    if (r.errors.length || !r.schoolId) continue;
    for (const p of r.relays) {
      const key = `${r.schoolId}|${p.event.id}|${p.team}`;
      const g = groups.get(key) ?? { key, event: p.event, schoolId: r.schoolId, team: p.team, runners: [], problem: null };
      g.runners.push({ row: r, leg: p.leg ?? 0 });
      groups.set(key, g);
    }
  }
  for (const g of groups.values()) {
    if (g.runners.length !== 4) {
      g.problem = `Has ${g.runners.length} runner(s); a team needs exactly 4`;
      continue;
    }
    const given = g.runners.filter((x) => x.leg).map((x) => x.leg);
    if (new Set(given).size !== given.length) {
      g.problem = "Two runners have the same leg number";
      continue;
    }
    // Runners without a leg number fill the remaining legs in sheet order.
    const free = [1, 2, 3, 4].filter((l) => !given.includes(l));
    g.runners.forEach((x) => {
      if (!x.leg) x.leg = free.shift()!;
    });
    g.runners.sort((a, b) => a.leg - b.leg);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export default function ImportPage() {
  const { schools, categories, events, settings, schoolById, categoryById } = useMeet();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [teamStatus, setTeamStatus] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [progress, setProgress] = useState<number | null>(null);

  const groups = useMemo(() => buildRelayGroups(rows), [rows]);

  const template = () => {
    const sample = categories.find((c) => c.gender === "Boys" && events.some((e) => e.category_id === c.id && e.kind === "relay"));
    const sampleEvents = events.filter((e) => e.category_id === sample?.id && e.kind !== "relay").slice(0, 2);
    const relay = events.find((e) => e.category_id === sample?.id && e.kind === "relay");
    const school = schools[0]?.name ?? "";
    const dob = sample ? fmtDate(sample.dob_from) : "01-01-2014";
    const evText = (withRelay: boolean) => [...sampleEvents.map((e) => e.name), ...(withRelay && relay ? [relay.name] : [])].join(", ");
    downloadExcel("Athlete_Import_Template", [
      {
        name: "Athletes",
        rows: [
          ["Player Name", "School", "DOB", "Gender", "Category", "Events", "Relay Team", "Relay Leg"],
          ["Sample Runner 1", school, dob, "Boys", sample?.name ?? "", evText(true), "A", 1],
          ["Sample Runner 2", school, dob, "Boys", sample?.name ?? "", evText(true), "A", 2],
          ["Sample Runner 3", school, dob, "Boys", sample?.name ?? "", relay?.name ?? "", "A", 3],
          ["Sample Runner 4", school, dob, "Boys", sample?.name ?? "", relay?.name ?? "", "A", 4],
          ["Sample Sprinter", school, dob, "Boys", sample?.name ?? "", evText(false), "", ""],
        ],
      },
      { name: "Schools", rows: [["School (copy exactly)"], ...schools.map((s) => [s.name])] },
      {
        name: "Categories & Events",
        rows: [
          ["Category", "Gender", "Born on/after", "Individual events", "Relay events"],
          ...categories.map((c) => {
            const evs = events.filter((e) => e.category_id === c.id);
            return [
              c.name,
              c.gender,
              fmtDate(c.dob_from),
              evs.filter((e) => e.kind !== "relay").map((e) => e.name).join(", "),
              evs.filter((e) => e.kind === "relay").map((e) => e.name).join(", "),
            ];
          }),
        ],
      },
      {
        name: "How to fill relays",
        rows: [
          ["Relays"],
          ["Add the relay event to the Events column of each of the 4 runners."],
          ["Relay Team: A, B, … (leave blank for A). Use B when a school has a second team in the same relay."],
          ["Relay Leg: 1 to 4 (optional). Runners without a leg number fill the remaining legs in sheet order."],
          ["Each team must have exactly 4 runners from the same school and category."],
          ["Runners who are already registered can be listed again just to put them in a relay team."],
        ],
      },
    ]);
  };

  const parse = async (file: File) => {
    try {
      const raw = await readFirstSheet(file);
      const schoolMap = new Map<string, number>();
      schools.forEach((s) => {
        schoolMap.set(norm(s.name), s.id);
        if (s.short_code) schoolMap.set(norm(s.short_code), s.id);
      });
      const parsed: Row[] = raw.map((r, i) => {
        const name = String(pick(r, ["Player Name", "Name", "Athlete Name", "Player", "Athlete"])).trim();
        const schoolText = String(pick(r, ["School", "School Name"])).trim();
        const dob = excelDate(pick(r, ["DOB", "Date of Birth", "Birth Date"]));
        const g = String(pick(r, ["Gender", "Sex"])).trim().toLowerCase();
        const gender = ["boys", "boy", "male", "m"].includes(g) ? "Boys" : ["girls", "girl", "female", "f"].includes(g) ? "Girls" : "";
        const catText = String(pick(r, ["Category", "Age Category"])).trim();
        const evText = String(pick(r, ["Events", "Event", "Events Selected"])).trim();
        const teamText = String(pick(r, ["Relay Team", "Team", "Relay"])).trim().toUpperCase();
        const legText = String(pick(r, ["Relay Leg", "Leg"])).trim();
        const errors: string[] = [];
        const warnings: string[] = [];

        const schoolId = schoolMap.get(norm(schoolText)) ?? null;
        let category: Category | null = null;
        if (catText) category = categories.find((c) => norm(c.name) === norm(catText)) ?? null;
        if (!category && gender && dob) {
          category = defaultCategory(categories, gender as Gender, dob) ?? null;
          if (category && catText) warnings.push(`Category "${catText}" not found; using ${category.name}`);
        }

        let leg: number | null = null;
        if (legText) {
          leg = /^[1-4]$/.test(legText) ? Number(legText) : null;
          if (!leg) warnings.push(`Relay leg "${legText}" ignored (must be 1–4)`);
        }
        const team = /^[A-Z]$/.test(teamText) ? teamText : "A";
        if (teamText && team !== teamText) warnings.push(`Relay team "${teamText}" ignored (use a single letter); using A`);

        const evs: MeetEvent[] = [];
        const relays: RelayPick[] = [];
        if (category) {
          const catEvents = events.filter((e) => e.category_id === category!.id);
          const catRelays = catEvents.filter((e) => e.kind === "relay");
          for (const t of evText.split(/[,;|\n]/).map((x) => x.trim()).filter(Boolean)) {
            let ev = catEvents.find((e) => norm(e.name) === norm(t));
            // A plain "Relay" means the category's relay when it has only one.
            if (!ev && norm(t) === "relay" && catRelays.length === 1) ev = catRelays[0];
            if (!ev) warnings.push(`"${t}" is not an event in ${category.name}`);
            else if (ev.kind === "relay") {
              if (!relays.some((x) => x.event.id === ev.id)) relays.push({ event: ev, team, leg });
            } else if (!evs.includes(ev)) evs.push(ev);
          }
        }
        if (relays.length > 1 && leg) warnings.push("Relay leg applies to every relay listed on this row");

        if (!name) errors.push("Missing name");
        if (!schoolId) errors.push(schoolText ? `Unknown school "${schoolText}"` : "Missing school");
        if (!dob) errors.push("Invalid or missing DOB");
        if (!gender) errors.push("Gender must be Boys or Girls");
        if (!category) errors.push("No matching category for gender/DOB");
        else {
          if (category.gender !== gender) errors.push(`${category.name} is not for ${gender || "this gender"}`);
          if (dob && (dob < category.dob_from || (category.dob_to && dob > category.dob_to)))
            errors.push(`DOB ${fmtDate(dob)} not eligible for ${category.name}`);
          if (!evs.length && !relays.length) errors.push("No valid events");
        }
        return { row: i + 2, name, schoolText, schoolId, dob, gender, category, events: evs, relays, warnings, errors };
      });
      setRows(parsed);
      setTeamStatus({});
      setFileName(file.name);
      if (!parsed.length) toast.error("The first sheet has no data rows.");
    } catch (e) {
      toast.error(`Could not read the file: ${errorMessage(e)}`);
    }
  };

  const importValid = async () => {
    const valid = rows.filter((r) => !r.errors.length && !r.status);
    if (!valid.length) return toast.error("There are no valid rows to import.");
    setProgress(0);
    const sb = supabase();
    const idByKey = new Map((await loadAthletes()).map((a) => [rowKey(a.name, a.school_id, a.dob), a.id]));
    const updated = new Map<number, Partial<Row>>();
    const idByRow = new Map<number, number>();
    const total = valid.length + groups.length;
    let done = 0;
    const tick = () => setProgress(Math.round((++done / total) * 100));

    // 1) Athletes and individual event entries.
    const work = async (r: Row) => {
      const key = rowKey(r.name, r.schoolId, r.dob);
      const existing = idByKey.get(key);
      if (existing) {
        idByRow.set(r.row, existing);
        updated.set(r.row, {
          status: "duplicate",
          message: r.relays.length ? "Already registered — used for relay team" : "Already registered — skipped",
        });
        return;
      }
      idByKey.set(key, -1); // reserve, so a repeated row in the same file counts as a duplicate
      const { data, error } = await sb
        .from("athletes")
        .insert({ name: r.name, school_id: r.schoolId, dob: r.dob, gender: r.gender, category_id: r.category!.id })
        .select("id")
        .single();
      if (error) {
        idByKey.delete(key);
        updated.set(r.row, { status: "failed", message: errorMessage(error) });
        return;
      }
      idByKey.set(key, data.id);
      idByRow.set(r.row, data.id);
      const failed: string[] = [];
      for (const ev of r.events) {
        const res = await sb.from("entries").insert({ athlete_id: data.id, event_id: ev.id });
        if (res.error) failed.push(`${ev.name}: ${errorMessage(res.error)}`);
      }
      updated.set(r.row, { status: "added", message: failed.length ? `Added, but ${failed.join("; ")}` : "Added" });
    };

    // A few requests at a time keeps it quick without overloading the server.
    const queue = [...valid];
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        for (let r = queue.shift(); r; r = queue.shift()) {
          await work(r);
          tick();
        }
      }),
    );
    // Repeated rows within the file point at the athlete created by the first copy.
    for (const r of valid) {
      if (!idByRow.has(r.row)) continue;
      const id = idByKey.get(rowKey(r.name, r.schoolId, r.dob));
      if (id && id > 0) idByRow.set(r.row, id);
    }

    // 2) Relay teams.
    const status: Record<string, { ok: boolean; text: string }> = {};
    const existingTeams = await loadRelayTeams();
    for (const g of groups) {
      tick();
      if (g.problem) {
        status[g.key] = { ok: false, text: `Not created: ${g.problem}` };
        continue;
      }
      const missing = g.runners.filter((x) => !(idByRow.get(x.row.row)! > 0));
      if (missing.length) {
        status[g.key] = { ok: false, text: `Not created: ${missing.map((x) => x.row.name).join(", ")} could not be imported` };
        continue;
      }
      if (existingTeams.some((t) => t.event_id === g.event.id && t.school_id === g.schoolId && t.team_label === g.team)) {
        status[g.key] = { ok: false, text: `Team ${g.team} already exists — skipped` };
        continue;
      }
      const { data: team, error } = await sb
        .from("relay_teams")
        .insert({ event_id: g.event.id, school_id: g.schoolId, team_label: g.team })
        .select("id")
        .single();
      if (error) {
        status[g.key] = { ok: false, text: errorMessage(error) };
        continue;
      }
      const res = await sb
        .from("relay_members")
        .insert(g.runners.map((x) => ({ team_id: team.id, athlete_id: idByRow.get(x.row.row), leg: x.leg })));
      if (res.error) {
        await sb.from("relay_teams").delete().eq("id", team.id);
        status[g.key] = { ok: false, text: errorMessage(res.error) };
      } else status[g.key] = { ok: true, text: "Team created" };
    }

    setRows((rs) => rs.map((r) => ({ ...r, ...(updated.get(r.row) ?? {}) })));
    setTeamStatus(status);
    setProgress(null);
    const count = (s: Row["status"]) => [...updated.values()].filter((u) => u.status === s).length;
    const teams = Object.values(status).filter((s) => s.ok).length;
    toast.ok(
      `Import finished: ${count("added")} athletes added, ${count("duplicate")} already registered, ${count("failed")} failed, ${teams} relay team(s) created.`,
    );
  };

  const validCount = rows.filter((r) => !r.errors.length).length;
  const readyTeams = groups.filter((g) => !g.problem).length;
  // Runners whose relay team can't be created are still registered, but not placed in that team.
  const teamProblemByRow = new Map<number, string[]>();
  for (const g of groups)
    if (g.problem)
      for (const x of g.runners)
        teamProblemByRow.set(x.row.row, [...(teamProblemByRow.get(x.row.row) ?? []), `${g.event.name} team ${g.team} won't be created`]);

  return (
    <>
      <PageHeader
        title="Excel Import"
        description="Upload many athletes and relay teams at once from an Excel (.xlsx/.xls) or CSV file."
        actions={
          <>
            <Button variant="outline" onClick={template}>
              ⬇ Download template
            </Button>
            <Button onClick={() => fileRef.current?.click()}>📂 Choose Excel file</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void parse(f);
                e.target.value = "";
              }}
            />
          </>
        }
      />
      <Note tone="blue">
        Columns: <b>Player Name, School, DOB, Gender, Category, Events</b>, plus optional <b>Relay Team</b> (A, B…) and{" "}
        <b>Relay Leg</b> (1–4). Separate several events with commas. For a relay, list the relay event (e.g. <b>4×100m Relay</b>) for
        each of its 4 runners. DOB may be an Excel date, <b>2014-05-12</b> or <b>12-05-2014</b>. If Category is blank it is chosen from
        gender and DOB. The template includes the exact names{settings?.meet_name ? ` for ${settings.meet_name}` : ""}.
      </Note>

      {!rows.length ? (
        <Card>
          <Empty>Choose an Excel file to see a preview here. Nothing is saved until you press Import.</Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="mr-auto text-sm">
                <b>{fileName}</b> — {rows.length} rows · <span className="text-emerald-700">{validCount} valid</span> ·{" "}
                <span className="text-red-700">{rows.length - validCount} need correction</span>
                {!!groups.length && (
                  <>
                    {" "}
                    · {readyTeams}/{groups.length} relay teams ready
                  </>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setRows([]);
                  setTeamStatus({});
                }}
              >
                Clear
              </Button>
              <Button variant="success" onClick={importValid} disabled={progress !== null || !validCount || rows.every((r) => r.status)}>
                {progress !== null ? `Importing… ${progress}%` : `Import ${validCount} valid rows${readyTeams ? ` + ${readyTeams} relay teams` : ""}`}
              </Button>
            </div>
            {progress !== null && (
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            <Table head={["Row", "Name", "School", "DOB", "Gender", "Category", "Events", "Relay", "Status"]}>
              {rows.map((r) => (
                <tr key={r.row} className={r.errors.length ? "bg-red-50/60" : undefined}>
                  <Td className="text-slate-500">{r.row}</Td>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-xs">{r.schoolId ? schoolById.get(r.schoolId)?.name : r.schoolText}</Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(r.dob)}</Td>
                  <Td>{r.gender}</Td>
                  <Td className="text-xs">{r.category?.name}</Td>
                  <Td className="text-xs">{r.events.map((e) => e.name).join(", ")}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {r.relays.map((p) => (
                      <div key={p.event.id}>
                        {p.event.name} · Team {p.team}
                        {p.leg ? ` · Leg ${p.leg}` : ""}
                      </div>
                    ))}
                  </Td>
                  <Td className="text-xs">
                    {r.status ? (
                      <Badge tone={r.status === "added" ? "green" : r.status === "duplicate" ? "amber" : "red"}>{r.message}</Badge>
                    ) : r.errors.length ? (
                      <span className="text-red-700">⚠ {r.errors.join("; ")}</span>
                    ) : (
                      <span className="text-emerald-700">✓ Ready</span>
                    )}
                    {!!r.warnings.length && <div className="mt-1 text-amber-700">{r.warnings.join("; ")}</div>}
                    {teamProblemByRow.has(r.row) && (
                      <div className="mt-1 text-amber-700">{teamProblemByRow.get(r.row)!.join("; ")} (see relay teams below)</div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>

          {!!groups.length && (
            <Card>
              <h2 className="mb-3 font-bold">Relay teams in this file ({groups.length})</h2>
              <Table head={["Relay", "School", "Team", "Runners (leg · name)", "Status"]}>
                {groups.map((g) => {
                  const done = teamStatus[g.key];
                  return (
                    <tr key={g.key} className={g.problem ? "bg-red-50/60" : undefined}>
                      <Td className="text-xs">
                        <div className="font-semibold">{g.event.name}</div>
                        {categoryById.get(g.event.category_id)?.name}
                      </Td>
                      <Td className="text-xs">{schoolById.get(g.schoolId)?.name}</Td>
                      <Td className="font-bold">{g.team}</Td>
                      <Td className="text-xs">
                        {g.runners.map((x) => (
                          <div key={x.row.row}>
                            {x.leg ? `${x.leg} · ` : ""}
                            {x.row.name}
                          </div>
                        ))}
                      </Td>
                      <Td className="text-xs">
                        {done ? (
                          <Badge tone={done.ok ? "green" : "amber"}>{done.text}</Badge>
                        ) : g.problem ? (
                          <span className="text-red-700">⚠ {g.problem}</span>
                        ) : (
                          <span className="text-emerald-700">✓ Ready</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
