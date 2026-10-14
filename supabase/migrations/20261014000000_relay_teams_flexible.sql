-- Relay teams: no legs, up to 7 runners, and a distinct letter for every team in a relay
-- (A, B, C … across all schools) assigned automatically.

-- 1 → A, 26 → Z, 27 → AA …
create function public.relay_label(n int) returns text
language plpgsql immutable set search_path = '' as $$
declare
  s text := '';
begin
  while n > 0 loop
    n := n - 1;
    s := chr(65 + n % 26) || s;
    n := n / 26;
  end loop;
  return s;
end;
$$;

-- Team letters become unique per relay event instead of per school.
alter table public.relay_teams drop constraint relay_teams_event_id_school_id_team_label_key;
alter table public.relay_teams alter column team_label drop default;

with ordered as (
  select id, row_number() over (partition by event_id order by created_at, id) as rn from public.relay_teams
)
update public.relay_teams t set team_label = '~' || o.rn from ordered o where o.id = t.id;
with ordered as (
  select id, row_number() over (partition by event_id order by created_at, id) as rn from public.relay_teams
)
update public.relay_teams t set team_label = public.relay_label(o.rn::int) from ordered o where o.id = t.id;

alter table public.relay_teams add constraint relay_teams_event_id_team_label_key unique (event_id, team_label);

create or replace function public.validate_relay_team() returns trigger
language plpgsql set search_path = '' as $$
declare
  ev public.events;
  taken int;
  i int := 1;
begin
  select * into ev from public.events where id = new.event_id;
  if ev.kind <> 'relay' then
    raise exception '% is not a relay event.', ev.name;
  end if;
  if ev.max_per_school is not null then
    select count(*) into taken from public.relay_teams
    where event_id = new.event_id and school_id = new.school_id and id <> new.id;
    if taken >= ev.max_per_school then
      raise exception 'Limit reached: a school may enter at most % team(s) in %.', ev.max_per_school, ev.name;
    end if;
  end if;

  -- One team at a time per event, so two people adding teams together can't get the same letter.
  perform pg_advisory_xact_lock(new.event_id);
  new.team_label := upper(trim(coalesce(new.team_label, '')));
  if new.team_label = '' then
    while exists (select 1 from public.relay_teams where event_id = new.event_id and team_label = public.relay_label(i) and id <> new.id) loop
      i := i + 1;
    end loop;
    new.team_label := public.relay_label(i);
  end if;
  return new;
end;
$$;

-- Members: no leg numbers, at most 7 runners per team.
alter table public.relay_members drop column leg;
alter table public.relay_members drop constraint relay_members_team_id_athlete_id_key;
alter table public.relay_members add primary key (team_id, athlete_id);

create or replace function public.validate_relay_member() returns trigger
language plpgsql set search_path = '' as $$
declare
  t public.relay_teams;
  ev public.events;
  a public.athletes;
begin
  select * into t from public.relay_teams where id = new.team_id;
  select * into ev from public.events where id = t.event_id;
  select * into a from public.athletes where id = new.athlete_id;
  if a.school_id <> t.school_id then
    raise exception '% is not from this team''s school.', a.name;
  end if;
  if a.category_id <> ev.category_id then
    raise exception '% is not in the % category for this relay.', a.name, (select name from public.categories where id = ev.category_id);
  end if;
  if exists (
    select 1 from public.relay_members m join public.relay_teams t2 on t2.id = m.team_id
    where m.athlete_id = new.athlete_id and t2.event_id = t.event_id and m.team_id <> new.team_id
  ) then
    raise exception '% is already in another team for this relay.', a.name;
  end if;
  if (select count(*) from public.relay_members where team_id = new.team_id and athlete_id <> new.athlete_id) >= 7 then
    raise exception 'A relay team can have at most 7 runners.';
  end if;
  return new;
end;
$$;

-- Restore: no legs; team letters kept when unique in the backup, otherwise reassigned.
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
    public_results = x.public_results
  from jsonb_populate_record(null::public.settings, p -> 'settings') x
  where s.id = 1;

  insert into public.schools (id, name, short_code, created_at)
  select id, name, short_code, coalesce(created_at, now())
  from jsonb_populate_recordset(null::public.schools, coalesce(p -> 'schools', '[]'));

  insert into public.categories (id, name, gender, dob_from, dob_to, sort_order)
  select id, name, gender, dob_from, dob_to, sort_order
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
