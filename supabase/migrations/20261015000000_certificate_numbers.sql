-- Certificate numbers.
--   Winner:        W<result id>-<athlete id>-<check>   e.g. W00042-00137-7F3A
--   Participation: P<athlete id>-<check>               e.g. P00137-1B2C
-- The 4-character check code is a hash with a secret per-meet salt, so numbers can't be guessed in
-- sequence. Numbers are derived from the records, so re-printing always gives the same number, and a
-- certificate stops verifying if its result is removed.

alter table public.settings add column cert_salt text not null default replace(gen_random_uuid()::text, '-', '');

create function public.certificate_check(p_salt text, p_core text) returns text
language sql immutable set search_path = '' as $$
  select upper(substr(encode(sha256(convert_to(p_salt || ':' || p_core, 'UTF8')), 'hex'), 1, 4))
$$;

-- Looks a certificate up by its number. Returns null if the number is wrong or the certificate no longer exists.
create function public.verify_certificate(p_no text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  n text := upper(regexp_replace(coalesce(p_no, ''), '\s', '', 'g'));
  m text[];
  s public.settings;
  r public.results;
  a public.athletes;
  ev public.events;
  meet jsonb;
  events_text text;
begin
  select * into s from public.settings where id = 1;
  if not (public.is_staff() or s.public_results) then
    return null;
  end if;
  meet := jsonb_build_object(
    'meet_name', s.meet_name, 'venue', s.venue, 'meet_date', s.meet_date, 'organiser', s.organiser,
    'director_name', s.director_name, 'principal_name', s.principal_name);

  m := regexp_match(n, '^(W(\d+)-(\d+))-([0-9A-F]{4})$');
  if m is not null then
    if public.certificate_check(s.cert_salt, m[1]) <> m[4] then return null; end if;
    select * into r from public.results where id = m[2]::bigint;
    if not found then return null; end if;
    select * into a from public.athletes where id = m[3]::bigint;
    if not found then return null; end if;
    if not (r.athlete_id = a.id or exists (
      select 1 from public.relay_members rm where rm.team_id = r.relay_team_id and rm.athlete_id = a.id)) then
      return null;
    end if;
    select * into ev from public.events where id = r.event_id;
    return meet || jsonb_build_object(
      'kind', 'merit', 'number', n, 'name', a.name, 'gender', a.gender, 'bib', a.bib,
      'school', (select name from public.schools where id = a.school_id),
      'category', (select name from public.categories where id = ev.category_id),
      'event', ev.name, 'position', r.position, 'performance', r.performance);
  end if;

  m := regexp_match(n, '^(P(\d+))-([0-9A-F]{4})$');
  if m is not null then
    if public.certificate_check(s.cert_salt, m[1]) <> m[3] then return null; end if;
    select * into a from public.athletes where id = m[2]::bigint;
    if not found then return null; end if;
    select string_agg(x.name, ', ' order by x.sort_order, x.name) into events_text from (
      select e.name, e.sort_order from public.entries en join public.events e on e.id = en.event_id where en.athlete_id = a.id
      union
      select e.name, e.sort_order from public.relay_members rm
        join public.relay_teams t on t.id = rm.team_id join public.events e on e.id = t.event_id
      where rm.athlete_id = a.id
    ) x;
    if events_text is null then return null; end if;
    return meet || jsonb_build_object(
      'kind', 'participation', 'number', n, 'name', a.name, 'gender', a.gender, 'bib', a.bib,
      'school', (select name from public.schools where id = a.school_id),
      'category', (select name from public.categories where id = a.category_id),
      'event', events_text);
  end if;

  return null;
end;
$$;

grant execute on function public.verify_certificate(text) to anon, authenticated;

-- Restore keeps the backup's salt so certificate numbers printed before stay valid.
create or replace function public.restore_backup(p jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can restore a backup.';
  end if;
  if p ->> 'app' is distinct from 'sports-meet' then
    raise exception 'This file is not a Sports Meet backup.';
  end if;

  delete from public.results;
  delete from public.relay_members;
  delete from public.relay_teams;
  delete from public.entries;
  delete from public.athletes;
  delete from public.events;
  delete from public.categories;
  delete from public.schools;

  update public.settings s set
    meet_name = x.meet_name, venue = x.venue, meet_date = x.meet_date, organiser = x.organiser,
    principal_name = x.principal_name, director_name = x.director_name, bib_start = x.bib_start,
    bibs_finalized = false, points_first = x.points_first, points_second = x.points_second,
    points_third = x.points_third,
    relay_points_first = coalesce(x.relay_points_first, 10),
    relay_points_second = coalesce(x.relay_points_second, 6),
    relay_points_third = coalesce(x.relay_points_third, 4),
    public_results = x.public_results,
    cert_salt = coalesce(nullif(x.cert_salt, ''), s.cert_salt)
  from jsonb_populate_record(null::public.settings, p -> 'settings') x
  where s.id = 1;

  insert into public.schools (id, name, short_code, created_at)
  select id, name, short_code, coalesce(created_at, now())
  from jsonb_populate_recordset(null::public.schools, coalesce(p -> 'schools', '[]'));

  insert into public.categories (id, name, gender, dob_from, dob_to, sort_order, counts_for_points)
  select id, name, gender, dob_from, dob_to, sort_order, coalesce(counts_for_points, true)
  from jsonb_populate_recordset(null::public.categories, coalesce(p -> 'categories', '[]'));

  insert into public.events (id, category_id, name, kind, max_per_school, sort_order)
  select id, category_id, name, kind, max_per_school, sort_order
  from jsonb_populate_recordset(null::public.events, coalesce(p -> 'events', '[]'));

  insert into public.athletes (id, school_id, category_id, name, dob, gender, bib, photo_path, created_at, updated_at)
  select id, school_id, category_id, name, dob, gender, bib, photo_path, coalesce(created_at, now()), coalesce(updated_at, now())
  from jsonb_populate_recordset(null::public.athletes, coalesce(p -> 'athletes', '[]'));

  insert into public.entries (athlete_id, event_id, created_at)
  select athlete_id, event_id, coalesce(created_at, now())
  from jsonb_populate_recordset(null::public.entries, coalesce(p -> 'entries', '[]'));

  -- Teams whose letter is unique within their relay keep it; the rest get the next free letter.
  create temp table restore_teams on commit drop as
  select id, event_id, school_id, team_label, coalesce(created_at, now()) as created_at,
    count(*) over (partition by event_id, upper(trim(team_label))) = 1 as keep_label
  from jsonb_populate_recordset(null::public.relay_teams, coalesce(p -> 'relay_teams', '[]'));

  insert into public.relay_teams (id, event_id, school_id, team_label, created_at)
  select id, event_id, school_id, team_label, created_at from restore_teams where keep_label order by id;
  insert into public.relay_teams (id, event_id, school_id, team_label, created_at)
  select id, event_id, school_id, null, created_at from restore_teams where not keep_label order by id;

  insert into public.relay_members (team_id, athlete_id)
  select distinct team_id, athlete_id
  from jsonb_to_recordset(coalesce(p -> 'relay_members', '[]')) as m(team_id bigint, athlete_id bigint);

  insert into public.results (id, event_id, athlete_id, relay_team_id, position, performance, created_at)
  select id, event_id, athlete_id, relay_team_id, position, coalesce(performance, ''), coalesce(created_at, now())
  from jsonb_populate_recordset(null::public.results, coalesce(p -> 'results', '[]'));

  update public.settings s set bibs_finalized = coalesce((p -> 'settings' ->> 'bibs_finalized')::boolean, false) where s.id = 1;

  perform setval(pg_get_serial_sequence('public.schools', 'id'), coalesce((select max(id) from public.schools), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.categories', 'id'), coalesce((select max(id) from public.categories), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.events', 'id'), coalesce((select max(id) from public.events), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.athletes', 'id'), coalesce((select max(id) from public.athletes), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.relay_teams', 'id'), coalesce((select max(id) from public.relay_teams), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.results', 'id'), coalesce((select max(id) from public.results), 0) + 1, false);
end;
$$;

revoke execute on function public.restore_backup(jsonb) from public, anon;
