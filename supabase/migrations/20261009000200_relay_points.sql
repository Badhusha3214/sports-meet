-- Separate points for relays (1st 10, 2nd 6, 3rd 4) instead of a multiplier.
-- Individual events: 1st 5, 2nd 3, 3rd 1.

alter table public.settings
  add column relay_points_first int not null default 10,
  add column relay_points_second int not null default 6,
  add column relay_points_third int not null default 4;

update public.settings set
  points_first = 5, points_second = 3, points_third = 1,
  relay_points_first = 10, relay_points_second = 6, relay_points_third = 4
where id = 1;

create or replace function public.school_points()
returns table (school_id bigint, school text, gold int, silver int, bronze int, points int)
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.settings where id = 1),
  placed as (
    select coalesce(a.school_id, t.school_id) as school_id, r.position, ev.kind
    from public.results r
    join public.events ev on ev.id = r.event_id
    left join public.athletes a on a.id = r.athlete_id
    left join public.relay_teams t on t.id = r.relay_team_id
  )
  select sc.id, sc.name,
    count(*) filter (where p.position = 1)::int,
    count(*) filter (where p.position = 2)::int,
    count(*) filter (where p.position = 3)::int,
    coalesce(sum(
      case when p.kind = 'relay' then
        case p.position when 1 then s.relay_points_first when 2 then s.relay_points_second when 3 then s.relay_points_third else 0 end
      else
        case p.position when 1 then s.points_first when 2 then s.points_second when 3 then s.points_third else 0 end
      end
    ), 0)::int
  from public.schools sc
  cross join s
  left join placed p on p.school_id = sc.id
  where public.is_staff() or s.public_results
  group by sc.id, sc.name
  order by 6 desc, 3 desc, 4 desc, 5 desc, sc.name
$$;

-- restore_backup copied the old multiplier column; redefine it for the new relay points columns.
-- Older backups without relay points restore with the defaults (10/6/4).
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

  insert into public.relay_teams (id, event_id, school_id, team_label, created_at)
  select id, event_id, school_id, team_label, coalesce(created_at, now())
  from jsonb_populate_recordset(null::public.relay_teams, coalesce(p -> 'relay_teams', '[]'));

  insert into public.relay_members (team_id, athlete_id, leg)
  select team_id, athlete_id, leg
  from jsonb_populate_recordset(null::public.relay_members, coalesce(p -> 'relay_members', '[]'));

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

alter table public.settings drop column relay_points_multiplier;
