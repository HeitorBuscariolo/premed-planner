-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.
--
-- Per-chapter exam study plans: she lists the chapters/topics covered on an
-- exam (optionally attaching the PPTX/PDF slides for her own reference —
-- the file is stored but never parsed, she types the chapter names herself)
-- and the app spreads one study task per chapter across the days before the
-- exam, respecting a daily study-hours budget she sets. This replaces the
-- generic 3-week/2-week/1-week reverse-plan milestones for that specific
-- exam; exams with no chapters keep using the existing milestone system.

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

alter table tasks
  add column if not exists linked_chapter_id uuid references exam_chapters(id) on delete set null;

alter table exam_chapters enable row level security;
alter table exam_materials enable row level security;

create policy "owner access" on exam_chapters for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on exam_materials for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private storage bucket for uploaded slides/PDFs. Files are stored at
-- "{user_id}/{exam_id}/{filename}" so the policy below can scope access to
-- each user's own folder using storage.foldername().
insert into storage.buckets (id, name, public)
values ('exam-materials', 'exam-materials', false)
on conflict (id) do nothing;

create policy "owner access on exam-materials"
on storage.objects for all
using (bucket_id = 'exam-materials' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'exam-materials' and auth.uid()::text = (storage.foldername(name))[1]);
