-- Read-only data for the public /live page: categories and individual-champion scores.
-- No dates of birth or photos; hidden when results are not public (staff always see them).

create function public.public_categories()
returns table (id bigint, name text, sort_order int, counts_for_points boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.sort_order, c.counts_for_points
  from public.categories c
  where public.is_staff() or (select public_results from public.settings where id = 1)
  order by c.sort_order, c.name
$$;

-- Each athlete's individual-event (non-relay) medals and points, for the individual champion of each category.
create function public.public_individual_scores()
returns table (
  athlete_id bigint, category_id bigint, name text, bib int, school text,
  gold int, silver int, bronze int, points int, wins text
)
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.settings where id = 1)
  select a.id, a.category_id, a.name, a.bib, sc.name,
    count(*) filter (where r.position = 1)::int,
    count(*) filter (where r.position = 2)::int,
    count(*) filter (where r.position = 3)::int,
    sum(case r.position when 1 then s.points_first when 2 then s.points_second when 3 then s.points_third else 0 end)::int,
    string_agg(ev.name || ' ' || case r.position when 1 then '1st' when 2 then '2nd' else '3rd' end, ' · ' order by ev.sort_order, r.position)
  from public.results r
  join public.events ev on ev.id = r.event_id and ev.kind <> 'relay'
  join public.athletes a on a.id = r.athlete_id
  join public.schools sc on sc.id = a.school_id
  cross join s
  where public.is_staff() or s.public_results
  group by a.id, a.category_id, a.name, a.bib, sc.name
$$;

grant execute on function public.public_categories() to anon, authenticated;
grant execute on function public.public_individual_scores() to anon, authenticated;
