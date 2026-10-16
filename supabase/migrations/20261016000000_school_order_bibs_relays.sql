-- Bibs and relay letters follow the school order (schools sorted by name, as listed in the app).
-- Bibs can be given in fixed blocks per school, e.g. 100 each: first school 1–100, next school 101–200 …
-- Relay team letters go A, B, C … in school order within each relay.

alter table public.settings add column bib_block int check (bib_block is null or bib_block > 0);

-- ---------------------------------------------------------------------------
-- Bib allocation
-- ---------------------------------------------------------------------------

drop function public.allocate_bibs(text, int);

-- Renumbers every athlete. p_order: 'school' | 'category' | 'name'.
-- With p_order = 'school' and p_block set, each school gets its own block of p_block numbers.
create function public.allocate_bibs(p_order text, p_start int, p_block int default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
  big record;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can allocate bib numbers.';
  end if;
  if (select bibs_finalized from public.settings where id = 1) then
    raise exception 'Bib numbers are finalized. Un-finalize them first.';
  end if;
  if p_start is null or p_start < 1 then
    raise exception 'Starting bib must be a positive number.';
  end if;
  if p_block is not null and p_block < 1 then
    raise exception 'Bibs per school must be a positive number.';
  end if;
  if p_order <> 'school' then
    p_block := null;
  end if;

  if p_block is not null then
    select s.name, count(*) as n into big
    from public.athletes a join public.schools s on s.id = a.school_id
    group by s.name having count(*) > p_block
    order by count(*) desc limit 1;
    if found then
      raise exception '% has % athletes, more than % bibs per school. Use a bigger block.', big.name, big.n, p_block;
    end if;
  end if;

  update public.athletes set bib = null where bib is not null;

  if p_block is not null then
    with ranks as (
      select id, row_number() over (order by name) as sr from public.schools
    ), ordered as (
      select a.id, r.sr,
        row_number() over (partition by a.school_id order by c.sort_order, lower(a.name), a.id) as rn
      from public.athletes a
      join ranks r on r.id = a.school_id
      join public.categories c on c.id = a.category_id
    )
    update public.athletes a set bib = p_start + (o.sr - 1) * p_block + o.rn - 1
    from ordered o where o.id = a.id;
  else
    with ordered as (
      select a.id, row_number() over (
        order by
          case when p_order = 'school' then s.name end,
          case when p_order in ('school', 'category') then c.sort_order end,
          case when p_order = 'category' then s.name end,
          lower(a.name), a.id
      ) as rn
      from public.athletes a
      join public.schools s on s.id = a.school_id
      join public.categories c on c.id = a.category_id
    )
    update public.athletes a set bib = p_start + o.rn - 1
    from ordered o where o.id = a.id;
  end if;

  get diagnostics n = row_count;
  update public.settings set bib_start = p_start, bib_block = p_block where id = 1;
  return n;
end;
$$;

-- Gives bibs only to athletes who don't have one. With blocks, a late athlete gets the next free
-- number in their school's block (a school with no bibs yet gets a new block after the last one);
-- without blocks, numbering continues after the highest bib.
create or replace function public.assign_missing_bibs()
returns int
language plpgsql security definer set search_path = '' as $$
declare
  st public.settings;
  a record;
  lo int;
  nb int;
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can allocate bib numbers.';
  end if;
  select * into st from public.settings where id = 1;

  if st.bib_block is null then
    select greatest(coalesce(max(bib), 0) + 1, st.bib_start) into nb from public.athletes;
    with ordered as (
      select id, row_number() over (order by created_at, id) as rn
      from public.athletes where bib is null
    )
    update public.athletes x set bib = nb + o.rn - 1
    from ordered o where o.id = x.id;
    get diagnostics n = row_count;
    return n;
  end if;

  for a in
    select x.id, x.school_id, s.name as school
    from public.athletes x join public.schools s on s.id = x.school_id
    where x.bib is null order by s.name, x.created_at, x.id
  loop
    select st.bib_start + ((min(bib) - st.bib_start) / st.bib_block) * st.bib_block into lo
    from public.athletes where school_id = a.school_id and bib >= st.bib_start;
    if lo is null then
      select st.bib_start + (coalesce((max(bib) - st.bib_start) / st.bib_block, -1) + 1) * st.bib_block into lo
      from public.athletes where bib >= st.bib_start;
    end if;
    select coalesce(max(bib) + 1, lo) into nb
    from public.athletes where bib between lo and lo + st.bib_block - 1;
    if nb > lo + st.bib_block - 1 then
      raise exception 'No free bib left in the block for % (% to %).', a.school, lo, lo + st.bib_block - 1;
    end if;
    update public.athletes set bib = nb where id = a.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.allocate_bibs(text, int, int) from public, anon;
revoke execute on function public.assign_missing_bibs() from public, anon;

-- ---------------------------------------------------------------------------
-- Relay team letters in school order
-- ---------------------------------------------------------------------------

-- Re-letters every team of a relay: A, B, C … by school name, then by when the team was added.
create function public.relabel_relay_teams(p_event bigint) returns void
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(p_event);
  -- Two steps so letters can swap between teams without hitting the unique (event, letter) rule.
  update public.relay_teams t set team_label = '~' || t.id
  from (
    select x.id, public.relay_label(row_number() over (order by s.name, x.created_at, x.id)::int) as label
    from public.relay_teams x join public.schools s on s.id = x.school_id
    where x.event_id = p_event
  ) r
  where r.id = t.id and t.team_label <> r.label;

  update public.relay_teams t set team_label = r.label
  from (
    select x.id, public.relay_label(row_number() over (order by s.name, x.created_at, x.id)::int) as label
    from public.relay_teams x join public.schools s on s.id = x.school_id
    where x.event_id = p_event
  ) r
  where r.id = t.id and t.team_label <> r.label;
end;
$$;

create function public.relay_teams_relabel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.relabel_relay_teams(new.event_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.event_id <> new.event_id) then
    perform public.relabel_relay_teams(old.event_id);
  end if;
  return null;
end;
$$;

create trigger relay_teams_relabel
  after insert or delete or update of school_id, event_id on public.relay_teams
  for each row execute function public.relay_teams_relabel();

-- A renamed school can move in the order, so re-letter every relay it is in.
create function public.schools_relabel_relays() returns trigger
language plpgsql set search_path = '' as $$
declare
  e bigint;
begin
  for e in select distinct t.event_id from public.relay_teams t where t.school_id = new.id loop
    perform public.relabel_relay_teams(e);
  end loop;
  return null;
end;
$$;

create trigger schools_relabel_relays
  after update of name on public.schools
  for each row when (old.name is distinct from new.name)
  execute function public.schools_relabel_relays();

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
