-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.
--
-- MCAT practice test log: total score plus the four section scores, so
-- progress can be tracked over time separately from course grades.

create table if not exists practice_tests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  test_date date not null,
  total_score int,
  chem_phys int,
  cars int,
  bio_biochem int,
  psych_soc int,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id)
);

alter table practice_tests enable row level security;

create policy "owner access" on practice_tests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
