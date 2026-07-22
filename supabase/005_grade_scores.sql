-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.

alter table grade_components add column if not exists score numeric;
