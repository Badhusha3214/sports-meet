"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLive, useMeet } from "@/components/meet-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Empty, inputCls, Loading, PageHeader, Table, Td } from "@/components/ui";
import {
  certificatePreviewUrl,
  downloadCertificates,
  meritCertificates,
  participationCertificates,
  safeFileName,
  withNumbers,
  type KeyedCertificate,
} from "@/lib/certificate";
import { EMPTY_SNAPSHOT, loadSnapshot, SNAPSHOT_TABLES } from "@/lib/load";
import { cx, POSITION_LABEL } from "@/lib/util";

export default function CertificatesPage() {
  const meet = useMeet();
  const { schools, categories, settings, ready } = meet;
  const toast = useToast();
  const { data: snap, loading } = useLive(loadSnapshot, EMPTY_SNAPSHOT, SNAPSHOT_TABLES);
  const [tab, setTab] = useState<"merit" | "participation">("merit");
  const [schoolId, setSchoolId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [q, setQ] = useState("");
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const all: KeyedCertificate[] = useMemo(() => {
    if (tab === "merit") {
      const newestFirst = [...snap.results].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return meritCertificates(newestFirst, snap, meet);
    }
    return participationCertificates(snap, meet).sort((a, b) => a.school.localeCompare(b.school) || a.name.localeCompare(b.name));
  }, [tab, snap, meet]);

  // Certificate numbers (W…/P…-check), computed once per list so they can be shown and searched.
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void withNumbers(all, settings?.cert_salt).then((cs) => {
      if (!cancelled) setNumbers(Object.fromEntries(cs.map((c) => [c.key, c.number ?? ""])));
    });
    return () => {
      cancelled = true;
    };
  }, [all, settings?.cert_salt]);

  const needle = q.trim().toLowerCase();
  const list = all.filter(
    (c) =>
      (!schoolId || String(c.schoolId) === schoolId) &&
      (!categoryName || c.category === categoryName) &&
      (!needle || `${c.name} ${c.event} ${c.bib ?? ""} ${numbers[c.key] ?? ""}`.toLowerCase().includes(needle)),
  );

  const preview = list.find((c) => c.key === previewKey) ?? list[0] ?? null;

  // Live PDF preview of the selected certificate, regenerated whenever its data changes.
  useEffect(() => {
    if (!preview) {
      setPreviewUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    certificatePreviewUrl(preview, settings)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else setPreviewUrl((url = u));
      })
      .catch((e) => toast.error(e));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.key, preview?.performance, preview?.position, preview?.event, settings]);

  const download = async (certs: KeyedCertificate[], label: string) => {
    if (!certs.length) return toast.error("Nothing to download.");
    try {
      await downloadCertificates(certs, settings, `${tab === "merit" ? "Merit" : "Participation"}_Certificates_${safeFileName(label)}`);
      toast.ok(`${certs.length} certificate(s) downloaded.`);
    } catch (e) {
      toast.error(e);
    }
  };

  if (!ready || loading) return <Loading />;

  const newest = snap.results.length ? [...snap.results].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : null;
  const isNew = (c: KeyedCertificate) =>
    !!newest && c.resultId !== undefined && Date.now() - Date.parse(snap.results.find((r) => r.id === c.resultId)?.created_at ?? "") < 10 * 60 * 1000;

  return (
    <>
      <PageHeader
        title="Certificates"
        description={
          <>
            Generated automatically from results — no typing needed. Template uses the meet name and signatories from{" "}
            <Link href="/setup" className="text-blue-700 underline">
              Meet Setup
            </Link>
            .
          </>
        }
        actions={
          <Button variant="success" onClick={() => download(list, schoolId ? schools.find((s) => String(s.id) === schoolId)?.name ?? "" : "All")}>
            📜 Download {list.length} as PDF
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["merit", "participation"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setPreviewKey(null);
            }}
            className={cx(
              "rounded-full px-4 py-2 text-sm font-semibold",
              tab === t ? "bg-blue-700 text-white" : "border border-slate-300 bg-white",
            )}
          >
            {t === "merit" ? `🏅 Winners (${meritCertificates(snap.results, snap, meet).length})` : `🎽 Participation (${participationCertificates(snap, meet).length})`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <input className={inputCls} placeholder="Search name, event, bib or certificate no." value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={inputCls} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">All schools</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className={inputCls} value={categoryName} onChange={(e) => setCategoryName(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {!list.length ? (
            <Empty>{tab === "merit" ? "Certificates appear here as soon as winners are entered on Prize Entry." : "No athletes with events yet."}</Empty>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto">
              <Table head={["", "Name", tab === "merit" ? "Event" : "Events", ""]}>
                {list.map((c) => (
                  <tr
                    key={c.key}
                    onClick={() => setPreviewKey(c.key)}
                    className={cx("cursor-pointer", preview?.key === c.key ? "bg-blue-50" : "hover:bg-slate-50")}
                  >
                    <Td className="w-14 text-center">
                      {c.position ? <Badge tone={c.position === 1 ? "amber" : "slate"}>{POSITION_LABEL[c.position]}</Badge> : "🎽"}
                    </Td>
                    <Td>
                      <div className="font-semibold">
                        {c.name} {isNew(c) && <Badge tone="green">NEW</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">{c.school}</div>
                      {numbers[c.key] && <div className="font-mono text-[11px] text-slate-400">No. {numbers[c.key]}</div>}
                    </Td>
                    <Td>
                      <div className="line-clamp-2">{c.event}</div>
                      <div className="text-xs text-slate-500">{c.category}</div>
                    </Td>
                    <Td className="w-12">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          download([c], c.name);
                        }}
                      >
                        ⬇
                      </Button>
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>

        <Card className="xl:sticky xl:top-4 xl:self-start">
          <h2 className="mb-2 font-bold">Preview {preview && <span className="font-normal text-slate-500">— {preview.name}</span>}</h2>
          {previewUrl ? (
            <iframe title="Certificate preview" src={`${previewUrl}#toolbar=0&view=FitH`} className="aspect-[297/210] w-full rounded-lg border border-slate-200" />
          ) : (
            <Empty>Select a certificate to preview it.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
