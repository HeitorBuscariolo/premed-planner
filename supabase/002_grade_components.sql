-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project (schema.sql already ran once and seeded the base tables).

create table if not exists grade_components (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  name text not null,
  weight numeric not null,
  due_date date,
  is_exam boolean not null default false
);

alter table grade_components enable row level security;

create policy "allow all on grade_components" on grade_components for all using (true) with check (true);
