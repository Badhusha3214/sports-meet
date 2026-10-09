"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMeet } from "@/components/meet-context";
import { supabase } from "@/lib/supabase/client";
import { cx } from "@/lib/util";

const NAV: { href: string; label: string; icon: string; admin?: boolean }[] = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/results", label: "Prize Entry", icon: "🏅" },
  { href: "/certificates", label: "Certificates", icon: "📜" },
  { href: "/athletes", label: "Athletes", icon: "🏃" },
  { href: "/import", label: "Excel Import", icon: "📥" },
  { href: "/events", label: "Start Lists", icon: "📋" },
  { href: "/relays", label: "Relay Teams", icon: "🔁" },
  { href: "/points", label: "Points Table", icon: "🏆" },
  { href: "/bibs", label: "Bib Numbers", icon: "🔢", admin: true },
  { href: "/setup", label: "Meet Setup", icon: "⚙️", admin: true },
  { href: "/users", label: "Users", icon: "👥", admin: true },
  { href: "/backup", label: "Backup", icon: "💾", admin: true },
];

export function Shell({ children }: { children: ReactNode }) {
  const { profile, isAdmin, settings } = useMeet();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const items = NAV.filter((n) => !n.admin || isAdmin);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside
        className={cx(
          "z-40 w-full shrink-0 bg-[#123b68] text-white print:hidden lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:overflow-y-auto",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/" className="block leading-tight" onClick={() => setOpen(false)}>
            <div className="text-xs uppercase tracking-widest text-blue-200">Sports Meet</div>
            <div className="text-sm font-bold">{settings?.meet_name || "Interschool Sports Meet"}</div>
          </Link>
          <button className="rounded-md px-2 py-1 text-2xl lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            ☰
          </button>
        </div>
        <nav className={cx("px-2 pb-4", open ? "block" : "hidden lg:block")}>
          {items.map((n, i) => (
            <div key={n.href}>
              {n.admin && !items[i - 1]?.admin && (
                <div className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-blue-300">Admin</div>
              )}
              <Link
                href={n.href}
                onClick={() => setOpen(false)}
                className={cx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                  active(n.href) ? "bg-white text-[#123b68]" : "text-blue-50 hover:bg-white/10",
                )}
              >
                <span aria-hidden>{n.icon}</span>
                {n.label}
              </Link>
            </div>
          ))}
          <a
            href="/live"
            target="_blank"
            className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-100 hover:bg-white/10"
          >
            <span aria-hidden>📺</span> Public results ↗
          </a>
          <div className="mt-4 border-t border-white/15 px-3 pt-3 text-xs text-blue-200">
            <div className="truncate font-semibold text-white">{profile.full_name || profile.email}</div>
            <div>{isAdmin ? "Administrator" : "Data entry"}</div>
            <button onClick={signOut} className="mt-2 rounded-md bg-white/10 px-3 py-1.5 font-semibold text-white hover:bg-white/20">
              Sign out
            </button>
          </div>
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 print:p-0">{children}</main>
    </div>
  );
}
