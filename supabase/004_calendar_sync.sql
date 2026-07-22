-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.

alter table exams add column if not exists google_event_id text;
alter table long_range_items add column if not exists google_event_id text;
