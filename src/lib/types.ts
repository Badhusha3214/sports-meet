export type Role = "admin" | "entry";
export type Gender = "Boys" | "Girls";
export type EventKind = "track" | "field" | "relay";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string;
  role: Role;
  created_at: string;
}

export interface Settings {
  id: 1;
  meet_name: string;
  venue: string;
  meet_date: string | null;
  organiser: string;
  principal_name: string;
  director_name: string;
  bib_start: number;
  bibs_finalized: boolean;
  points_first: number;
  points_second: number;
  points_third: number;
  relay_points_first: number;
  relay_points_second: number;
  relay_points_third: number;
  public_results: boolean;
}

export interface School {
  id: number;
  name: string;
  short_code: string | null;
}

export interface Category {
  id: number;
  name: string;
  gender: Gender;
  dob_from: string;
  dob_to: string | null;
  sort_order: number;
  /** False = results don't add to the overall school championship (e.g. Super Senior). */
  counts_for_points: boolean;
}

export interface MeetEvent {
  id: number;
  category_id: number;
  name: string;
  kind: EventKind;
  max_per_school: number | null;
  sort_order: number;
}

export interface Athlete {
  id: number;
  school_id: number;
  category_id: number;
  name: string;
  dob: string;
  gender: Gender;
  bib: number | null;
  photo_path: string | null;
  created_at: string;
}

export interface Entry {
  athlete_id: number;
  event_id: number;
}

export interface RelayTeam {
  id: number;
  event_id: number;
  school_id: number;
  team_label: string;
}

export interface RelayMember {
  team_id: number;
  athlete_id: number;
}

/** Runners allowed in one relay team (4 run, the rest are reserves). */
export const RELAY_MIN = 4;
export const RELAY_MAX = 7;

export interface Result {
  id: number;
  event_id: number;
  athlete_id: number | null;
  relay_team_id: number | null;
  position: 1 | 2 | 3;
  performance: string;
  created_at: string;
}

export interface PointsRow {
  school_id: number;
  school: string;
  gold: number;
  silver: number;
  bronze: number;
  points: number;
}
