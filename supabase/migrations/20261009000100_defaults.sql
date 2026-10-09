-- Default schools, categories and events (taken from the original single-file app).
-- Admins can change all of these later from Setup.

insert into public.settings (id) values (1) on conflict (id) do nothing;

insert into public.schools (name) values
  ('ARCH BISHOP MAR GREGORIOS PUBLIC SCHOOL'),
  ('CHRISTHU RAJA PUBLIC SCHOOL'),
  ('MATHA SENIOR SECONDARY SCHOOL'),
  ('MARIA BHAVAN ENGLISH MEDIUM SCHOOL'),
  ('ST.JOSEPH''S CENTRAL SCHOOL'),
  ('MOUNT MARY PUBLIC SCHOOL'),
  ('MARY MATHA PUBLIC SCHOOL'),
  ('MARIAN PUBLIC SCHOOL'),
  ('VIMALAMBIKA PUBLIC SCHOOL'),
  ('ST.MARY''S CENTRAL SCHOOL');

insert into public.categories (name, gender, dob_from, sort_order) values
  ('KIDDIES - GIRLS', 'Girls', '2017-01-01', 10),
  ('KIDDIES - BOYS', 'Boys', '2017-01-01', 11),
  ('SUB JUNIOR - GIRLS', 'Girls', '2015-01-01', 20),
  ('SUB JUNIOR - BOYS', 'Boys', '2015-01-01', 21),
  ('JUNIOR - GIRLS', 'Girls', '2013-01-01', 30),
  ('JUNIOR - BOYS', 'Boys', '2013-01-01', 31),
  ('SENIOR - GIRLS', 'Girls', '2011-01-01', 40),
  ('SENIOR - BOYS', 'Boys', '2011-01-01', 41),
  ('SUPER SENIOR - GIRLS', 'Girls', '2008-01-01', 50),
  ('SUPER SENIOR - BOYS', 'Boys', '2008-01-01', 51);

-- Events per age group. 'MIDDLE' becomes 800m for girls and 1500m for boys below.
insert into public.events (category_id, name, kind, sort_order)
select c.id, e.name, e.kind::public.event_kind, e.ord
from public.categories c
join (values
  ('KIDDIES', '50m', 'track', 1), ('KIDDIES', '100m', 'track', 2),
  ('KIDDIES', 'Long Jump', 'field', 3), ('KIDDIES', '4×50m Shuttle Relay', 'relay', 4),
  ('SUB JUNIOR', '100m', 'track', 1), ('SUB JUNIOR', '200m', 'track', 2),
  ('SUB JUNIOR', 'Long Jump', 'field', 3), ('SUB JUNIOR', 'Shot Put', 'field', 4),
  ('SUB JUNIOR', '4×100m Relay', 'relay', 5),
  ('JUNIOR', '100m', 'track', 1), ('JUNIOR', '200m', 'track', 2), ('JUNIOR', '800m', 'track', 3),
  ('JUNIOR', 'Long Jump', 'field', 4), ('JUNIOR', 'Shot Put', 'field', 5), ('JUNIOR', '4×100m Relay', 'relay', 6),
  ('SENIOR', '100m', 'track', 1), ('SENIOR', '200m', 'track', 2), ('SENIOR', 'MIDDLE', 'track', 3),
  ('SENIOR', 'Long Jump', 'field', 4), ('SENIOR', 'Shot Put', 'field', 5), ('SENIOR', '4×100m Relay', 'relay', 6),
  ('SUPER SENIOR', '100m', 'track', 1), ('SUPER SENIOR', '200m', 'track', 2), ('SUPER SENIOR', 'MIDDLE', 'track', 3),
  ('SUPER SENIOR', 'Long Jump', 'field', 4), ('SUPER SENIOR', 'Shot Put', 'field', 5), ('SUPER SENIOR', '4×100m Relay', 'relay', 6)
) as e(grp, name, kind, ord)
  on c.name like e.grp || ' - %';

update public.events ev set name = case when c.gender = 'Girls' then '800m' else '1500m' end
from public.categories c
where c.id = ev.category_id and ev.name = 'MIDDLE';

-- Live updates for the results and certificates screens.
alter publication supabase_realtime add table
  public.results, public.athletes, public.entries, public.relay_teams, public.relay_members;
