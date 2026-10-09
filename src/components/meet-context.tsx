"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Category, MeetEvent, Profile, School, Settings } from "@/lib/types";

interface MeetData {
  profile: Profile;
  isAdmin: boolean;
  settings: Settings | null;
  schools: School[];
  categories: Category[];
  events: MeetEvent[];
  schoolById: Map<number, School>;
  categoryById: Map<number, Category>;
  eventById: Map<number, MeetEvent>;
  ready: boolean;
  reload: () => Promise<void>;
}

const MeetContext = createContext<MeetData | null>(null);

/** Loads the meet's reference data (settings, schools, categories, events) once for every page. */
export function MeetProvider({ profile, children }: { profile: Profile; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<MeetEvent[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const sb = supabase();
    const [s, sc, c, e] = await Promise.all([
      sb.from("settings").select("*").eq("id", 1).single(),
      sb.from("schools").select("*").order("name"),
      sb.from("categories").select("*").order("sort_order").order("name"),
      sb.from("events").select("*").order("sort_order").order("name"),
    ]);
    const cats = (c.data as Category[]) ?? [];
    const catOrder = new Map(cats.map((x, i) => [x.id, i]));
    setSettings((s.data as Settings) ?? null);
    setSchools((sc.data as School[]) ?? []);
    setCategories(cats);
    // Events grouped by category order, then their own order within the category.
    setEvents(
      ((e.data as MeetEvent[]) ?? []).sort(
        (a, b) => (catOrder.get(a.category_id) ?? 0) - (catOrder.get(b.category_id) ?? 0) || a.sort_order - b.sort_order,
      ),
    );
    setReady(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<MeetData>(
    () => ({
      profile,
      isAdmin: profile.role === "admin",
      settings,
      schools,
      categories,
      events,
      schoolById: new Map(schools.map((x) => [x.id, x])),
      categoryById: new Map(categories.map((x) => [x.id, x])),
      eventById: new Map(events.map((x) => [x.id, x])),
      ready,
      reload,
    }),
    [profile, settings, schools, categories, events, ready, reload],
  );

  return <MeetContext.Provider value={value}>{children}</MeetContext.Provider>;
}

export function useMeet() {
  const ctx = useContext(MeetContext);
  if (!ctx) throw new Error("useMeet must be used inside MeetProvider");
  return ctx;
}

/**
 * Runs a loader on mount and again whenever any of the given tables change
 * (via Supabase Realtime), so screens stay live across devices.
 */
export function useLive<T>(load: () => Promise<T>, initial: T, tables: string[] = []) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
    } finally {
      setLoading(false);
    }
  }, []);

  const key = tables.join(",");
  useEffect(() => {
    void refresh();
    if (!key) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sb = supabase();
    const channel = sb.channel(`live-${key}-${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 300);
      });
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [key, refresh]);

  return { data, loading, refresh, setData };
}
