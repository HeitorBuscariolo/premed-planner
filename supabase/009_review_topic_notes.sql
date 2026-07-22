-- Incremental migration: run this in the SQL editor against the already-
-- provisioned project.
--
-- Adds a "back of card" notes field to review topics so Flashcard Reviews
-- can hold actual study content, not just a topic title + schedule.

alter table review_topics add column if not exists notes text;
