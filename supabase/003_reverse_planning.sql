-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.

alter table tasks
  add column if not exists linked_exam_id uuid references exams(id) on delete set null;
