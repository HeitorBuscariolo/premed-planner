-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.
--
-- Adds credit hours to courses so the Semester GPA calculator can weight
-- each course's grade correctly instead of averaging them all equally.

alter table courses add column if not exists credits numeric not null default 3;
