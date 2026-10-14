import { supabase } from "@/lib/supabase/client";
import type { Athlete, Entry, RelayMember, RelayTeam, Result } from "@/lib/types";
import { fetchAll } from "@/lib/util";

export function loadAthletes() {
  return fetchAll<Athlete>((f, t) => supabase().from("athletes").select("*").order("id").range(f, t));
}

export function loadEntries() {
  return fetchAll<Entry>((f, t) =>
    supabase().from("entries").select("athlete_id,event_id").order("athlete_id").order("event_id").range(f, t),
  );
}

export function loadRelayTeams() {
  return fetchAll<RelayTeam>((f, t) => supabase().from("relay_teams").select("*").order("id").range(f, t));
}

export function loadRelayMembers() {
  return fetchAll<RelayMember>((f, t) =>
    supabase().from("relay_members").select("*").order("team_id").order("athlete_id").range(f, t),
  );
}

export function loadResults() {
  return fetchAll<Result>((f, t) => supabase().from("results").select("*").order("id").range(f, t));
}

export interface MeetSnapshot {
  athletes: Athlete[];
  entries: Entry[];
  teams: RelayTeam[];
  members: RelayMember[];
  results: Result[];
}

export const EMPTY_SNAPSHOT: MeetSnapshot = { athletes: [], entries: [], teams: [], members: [], results: [] };

export async function loadSnapshot(): Promise<MeetSnapshot> {
  const [athletes, entries, teams, members, results] = await Promise.all([
    loadAthletes(),
    loadEntries(),
    loadRelayTeams(),
    loadRelayMembers(),
    loadResults(),
  ]);
  return { athletes, entries, teams, members, results };
}

export const SNAPSHOT_TABLES = ["athletes", "entries", "relay_teams", "relay_members", "results"];
