"use client";

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/util";

type Variant = "primary" | "success" | "danger" | "outline" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-blue-700 text-white hover:bg-blue-800",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-2.5 py-1.5 text-xs",
        size === "md" && "px-3.5 py-2 text-sm",
        size === "lg" && "px-5 py-3 text-base",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "blue" | "red" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    red: "bg-red-100 text-red-700",
  };
  return <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Loading() {
  return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
}

export function Note({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "blue" }) {
  return (
    <div
      className={cx(
        "mb-4 rounded-lg border-l-4 px-3 py-2 text-sm",
        tone === "amber" ? "border-amber-500 bg-amber-50 text-amber-900" : "border-blue-500 bg-blue-50 text-blue-900",
      )}
    >
      {children}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx("my-8 w-full rounded-xl bg-white shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="rounded p-1 text-2xl leading-none text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Simple table wrapper with horizontal scroll on small screens. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("px-3 py-2 align-middle", className)}>{children}</td>;
}

export function ExportButtons({ onExcel, onPdf, disabled }: { onExcel: () => void; onPdf: () => void; disabled?: boolean }) {
  return (
    <>
      <Button variant="outline" onClick={onExcel} disabled={disabled}>
        ⬇ Excel
      </Button>
      <Button variant="outline" onClick={onPdf} disabled={disabled}>
        ⬇ PDF
      </Button>
    </>
  );
}
