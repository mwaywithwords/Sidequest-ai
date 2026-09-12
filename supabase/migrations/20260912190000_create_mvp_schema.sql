-- SIDEQUEST MVP schema.
--
-- Six tables, following the shape of a single sidequest: who is playing
-- (profiles), what they can practise (skills), what they photographed
-- (quests), what was generated from that photo (challenges), what they
-- answered (attempts), and what all of it adds up to (skill_progress).
--
-- Deliberately absent: auth and storage. `profiles.id` is a plain uuid rather
-- than a reference to `auth.users`, and `quests.image_path` is a text path
-- rather than a foreign key into `storage.objects`. Both become references
-- when login and uploads land.
--
-- `gen_random_uuid()` is built into Postgres 13+, so no extension is required.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  grade_level integer not null,
  created_at timestamptz not null default now(),

  constraint profiles_grade_level_mvp_range check (grade_level between 3 and 5)
);

comment on table public.profiles is
  'One student. Not linked to auth.users yet: the MVP has no login.';

-- ---------------------------------------------------------------------------
-- skills
-- ---------------------------------------------------------------------------

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  subject text not null default 'math',
  grade_level integer not null,
  skill_code text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),

  constraint skills_grade_level_mvp_range check (grade_level between 3 and 5),

  -- Keeps skill_code usable as a stable identifier in application code:
  -- lower snake_case only, so it can never drift into display text.
  constraint skills_skill_code_machine_friendly
    check (skill_code ~ '^[a-z][a-z0-9_]*$'),

  -- A skill code repeats across grades, so the natural key includes the grade.
  -- grade_level leads the index so the same one also answers "which skills does
  -- grade 4 offer", which is the query the setup screen makes.
  constraint skills_grade_level_skill_code_key unique (grade_level, skill_code)
);

comment on table public.skills is
  'Reference data. One row per skill per grade, seeded by migration.';

-- ---------------------------------------------------------------------------
-- quests
-- ---------------------------------------------------------------------------

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  image_path text,
  status text not null default 'pending',
  identified_object text,
  object_metadata jsonb not null default '{}'::jsonb,
  selected_skill_id uuid not null references public.skills (id) on delete restrict,
  discovery jsonb,
  validation_result jsonb,
  created_at timestamptz not null default now(),

  -- 'rejected' is a photo the pipeline read successfully but found no usable
  -- math in; 'failed' is the pipeline itself erroring. They need telling apart
  -- because only one of them is the student's cue to photograph something else.
  constraint quests_status_known check (
    status in ('pending', 'processing', 'ready', 'rejected', 'failed')
  )
);

comment on table public.quests is
  'One photographed object and the vision pipeline''s reading of it.';

-- ---------------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete restrict,
  question text not null,
  correct_answer jsonb not null,
  solution text,
  hint_1 text,
  hint_2 text,
  difficulty integer not null,
  object_connection text,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint challenges_difficulty_range check (difficulty between 1 and 5),

  -- Hints are revealed in order, so a second hint with no first hint would
  -- leave the UI showing nothing on the first miss.
  constraint challenges_hints_in_order
    check (hint_1 is not null or hint_2 is null)
);

comment on table public.challenges is
  'The generated problem for a quest. correct_answer is jsonb so it can hold a '
  'number, a fraction, or a value with a unit.';

-- ---------------------------------------------------------------------------
-- attempts
-- ---------------------------------------------------------------------------

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  submitted_answer text not null,
  is_correct boolean not null,
  attempt_number integer not null,
  hint_used boolean not null default false,
  response_time_ms integer,
  created_at timestamptz not null default now(),

  constraint attempts_attempt_number_positive check (attempt_number >= 1),
  constraint attempts_response_time_non_negative
    check (response_time_ms is null or response_time_ms >= 0),

  -- One row per numbered try, so a retried or double-submitted write cannot
  -- inflate a student's attempt count.
  constraint attempts_profile_challenge_number_key
    unique (profile_id, challenge_id, attempt_number)
);

comment on table public.attempts is
  'Every answer submitted, kept raw. submitted_answer is text so a wrong '
  'answer is stored exactly as the student typed it.';

-- ---------------------------------------------------------------------------
-- skill_progress
-- ---------------------------------------------------------------------------

create table public.skill_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  total_attempts integer not null default 0,
  correct_attempts integer not null default 0,
  mastery_score numeric(4, 3) not null default 0,
  current_level integer not null default 1,
  last_practiced_at timestamptz,

  constraint skill_progress_totals_non_negative
    check (total_attempts >= 0 and correct_attempts >= 0),
  constraint skill_progress_correct_within_total
    check (correct_attempts <= total_attempts),
  constraint skill_progress_mastery_score_range
    check (mastery_score between 0 and 1),

  -- Shares the 1-5 range with challenges.difficulty: current_level is the
  -- difficulty the next challenge for this skill should be generated at.
  constraint skill_progress_current_level_range
    check (current_level between 1 and 5),

  -- Required: one running total per student per skill.
  constraint skill_progress_profile_skill_key unique (profile_id, skill_id)
);

comment on table public.skill_progress is
  'Running totals per student per skill, derived from attempts. Safe to '
  'rebuild by replaying attempts.';

-- ---------------------------------------------------------------------------
-- Indexes
--
-- Postgres indexes primary keys and unique constraints automatically but never
-- foreign key columns, so each one below is either joined on, ordered by, or
-- walked by a cascading delete.
--
-- Not repeated here: skill_progress (profile_id) and attempts (profile_id),
-- which are already served as the leading column of their unique constraints.
-- ---------------------------------------------------------------------------

create index quests_profile_id_created_at_idx
  on public.quests (profile_id, created_at desc);

create index quests_selected_skill_id_idx
  on public.quests (selected_skill_id);

-- In-flight quests are a small, short-lived slice of the table, so the index
-- stays that size rather than covering every finished quest.
create index quests_pipeline_idx
  on public.quests (created_at)
  where status in ('pending', 'processing');

create index challenges_quest_id_idx
  on public.challenges (quest_id);

create index challenges_skill_id_idx
  on public.challenges (skill_id);

create index attempts_challenge_id_idx
  on public.attempts (challenge_id);

create index attempts_profile_id_created_at_idx
  on public.attempts (profile_id, created_at desc);

create index skill_progress_skill_id_idx
  on public.skill_progress (skill_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Enabled with no policies attached, which denies everything to the
-- publishable key while leaving the secret key (which bypasses RLS) working.
-- Without this, every row would be readable and writable by anyone holding the
-- publishable key, and that key ships in the browser bundle.
--
-- Real policies belong with the login work: they need an authenticated
-- identity to compare profile_id against, and there isn't one yet.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.quests enable row level security;
alter table public.challenges enable row level security;
alter table public.attempts enable row level security;
alter table public.skill_progress enable row level security;
