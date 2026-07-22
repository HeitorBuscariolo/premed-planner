-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.

create table if not exists review_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  name text not null,
  box_level int not null default 0,
  next_review_date date not null,
  created_at timestamptz not null default now()
);

alter table tasks
  add column if not exists linked_review_topic_id uuid references review_topics(id) on delete set null;

alter table review_topics enable row level security;

create policy "allow all on review_topics" on review_topics for all using (true) with check (true);
