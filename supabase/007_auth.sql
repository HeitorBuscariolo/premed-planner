-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.
--
-- Adds per-row ownership so each signed-in user only ever sees their own
-- data, replacing the permissive "allow all" policies used during the
-- no-auth prototype phase.

alter table courses add column if not exists user_id uuid references auth.users(id);
alter table tasks add column if not exists user_id uuid references auth.users(id);
alter table exams add column if not exists user_id uuid references auth.users(id);
alter table long_range_items add column if not exists user_id uuid references auth.users(id);
alter table grade_components add column if not exists user_id uuid references auth.users(id);
alter table review_topics add column if not exists user_id uuid references auth.users(id);

drop policy if exists "allow all on courses" on courses;
drop policy if exists "allow all on tasks" on tasks;
drop policy if exists "allow all on exams" on exams;
drop policy if exists "allow all on long_range_items" on long_range_items;
drop policy if exists "allow all on grade_components" on grade_components;
drop policy if exists "allow all on review_topics" on review_topics;

create policy "owner access" on courses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on exams for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on long_range_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on grade_components for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on review_topics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- After signing up in the app, run this once (with your own email) to claim
-- the existing seed/demo data instead of starting with an empty chart:
--
-- update courses set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
-- update tasks set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
-- update exams set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
-- update long_range_items set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
-- update grade_components set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
-- update review_topics set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
