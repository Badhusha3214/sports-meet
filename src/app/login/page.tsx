"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Field, inputCls } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    params.get("e") === "noprofile" ? "Your account has no access to this meet. Ask the admin." : "",
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    router.replace("/");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
      <div className="text-center">
        <div className="text-4xl">🏅</div>
        <h1 className="mt-2 text-xl font-bold text-slate-900">Sports Meet Manager</h1>
        <p className="text-sm text-slate-500">Sign in to continue</p>
      </div>
      <Field label="Email">
        <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Field label="Password">
        <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-center gap-4 text-sm">
        <a href="/live" className="text-blue-700 hover:underline">
          Public results →
        </a>
        <a href="/verify" className="text-blue-700 hover:underline">
          Verify a certificate →
        </a>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#123b68] to-[#1769aa] p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
