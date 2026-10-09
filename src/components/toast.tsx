"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cx, errorMessage } from "@/lib/util";

interface ToastItem {
  id: number;
  text: string;
  tone: "ok" | "error";
}

const ToastContext = createContext<{ ok: (t: string) => void; error: (e: unknown) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, tone: ToastItem["tone"]) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3000);
  }, []);

  const ok = useCallback((t: string) => push(t, "ok"), [push]);
  const error = useCallback((e: unknown) => push(errorMessage(e), "error"), [push]);

  return (
    <ToastContext.Provider value={{ ok, error }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2 print:hidden" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg",
              t.tone === "ok" ? "bg-emerald-600" : "bg-red-600",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
