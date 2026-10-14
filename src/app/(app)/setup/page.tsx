"use client";

import { useEffect, useState } from "react";
import { useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, Field, inputCls, Loading, PageHeader, Table, Td } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";
import { cx } from "@/lib/util";

type Tab = "meet" | "schools" | "categories" | "events";

/** Input that saves itself when it loses focus. */
function Cell({
  value,
  onSave,
  type = "text",
  className,
  placeholder,
}: {
  value: string | number | null;
  onSave: (v: string) => void;
  type?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      key={String(value ?? "")}
      type={type}
      className={cx(inputCls, "py-1.5", className)}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== String(value ?? "") && onSave(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export default function SetupPage() {
  const { isAdmin, settings, schools, categories, events, categoryById, reload, ready } = useMeet();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("meet");
  const [form, setForm] = useState<Settings | null>(settings);
  const [eventCat, setEventCat] = useState("");
  const [newSchool, setNewSchool] = useState("");

  useEffect(() => setForm(settings), [settings]);

  if (!ready || !form) return <Loading />;
  if (!isAdmin) return <Empty>Only an administrator can change the meet setup.</Empty>;

  const update = async (table: string, id: number, patch: Record<string, unknown>) => {
    const { error } = await supabase().from(table).update(patch).eq("id", id);
    if (error) toast.error(error);
    else toast.ok("Saved.");
    await reload();
  };
  const insert = async (table: string, row: Record<string, unknown>) => {
    const { error } = await supabase().from(table).insert(row);
    if (error) toast.error(error);
    else toast.ok("Added.");
    await reload();
  };
  const remove = async (table: string, id: number, label: string) => {
    if (!confirm(`Delete ${label}?`)) return;
    const { error } = await supabase().from(table).delete().eq("id", id);
    if (error) toast.error(error);
    else toast.ok("Deleted.");
    await reload();
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const { id: _id, bibs_finalized: _f, ...patch } = form;
    void _id;
    void _f;
    const { error } = await supabase()
      .from("settings")
      .update({ ...patch, meet_date: patch.meet_date || null })
      .eq("id", 1);
    if (error) return toast.error(error);
    toast.ok("Meet settings saved.");
    await reload();
  };

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const shownEvents = events.filter((e) => !eventCat || String(e.category_id) === eventCat);

  return (
    <>
      <PageHeader title="Meet Setup" description="Everything here can be changed at any time. Changes apply to all users immediately." />
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["meet", "Meet & certificates"],
            ["schools", `Schools (${schools.length})`],
            ["categories", `Categories (${categories.length})`],
            ["events", `Events (${events.length})`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx("rounded-full px-4 py-2 text-sm font-semibold", tab === t ? "bg-blue-700 text-white" : "border border-slate-300 bg-white")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "meet" && (
        <Card>
          <form onSubmit={saveSettings} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Meet name (shown on certificates and reports)">
                <input className={inputCls} value={form.meet_name} onChange={(e) => set("meet_name", e.target.value)} required />
              </Field>
              <Field label="Organised by">
                <input className={inputCls} value={form.organiser} onChange={(e) => set("organiser", e.target.value)} />
              </Field>
              <Field label="Venue">
                <input className={inputCls} value={form.venue} onChange={(e) => set("venue", e.target.value)} />
              </Field>
              <Field label="Meet date (printed on certificates)">
                <input type="date" className={inputCls} value={form.meet_date ?? ""} onChange={(e) => set("meet_date", e.target.value || null)} />
              </Field>
              <Field label="Signatory 1 (Meet Director / PE HOD)">
                <input className={inputCls} value={form.director_name} onChange={(e) => set("director_name", e.target.value)} />
              </Field>
              <Field label="Signatory 2 (Principal)">
                <input className={inputCls} value={form.principal_name} onChange={(e) => set("principal_name", e.target.value)} />
              </Field>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Points</h3>
              {(
                [
                  ["Individual events", ["points_first", "points_second", "points_third"]],
                  ["Relays", ["relay_points_first", "relay_points_second", "relay_points_third"]],
                ] as const
              ).map(([group, keys]) => (
                <div key={group} className="mb-3">
                  <div className="mb-1 text-sm text-slate-600">{group}</div>
                  <div className="grid grid-cols-3 gap-3 sm:max-w-md">
                    {keys.map((k, i) => (
                      <Field key={k} label={["1st", "2nd", "3rd"][i]}>
                        <input type="number" min={0} className={inputCls} value={form[k]} onChange={(e) => set(k, Number(e.target.value))} />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.public_results} onChange={(e) => set("public_results", e.target.checked)} />
              Show results and points on the public results page (/live) — names, schools and positions only.
            </label>
            <Button type="submit" variant="success">
              Save settings
            </Button>
          </form>
        </Card>
      )}

      {tab === "schools" && (
        <Card>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newSchool.trim()) void insert("schools", { name: newSchool.trim().toUpperCase() }).then(() => setNewSchool(""));
            }}
          >
            <input className={inputCls} placeholder="New school name" value={newSchool} onChange={(e) => setNewSchool(e.target.value)} />
            <Button type="submit" variant="success">
              Add
            </Button>
          </form>
          <Table head={["School name", "Short code (optional, accepted in Excel import)", ""]}>
            {schools.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Cell value={s.name} onSave={(v) => update("schools", s.id, { name: v.trim() })} />
                </Td>
                <Td className="w-56">
                  <Cell value={s.short_code} onSave={(v) => update("schools", s.id, { short_code: v.trim() || null })} />
                </Td>
                <Td className="w-20">
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove("schools", s.id, s.name)}>
                    Delete
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === "categories" && (
        <Card>
          <p className="mb-3 text-sm text-slate-600">
            An athlete is eligible if born on or after <b>Born from</b> (and on or before <b>Born to</b>, if set). Registration picks the
            youngest eligible category automatically.
          </p>
          <Table head={["Name", "Gender", "Born from", "Born to (optional)", "Order", "Counts for overall points", ""]}>
            {categories.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Cell value={c.name} onSave={(v) => update("categories", c.id, { name: v.trim() })} />
                </Td>
                <Td className="w-28">
                  <select className={cx(inputCls, "py-1.5")} value={c.gender} onChange={(e) => update("categories", c.id, { gender: e.target.value })}>
                    <option>Girls</option>
                    <option>Boys</option>
                  </select>
                </Td>
                <Td className="w-44">
                  <Cell type="date" value={c.dob_from} onSave={(v) => v && update("categories", c.id, { dob_from: v })} />
                </Td>
                <Td className="w-44">
                  <Cell type="date" value={c.dob_to} onSave={(v) => update("categories", c.id, { dob_to: v || null })} />
                </Td>
                <Td className="w-20">
                  <Cell type="number" value={c.sort_order} onSave={(v) => update("categories", c.id, { sort_order: Number(v) || 0 })} />
                </Td>
                <Td className="w-28 text-center">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={c.counts_for_points}
                    title="Untick to leave this category out of the school championship points"
                    onChange={(e) => update("categories", c.id, { counts_for_points: e.target.checked })}
                  />
                </Td>
                <Td className="w-20">
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove("categories", c.id, `${c.name} and all its events`)}>
                    Delete
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
          <Button
            variant="success"
            className="mt-3"
            onClick={() =>
              insert("categories", {
                name: `NEW CATEGORY ${categories.length + 1}`,
                gender: "Girls",
                dob_from: `${new Date().getFullYear() - 10}-01-01`,
                sort_order: (categories.at(-1)?.sort_order ?? 0) + 10,
              })
            }
          >
            + Add category
          </Button>
        </Card>
      )}

      {tab === "events" && (
        <Card>
          <div className="mb-3 flex flex-wrap gap-2">
            <select className={cx(inputCls, "max-w-xs")} value={eventCat} onChange={(e) => setEventCat(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {eventCat && (
              <Button
                variant="success"
                onClick={() =>
                  insert("events", {
                    category_id: Number(eventCat),
                    name: `New event ${shownEvents.length + 1}`,
                    kind: "track",
                    sort_order: (shownEvents.at(-1)?.sort_order ?? 0) + 1,
                  })
                }
              >
                + Add event to {categoryById.get(Number(eventCat))?.name}
              </Button>
            )}
          </div>
          <Table head={["Category", "Event", "Type", "Max per school", "Order", ""]}>
            {shownEvents.map((ev) => (
              <tr key={ev.id}>
                <Td className="text-xs">{categoryById.get(ev.category_id)?.name}</Td>
                <Td>
                  <Cell value={ev.name} onSave={(v) => update("events", ev.id, { name: v.trim() })} />
                </Td>
                <Td className="w-32">
                  <select className={cx(inputCls, "py-1.5")} value={ev.kind} onChange={(e) => update("events", ev.id, { kind: e.target.value })}>
                    <option value="track">Track</option>
                    <option value="field">Field</option>
                    <option value="relay">Relay</option>
                  </select>
                </Td>
                <Td className="w-32">
                  <Cell
                    type="number"
                    value={ev.max_per_school}
                    placeholder="No limit"
                    onSave={(v) => update("events", ev.id, { max_per_school: Number(v) > 0 ? Number(v) : null })}
                  />
                </Td>
                <Td className="w-20">
                  <Cell type="number" value={ev.sort_order} onSave={(v) => update("events", ev.id, { sort_order: Number(v) || 0 })} />
                </Td>
                <Td className="w-20">
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove("events", ev.id, `${ev.name} (entries and results too)`)}>
                    Delete
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
          {!eventCat && <p className="mt-2 text-xs text-slate-500">Pick a category to add an event.</p>}
        </Card>
      )}
    </>
  );
}
