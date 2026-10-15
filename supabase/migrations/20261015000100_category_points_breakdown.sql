-- Points and medals per school per category, for the category-by-category championship grid.
-- Includes every category (also ones that don't count for the overall total); the app adds up the
-- overall column from the categories marked counts_for_points.

create function public.school_category_points()
returns table (school_id bigint, category_id bigint, gold int, silver int, bronze int, points int)
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.settings where id = 1)
  select coalesce(a.school_id, t.school_id), ev.category_id,
    count(*) filter (where r.position = 1)::int,
    count(*) filter (where r.position = 2)::int,
    count(*) filter (where r.position = 3)::int,
    sum(
      case when ev.kind = 'relay' then
        case r.position when 1 then s.relay_points_first when 2 then s.relay_points_second when 3 then s.relay_points_third else 0 end
      else
        case r.position when 1 then s.points_first when 2 then s.points_second when 3 then s.points_third else 0 end
      end
    )::int
  from public.results r
  join public.events ev on ev.id = r.event_id
  left join public.athletes a on a.id = r.athlete_id
  left join public.relay_teams t on t.id = r.relay_team_id
  cross join s
  where public.is_staff() or s.public_results
  group by 1, 2
$$;

grant execute on function public.school_category_points() to anon, authenticated;
