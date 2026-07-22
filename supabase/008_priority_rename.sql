-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.
--
-- Renames the priority tiers from clinical triage language (STAT/URGENT/
-- ROUTINE) to friendlier wording (URGENT/SOON/WHENEVER) to match the app's
-- new look. Existing rows are remapped so no data or meaning is lost:
--   STAT -> URGENT, URGENT -> SOON, ROUTINE -> WHENEVER

alter table tasks drop constraint if exists tasks_priority_check;

update tasks set priority = 'WHENEVER' where priority = 'ROUTINE';
update tasks set priority = 'SOON' where priority = 'URGENT';
update tasks set priority = 'URGENT' where priority = 'STAT';

alter table tasks
  add constraint tasks_priority_check check (priority in ('URGENT', 'SOON', 'WHENEVER'));
