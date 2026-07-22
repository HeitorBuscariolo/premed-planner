-- Pre-med planner schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
--
-- Requires Supabase Auth (email/password) enabled on the project. Every
-- table is owned per-row via user_id + RLS, so each signed-in user only
-- ever sees their own data.

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  credits numeric not null default 3,
  user_id uuid references auth.users(id)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course_id uuid references courses(id) on delete set null,
  priority text not null check (priority in ('URGENT', 'SOON', 'WHENEVER')),
  time text not null,
  date date not null,
  hours numeric not null default 1,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id)
);

create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete set null,
  name text not null,
  date date not null,
  google_event_id text,
  user_id uuid references auth.users(id)
);

create table if not exists long_range_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  category text not null,
  google_event_id text,
  user_id uuid references auth.users(id)
);

create table if not exists grade_components (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  name text not null,
  weight numeric not null,
  due_date date,
  is_exam boolean not null default false,
  score numeric,
  user_id uuid references auth.users(id)
);

create table if not exists review_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  name text not null,
  notes text,
  box_level int not null default 0,
  next_review_date date not null,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id)
);

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

create table if not exists exam_chapters (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade,
  name text not null,
  position int not null default 0,
  user_id uuid references auth.users(id)
);

create table if not exists exam_materials (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id)
);

-- Links an auto-generated reverse-plan milestone task back to the exam it
-- was planned against, so the UI can tell which exams already have a plan.
alter table tasks
  add column if not exists linked_exam_id uuid references exams(id) on delete set null;

-- Links an auto-generated spaced-repetition review task back to its topic,
-- so completing it can advance the topic to the next review interval.
alter table tasks
  add column if not exists linked_review_topic_id uuid references review_topics(id) on delete set null;

-- Links an auto-generated per-chapter study task back to the chapter it
-- covers, so a chapter-based exam plan can be identified and cleared.
alter table tasks
  add column if not exists linked_chapter_id uuid references exam_chapters(id) on delete set null;

alter table courses enable row level security;
alter table tasks enable row level security;
alter table exams enable row level security;
alter table long_range_items enable row level security;
alter table grade_components enable row level security;
alter table review_topics enable row level security;
alter table shadowing_logs enable row level security;
alter table settings enable row level security;
alter table practice_tests enable row level security;
alter table exam_chapters enable row level security;
alter table exam_materials enable row level security;

create policy "owner access" on courses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on exams for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on long_range_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on grade_components for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on review_topics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on shadowing_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on practice_tests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on exam_chapters for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on exam_materials for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private storage bucket for uploaded exam slides/PDFs. Files are stored at
-- "{user_id}/{exam_id}/{filename}" so the policy below can scope access to
-- each user's own folder using storage.foldername().
insert into storage.buckets (id, name, public)
values ('exam-materials', 'exam-materials', false)
on conflict (id) do nothing;

create policy "owner access on exam-materials"
on storage.objects for all
using (bucket_id = 'exam-materials' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'exam-materials' and auth.uid()::text = (storage.foldername(name))[1]);

-- No seed data here by design: sign up in the app first, then add your own
-- courses/tasks through the UI.
