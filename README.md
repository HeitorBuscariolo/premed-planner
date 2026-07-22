# My Study Planner

A digital planner built for a pre-med student juggling coursework, MCAT prep,
shadowing hours, and applications — not a generic to-do list. Every course's
graded components drive its own auto-generated study tasks, exams get
reverse-planned into a study schedule (either generic milestones or a
per-chapter breakdown), and the app tracks the pre-med-specific stuff a
regular planner doesn't: shadowing hours against a goal, MCAT practice test
scores over time, and a live semester GPA.

## Features

- **Courses & grades** — set up each course with weighted grade components
  (midterms, homework, labs...); components flagged as exams auto-generate a
  reverse-planned study schedule, others get a single prep task on their due
  date. Record actual scores and see a live "what if I get X on the final"
  grade calculator per course, plus a semester-wide GPA calculator weighted
  by credit hours.
- **Exam Countdown** — every exam gets either a generic 3-week/2-week/1-week
  reverse-planned milestone schedule, or a **per-chapter study plan**: list
  the chapters/topics covered (optionally attaching the PPTX/PDF slides for
  your own reference), set how many hours a day you can study, and the app
  spreads one task per chapter across the days before the exam without
  exceeding that budget — warning you if the material doesn't fit in time.
- **Today's List** — tasks triaged into Urgent / Soon / Whenever, with
  search and course filtering, full edit/delete, and exam alerts for the day.
- **This Week** — a 7-day view; click any day to see and manage its full
  task list without leaving the week view, or add a task straight to that
  day.
- **Flashcard Reviews** — a Leitner-style spaced-repetition *scheduler* (not
  a review tool — pairs with real flashcard apps like Anki) that tells you
  what's due and reschedules on an increasing interval each time you check
  it off.
- **Shadowing Hours** — log sessions against a running total and a goal.
- **MCAT Practice Tests** — log total + section scores per practice test,
  with a delta-from-last-test trend.
- **Big Deadlines** — MCAT registration, application deadlines, LOR
  requests — anything with a date that isn't tied to a specific course.
- **Google Calendar sync** — one-way push of exams and big deadlines (not
  day-to-day tasks) to your real calendar.
- **Reminders** — optional browser notifications summarizing what's due.
- Email/password auth with row-level security — every table is scoped to
  its owner, so this can be run as a shared multi-user deployment.

## Tech stack

Vite + React 19 + Tailwind CSS v4 + [Supabase](https://supabase.com)
(Postgres, Auth, Storage) + [lucide-react](https://lucide.dev) icons.

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/HeitorBuscariolo/premed-planner.git
   cd premed-planner
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com),
   and enable email/password sign-in under Authentication → Providers.

3. **Set up the database.** In the Supabase SQL Editor, run
   [`supabase/schema.sql`](supabase/schema.sql) — it creates every table,
   row-level security policy, and the private storage bucket used for
   uploaded exam materials in one shot. (The numbered `00X_*.sql` files in
   `supabase/` are the incremental migration history from this project's
   development — only needed if you already have an older version of the
   schema deployed and are upgrading step by step.)

4. **Configure environment variables.** Copy the example file and fill in
   your project's values:

   ```bash
   cp .env.example .env.local
   ```

   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — from your Supabase
     project's API settings (the publishable/anon key, not the secret
     service role key).
   - `VITE_GOOGLE_CLIENT_ID` — optional, only needed for Google Calendar
     sync. Create an OAuth client ID (Web application type) in the
     [Google Cloud Console](https://console.cloud.google.com), under a
     project with the Calendar API enabled.

5. **Run it**

   ```bash
   npm run dev
   ```

   Sign up with an email/password inside the app — a fresh account starts
   empty, with no seed data.

## Project structure

```
src/PremedPlanner.jsx     # the entire app: every section, form, and handler
src/lib/supabaseClient.js # Supabase client init
src/lib/googleCalendar.js # Google Calendar API helpers
supabase/schema.sql       # full schema, run this for a fresh install
supabase/00X_*.sql        # incremental migrations, in order, for upgrading an existing DB
```
