"use client";

import { jsPDF } from "jspdf";
import { useState } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Empty, ExportButtons, Field, inputCls, Loading, Note, PageHeader, Table, Td } from "@/components/ui";
import { downloadExcel } from "@/lib/excel";
import { loadAthletes } from "@/lib/load";
import { downloadTablePdf } from "@/lib/pdf";
import { supabase } from "@/lib/supabase/client";
import type { Athlete, Settings } from "@/lib/types";

/** Two large bib cards per A4 page, ready to print and pin on. */
function bibCardsPdf(list: Athlete[], school: (a: Athlete) => string, category: (a: Athlete) => string, s: Settings | null) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  list.forEach((a, i) => {
    if (i > 0 && i % 2 === 0) doc.addPage();
    const top = (i % 2) * 148.5;
    doc.setDrawColor(180);
    doc.setLineDashPattern([2, 2], 0);
    if (i % 2 === 1) doc.line(0, 148.5, W, 148.5);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(18, 59, 104);
    doc.setLineWidth(1.2);
    doc.rect(12, top + 12, W - 24, 124.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(18, 59, 104);
    doc.text((s?.meet_name || "Interschool Sports Meet").toUpperCase(), W / 2, top + 24, { align: "center" });
    doc.setTextColor(0);
    doc.setFontSize(120);
    doc.text(String(a.bib ?? ""), W / 2, top + 88, { align: "center" });
    doc.setFontSize(18);
    doc.text(a.name.toUpperCase(), W / 2, top + 108, { align: "center", maxWidth: W - 40 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`${school(a)}  •  ${category(a)}`, W / 2, top + 118, { align: "center", maxWidth: W - 40 });
  });
  doc.save("Bib_Cards.pdf");
}

export default function BibsPage() {
  const { isAdmin, settings, schools, schoolById, categoryById, reload, ready } = useMeet();
  const toast = useToast();
  const { data: athletes, loading, refresh } = useLive(loadAthletes, [] as Athlete[], ["athletes"]);
  const [start, setStart] = useState<string>("");
  const [order, setOrder] = useState("school");
  const [block, setBlock] = useState<string | null>(null);
  const [schoolFilter, setSchoolFilter] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready || loading) return <Loading />;
  if (!isAdmin) return <Empty>Only an administrator can manage bib numbers.</Empty>;

  const finalized = !!settings?.bibs_finalized;
  const missing = athletes.filter((a) => !a.bib).length;
  const sorted = [...athletes].sort((a, b) => (a.bib ?? 1e9) - (b.bib ?? 1e9) || a.name.localeCompare(b.name));
  const shown = sorted.filter((a) => !schoolFilter || String(a.school_id) === schoolFilter);
  const schoolName = (a: Athlete) => schoolById.get(a.school_id)?.name ?? "";
  const categoryName = (a: Athlete) => categoryById.get(a.category_id)?.name ?? "";

  const run = async (fn: () => PromiseLike<{ data: unknown; error: unknown }>, ok: (d: unknown) => string) => {
    setBusy(true);
    const { data, error } = await fn();
    setBusy(false);
    if (error) return toast.error(error);
    toast.ok(ok(data));
    await Promise.all([refresh(), reload()]);
  };

  // Bibs per school: blank = numbered straight through. Defaults to the last used block, or 100.
  const blockValue = block ?? String(settings?.bib_block ?? 100);

  const allocate = () => {
    if (blockValue && !/^\d+$/.test(blockValue)) return toast.error("Bibs per school must be a whole number.");
    if (athletes.some((a) => a.bib) && !confirm("This renumbers ALL athletes. Continue?")) return;
    void run(
      () =>
        supabase().rpc("allocate_bibs", {
          p_order: order,
          p_start: Number(start || settings?.bib_start || 1001),
          p_block: order === "school" && blockValue ? Number(blockValue) : null,
        }),
      (n) => `${n} bib numbers allocated.`,
    );
  };

  const editBib = async (a: Athlete, value: string) => {
    const v = value.trim();
    if (v === String(a.bib ?? "")) return;
    if (v && !/^\d+$/.test(v)) return toast.error("Bib must be a whole number.");
    const { error } = await supabase().from("athletes").update({ bib: v ? Number(v) : null }).eq("id", a.id);
    if (error) toast.error(error);
    else toast.ok(`Bib for ${a.name} set to ${v || "none"}.`);
    void refresh();
  };

  const rows = () => shown.map((a) => [a.bib ?? "", a.name, schoolName(a), categoryName(a)]);

  return (
    <>
      <PageHeader
        title="Bib Numbers"
        description="One athlete = one permanent bib, used in every event and relay."
        actions={
          <>
            <ExportButtons
              disabled={!shown.length}
              onExcel={() => downloadExcel("Bib_List", [{ name: "Bibs", rows: [["Bib", "Name", "School", "Category"], ...rows()] }])}
              onPdf={() =>
                downloadTablePdf({ filename: "Bib_List", title: "Bib Numbers", settings, sections: [{ head: ["Bib", "Name", "School", "Category"], body: rows() }] })
              }
            />
            <Button
              variant="outline"
              disabled={!shown.some((a) => a.bib)}
              onClick={() => bibCardsPdf(shown.filter((a) => a.bib), schoolName, categoryName, settings)}
            >
              🖨 Bib cards (PDF)
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {finalized ? <Badge tone="green">FINALIZED</Badge> : <Badge tone="amber">Not finalized</Badge>}
          <span className="text-sm text-slate-600">
            {athletes.length - missing} of {athletes.length} athletes have bibs{missing ? ` · ${missing} without` : ""}
          </span>
        </div>
        {finalized ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="success"
              disabled={busy || !missing}
              onClick={() => run(() => supabase().rpc("assign_missing_bibs"), (n) => `${n} late registration(s) given bibs.`)}
            >
              Give bibs to {missing} new athlete(s)
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                confirm("Un-finalize bibs? Numbers can then be changed.") &&
                run(() => supabase().rpc("set_bibs_finalized", { p_value: false }), () => "Bibs un-finalized.")
              }
            >
              Un-finalize
            </Button>
          </div>
        ) : (
          <>
            <Note>
              Finish registrations first, then allocate. Schools are numbered in the order listed (A–Z), each school in one run — e.g.
              100 per school starting at 1: first school 1–100, next school 101–200. Finalize before printing bib cards so numbers
              can&apos;t change by mistake.
            </Note>
            <div className="grid items-end gap-3 sm:grid-cols-5">
              <Field label="Starting bib">
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={start}
                  placeholder={String(settings?.bib_start ?? 1001)}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Number in order of">
                <select className={inputCls} value={order} onChange={(e) => setOrder(e.target.value)}>
                  <option value="school">School, then category</option>
                  <option value="category">Category, then school</option>
                  <option value="name">Athlete name</option>
                </select>
              </Field>
              {order === "school" && (
                <Field label="Bibs per school (blank = no gaps)">
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={blockValue}
                    placeholder="no gaps"
                    onChange={(e) => setBlock(e.target.value)}
                  />
                </Field>
              )}
              <Button onClick={allocate} disabled={busy || !athletes.length}>
                Allocate all
              </Button>
              <Button
                variant="success"
                disabled={busy || !athletes.length}
                onClick={() => run(() => supabase().rpc("set_bibs_finalized", { p_value: true }), () => "Bib numbers finalized.")}
              >
                ✓ Finalize
              </Button>
            </div>
            {!!missing && athletes.length > missing && (
              <Button
                variant="outline"
                className="mt-3"
                disabled={busy}
                onClick={() => run(() => supabase().rpc("assign_missing_bibs"), (n) => `${n} athlete(s) given bibs.`)}
              >
                Only give bibs to the {missing} without one
              </Button>
            )}
          </>
        )}
      </Card>

      <Card>
        <select className={`${inputCls} mb-3 max-w-sm`} value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
          <option value="">All schools</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {!shown.length ? (
          <Empty>No athletes registered.</Empty>
        ) : (
          <Table head={["Bib", "Name", "School", "Category"]}>
            {shown.map((a) => (
              <tr key={a.id}>
                <Td>
                  <input
                    key={`${a.id}-${a.bib}`}
                    className={`${inputCls} w-24 font-bold`}
                    defaultValue={a.bib ?? ""}
                    disabled={finalized && !!a.bib}
                    inputMode="numeric"
                    onBlur={(e) => editBib(a, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                </Td>
                <Td className="font-semibold">{a.name}</Td>
                <Td className="text-xs">{schoolName(a)}</Td>
                <Td className="text-xs">{categoryName(a)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
