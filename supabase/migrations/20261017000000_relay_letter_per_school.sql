-- Relay letters are fixed per school across every relay: the school's place in the school list
-- (sorted by name) gives its letter, e.g. ARCH BISHOP … = A in KIDDIES, SUB JUNIOR and every other relay.
-- A school's extra teams in the same relay get A2, A3 …

create or replace function public.relabel_relay_teams(p_event bigint) returns void
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(p_event);
  -- Two steps so letters can move between teams without hitting the unique (event, letter) rule.
  update public.relay_teams t set team_label = '~' || t.id
  from (
    select x.id,
      public.relay_label(r.sr::int)
        || case when row_number() over (partition by x.school_id order by x.created_at, x.id) > 1
             then (row_number() over (partition by x.school_id order by x.created_at, x.id))::text else '' end as label
    from public.relay_teams x
    join (select id, row_number() over (order by name) as sr from public.schools) r on r.id = x.school_id
    where x.event_id = p_event
  ) r
  where r.id = t.id and t.team_label <> r.label;

  update public.relay_teams t set team_label = r.label
  from (
    select x.id,
      public.relay_label(r.sr::int)
        || case when row_number() over (partition by x.school_id order by x.created_at, x.id) > 1
             then (row_number() over (partition by x.school_id order by x.created_at, x.id))::text else '' end as label
    from public.relay_teams x
    join (select id, row_number() over (order by name) as sr from public.schools) r on r.id = x.school_id
    where x.event_id = p_event
  ) r
  where r.id = t.id and t.team_label <> r.label;
end;
$$;

-- Adding, removing or renaming a school moves the schools after it, so re-letter every relay.
create or replace function public.schools_relabel_relays() returns trigger
language plpgsql set search_path = '' as $$
declare
  e bigint;
begin
  for e in select distinct event_id from public.relay_teams loop
    perform public.relabel_relay_teams(e);
  end loop;
  return null;
end;
$$;

drop trigger schools_relabel_relays on public.schools;
create trigger schools_relabel_relays
  after insert or delete or update of name on public.schools
  for each statement execute function public.schools_relabel_relays();

-- Existing teams.
do $$
declare
  e bigint;
begin
  for e in select distinct event_id from public.relay_teams loop
    perform public.relabel_relay_teams(e);
  end loop;
end;
$$;
