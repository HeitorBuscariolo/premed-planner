-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.
--
-- Shadowing hours tracker: individual logged sessions (shadowing_logs) plus
-- a one-row-per-user goal (settings). Kept as two small tables rather than
-- bolting a goal column onto an existing table, since it's a standalone
-- per-user preference, not tied to any course/exam/task.

create table if not exists shadowing_logs (
  id uuid primary key default gen_random_uuid(),
  hours numeric not null,
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id)
);

create table if not exists settings (
  user_id uuid primary key references auth.users(id),
  shadowing_goal_hours numeric
);

alter table shadowing_logs enable row level security;
alter table settings enable row level security;

create policy "owner access" on shadowing_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
