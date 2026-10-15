"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Button, inputCls } from "@/components/ui";
import { downloadCertificates, safeFileName, type CertificateData } from "@/lib/certificate";
import { supabase } from "@/lib/supabase/client";
import type { Gender, Settings } from "@/lib/types";
import { errorMessage, fmtDate, POSITION_WORD } from "@/lib/util";

interface Verified {
  kind: "merit" | "participation";
  number: string;
  name: string;
  gender: Gender;
  bib: number | null;
  school: string;
  category: string;
  event: string;
  position?: 1 | 2 | 3;
  performance?: string;
  meet_name: string;
  venue: string;
  meet_date: string | null;
  organiser: string;
  director_name: string;
  principal_name: string;
}

/** Public page: look a certificate up by its number, check it's genuine, and download it again. */
function VerifyInner() {
  const params = useSearchParams();
  const [no, setNo] = useState(params.get("no") ?? "");
  const [result, setResult] = useState<Verified | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async (value: string) => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("verify_certificate", { p_no: v });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setResult((data as Verified | null) ?? null);
  }, []);

  useEffect(() => {
    const initial = params.get("no");
    if (initial) void check(initial);
  }, [params, check]);

  const download = async () => {
    if (!result) return;
    const cert: CertificateData = {
      kind: result.kind,
      number: result.number,
      name: result.name,
      gender: result.gender,
      school: result.school,
      category: result.category,
      event: result.event,
      position: result.position,
      performance: result.performance,
      bib: result.bib,
    };
    // Only the fields the certificate designs print; the rest are irrelevant here.
    const settings = {
      meet_name: result.meet_name,
      venue: result.venue,
      meet_date: result.meet_date,
      organiser: result.organiser,
      director_name: result.director_name,
      principal_name: result.principal_name,
    } as Settings;
    try {
      await downloadCertificates([cert], settings, `Certificate_${safeFileName(result.number)}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-[#123b68] px-4 py-6 text-center text-white">
        <h1 className="text-2xl font-bold">Verify a Certificate</h1>
        <p className="text-blue-100">Enter the certificate number printed at the bottom of the certificate.</p>
      </header>
      <main className="mx-auto max-w-xl p-4">
        <form
          className="flex gap-2 rounded-xl bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void check(no);
          }}
        >
          <input
            className={`${inputCls} font-mono uppercase`}
            placeholder="e.g. W00042-00137-7F3A"
            value={no}
            onChange={(e) => setNo(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={busy || !no.trim()}>
            {busy ? "Checking…" : "Verify"}
          </Button>
        </form>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {result === null && (
          <div className="mt-4 rounded-xl border-2 border-red-200 bg-white p-6 text-center">
            <div className="text-3xl">✗</div>
            <p className="mt-1 font-semibold text-red-700">No certificate found with this number.</p>
            <p className="mt-1 text-sm text-slate-500">Check the number and try again. Numbers look like W00042-00137-7F3A or P00137-1B2C.</p>
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-white p-6">
            <div className="mb-3 flex items-center gap-2 text-emerald-700">
              <span className="text-2xl">✓</span>
              <span className="font-bold">Genuine certificate</span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Certificate No.</dt>
              <dd className="font-mono font-semibold">{result.number}</dd>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-semibold">{result.name}</dd>
              <dt className="text-slate-500">School</dt>
              <dd>{result.school}</dd>
              <dt className="text-slate-500">Category</dt>
              <dd>{result.category}</dd>
              <dt className="text-slate-500">{result.kind === "merit" ? "Event" : "Events"}</dt>
              <dd>{result.event}</dd>
              {result.kind === "merit" && result.position && (
                <>
                  <dt className="text-slate-500">Position</dt>
                  <dd className="font-bold text-amber-700">
                    {POSITION_WORD[result.position]}
                    {result.performance && <span className="ml-2 font-normal text-slate-600">({result.performance})</span>}
                  </dd>
                </>
              )}
              <dt className="text-slate-500">Meet</dt>
              <dd>{[result.meet_name, result.venue, fmtDate(result.meet_date)].filter(Boolean).join(" • ")}</dd>
            </dl>
            <Button variant="success" className="mt-5 w-full" onClick={download}>
              ⬇ Download certificate (PDF)
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-sm">
          <a href="/live" className="text-blue-700 hover:underline">
            View live results →
          </a>
        </p>
      </main>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
