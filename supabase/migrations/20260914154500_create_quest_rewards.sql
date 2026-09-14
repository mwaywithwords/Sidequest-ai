-- Persistent Sidequest XP.
--
-- One append-only row per completed Sidequest. The unique key is the
-- (profile, challenge) pair, so a retried, refreshed, or double-submitted
-- completion cannot award XP twice. Profile totals are summed from these
-- rows rather than incremented in place.
--
-- Historical Sidequests completed before this table existed stay valid:
-- they simply have no reward row, so they contribute 0 XP until a new
-- Sidequest is finished. This migration does not backfill and does not
-- touch profiles, attempts, or skill_progress.

create table if not exists public.quest_rewards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  quest_id uuid not null references public.quests (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  xp integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

comment on table public.quest_rewards is
  'One append-only XP award per completed Sidequest. Safe to replay: the '
  'unique (profile, challenge) key is the duplicate lock. Totals are summed '
  'from these rows, not stored on profiles.';

comment on column public.quest_rewards.xp is
  'Server-computed amount. The browser never submits this.';

comment on column public.quest_rewards.reason is
  'Why XP was awarded: first, second, or third correct try, or the solution reveal.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.quest_rewards'::regclass
      and conname = 'quest_rewards_xp_reason_match'
  ) then
    alter table public.quest_rewards
      add constraint quest_rewards_xp_reason_match check (
        (reason = 'correct_attempt_1' and xp = 10)
        or (reason = 'correct_attempt_2' and xp = 7)
        or (reason = 'correct_attempt_3' and xp = 5)
        or (reason = 'solution_revealed' and xp = 2)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.quest_rewards'::regclass
      and conname = 'quest_rewards_profile_challenge_key'
  ) then
    alter table public.quest_rewards
      add constraint quest_rewards_profile_challenge_key
      unique (profile_id, challenge_id);
  end if;
end $$;

create index if not exists quest_rewards_quest_id_idx
  on public.quest_rewards (quest_id);

alter table public.quest_rewards enable row level security;
