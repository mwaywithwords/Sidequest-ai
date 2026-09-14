import "server-only";

import { CorrectAnswerSchema } from "@/lib/ai/schemas";
import {
  type AnswerSubmission,
  parseStudentSubmission,
  studentAnswerMatches,
} from "@/lib/math/answer";
import {
  type SkillAttemptRow,
  skillProgressFromAttempts,
} from "@/lib/progress/mastery";
import {
  persistQuestReward,
  readQuestReward,
} from "@/lib/progress/rewards";
import {
  type GradeView,
  type ChallengeProgress,
  applyAwardedXp,
  canAcceptAttempt,
  hintUsedForAttempt,
  nextAttemptNumber,
  progressFromAttempts,
  questIsGradeable,
} from "@/lib/progress/outcome";
import { xpDecisionForGrade } from "@/lib/progress/xp";
import { getProfileId, isUuid } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

const UNIQUE_VIOLATION = "23505";
const MAX_RESPONSE_MS = 60 * 60 * 1000;

export type GradeRequest = {
  questId: string;
  answer: AnswerSubmission;
  hintRevealed: boolean;
  responseTimeMs: number;
};

/**
 * Grade one submission for an owned, ready Sidequest.
 *
 * Profile, challenge, attempt number, correctness, and XP are resolved
 * here. The browser only sends the quest id, the typed answer, a hint
 * flag, and a response-time reading. It cannot submit xp, attempt_number,
 * is_correct, profile_id, or challenge_id.
 */
export async function gradeQuestAnswer(
  request: GradeRequest,
): Promise<GradeView> {
  if (!isUuid(request.questId)) return { status: "unavailable" };

  const profileId = await getProfileId();
  if (profileId === null) return { status: "unavailable" };

  const loaded = await loadGradeContext(request.questId, profileId);
  if (loaded.status !== "ok") return { status: "unavailable" };

  const parsed = parseStudentSubmission(request.answer);
  if (!parsed.ok) {
    return { status: "invalid", reason: parsed.reason };
  }

  if (!canAcceptAttempt(loaded.attempts)) {
    return settleQuestXp({
      profileId,
      questId: request.questId,
      challengeId: loaded.challengeId,
      previousAttempts: loaded.attempts,
      nextAttempts: loaded.attempts,
      view: progressFromAttempts({
        attempts: loaded.attempts,
        hint1: loaded.hint1,
        hint2: loaded.hint2,
        solution: loaded.solution,
        expected: loaded.expected,
      }),
    });
  }

  const attemptNumber = nextAttemptNumber(loaded.attempts);
  const isCorrect = studentAnswerMatches(parsed.answer, loaded.expected);
  const hintUsed = hintUsedForAttempt(attemptNumber, request.hintRevealed);
  const responseTimeMs = sanitiseResponseTime(request.responseTimeMs);

  const { error: insertError } = await createAdminClient()
    .from("attempts")
    .insert({
      profile_id: profileId,
      challenge_id: loaded.challengeId,
      submitted_answer: parsed.display,
      is_correct: isCorrect,
      attempt_number: attemptNumber,
      hint_used: hintUsed,
      response_time_ms: responseTimeMs,
    });

  if (insertError !== null) {
    if (insertError.code !== UNIQUE_VIOLATION) {
      console.error("[quest-grade] could not store attempt", insertError);
      return { status: "unavailable" };
    }

    const replayed = await loadGradeContext(request.questId, profileId);
    if (replayed.status !== "ok") return { status: "unavailable" };

    await syncSkillProgress(profileId, loaded.skillRowId);

    return settleQuestXp({
      profileId,
      questId: request.questId,
      challengeId: loaded.challengeId,
      previousAttempts: loaded.attempts,
      nextAttempts: replayed.attempts,
      view: progressFromAttempts({
        attempts: replayed.attempts,
        hint1: replayed.hint1,
        hint2: replayed.hint2,
        solution: replayed.solution,
        expected: replayed.expected,
      }),
    });
  }

  const attempts = [
    ...loaded.attempts,
    { attemptNumber, isCorrect },
  ];

  const view = progressFromAttempts({
    attempts,
    hint1: loaded.hint1,
    hint2: loaded.hint2,
    solution: loaded.solution,
    expected: loaded.expected,
  });

  if (view.status === "correct" || view.status === "complete") {
    await syncSkillProgress(profileId, loaded.skillRowId);
  }

  return settleQuestXp({
    profileId,
    questId: request.questId,
    challengeId: loaded.challengeId,
    previousAttempts: loaded.attempts,
    nextAttempts: attempts,
    view,
  });
}

async function settleQuestXp(input: {
  profileId: string;
  questId: string;
  challengeId: string;
  previousAttempts: { attemptNumber: number; isCorrect: boolean }[];
  nextAttempts: { attemptNumber: number; isCorrect: boolean }[];
  view: ChallengeProgress;
}): Promise<ChallengeProgress> {
  if (input.view.status !== "correct" && input.view.status !== "complete") {
    return input.view;
  }

  const existingReward = await readQuestReward(
    input.profileId,
    input.challengeId,
  );
  const decision = xpDecisionForGrade({
    previousAttempts: input.previousAttempts,
    nextAttempts: input.nextAttempts,
    existingReward,
  });

  const reward = decision.persist
    ? await persistQuestReward({
        profileId: input.profileId,
        questId: input.questId,
        challengeId: input.challengeId,
        reward: decision.reward,
      })
    : decision.reward;

  return applyAwardedXp(input.view, reward?.xp ?? null);
}

type LoadedGrade =
  | {
      status: "ok";
      challengeId: string;
      skillRowId: string;
      expected: ReturnType<typeof CorrectAnswerSchema.parse>;
      hint1: string | null;
      hint2: string | null;
      solution: string | null;
      attempts: { attemptNumber: number; isCorrect: boolean }[];
    }
  | { status: "unavailable" };

async function loadGradeContext(
  questId: string,
  profileId: string,
): Promise<LoadedGrade> {
  const supabase = createAdminClient();

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("id, profile_id, status, selected_skill_id")
    .eq("id", questId)
    .maybeSingle();

  if (questError !== null) {
    console.error("[quest-grade] could not load quest", questError);
    return { status: "unavailable" };
  }

  const { data: rows, error: challengeError } = await supabase
    .from("challenges")
    .select("id, skill_id, correct_answer, hint_1, hint_2, solution")
    .eq("quest_id", questId);

  if (challengeError !== null) {
    console.error("[quest-grade] could not load challenge", challengeError);
    return { status: "unavailable" };
  }

  const allowed = questIsGradeable({
    exists: quest !== null,
    owned: quest?.profile_id === profileId,
    status: quest?.status ?? "",
    challengeCount: rows?.length ?? 0,
  });

  if (!allowed.ok || quest === null || rows === undefined || rows[0] === undefined) {
    return { status: "unavailable" };
  }

  const challenge = rows[0];
  const expected = CorrectAnswerSchema.safeParse(challenge.correct_answer);
  if (!expected.success) return { status: "unavailable" };

  const { data: attemptRows, error: attemptError } = await supabase
    .from("attempts")
    .select("attempt_number, is_correct")
    .eq("profile_id", profileId)
    .eq("challenge_id", challenge.id)
    .order("attempt_number", { ascending: true });

  if (attemptError !== null) {
    console.error("[quest-grade] could not load attempts", attemptError);
    return { status: "unavailable" };
  }

  return {
    status: "ok",
    challengeId: challenge.id,
    skillRowId: challenge.skill_id,
    expected: expected.data,
    hint1: challenge.hint_1,
    hint2: challenge.hint_2,
    solution: challenge.solution,
    attempts: (attemptRows ?? []).map((row) => ({
      attemptNumber: row.attempt_number,
      isCorrect: row.is_correct,
    })),
  };
}

async function syncSkillProgress(profileId: string, skillRowId: string) {
  const supabase = createAdminClient();

  const { data: skillChallenges, error: skillError } = await supabase
    .from("challenges")
    .select("id")
    .eq("skill_id", skillRowId);

  if (skillError !== null) {
    console.error("[quest-grade] could not load skill challenges", skillError);
    return;
  }

  const challengeIds = (skillChallenges ?? []).map((row) => row.id);
  if (challengeIds.length === 0) {
    await writeSkillProgress(profileId, skillRowId, skillProgressFromAttempts([]));
    return;
  }

  const { data: rows, error } = await supabase
    .from("attempts")
    .select("is_correct, attempt_number, created_at, challenge_id")
    .eq("profile_id", profileId)
    .in("challenge_id", challengeIds);

  if (error !== null) {
    console.error("[quest-grade] could not load skill attempts", error);
    return;
  }

  const history: SkillAttemptRow[] = (rows ?? []).map((row) => ({
    challengeId: row.challenge_id,
    isCorrect: row.is_correct,
    attemptNumber: row.attempt_number,
    createdAt: row.created_at,
  }));

  await writeSkillProgress(
    profileId,
    skillRowId,
    skillProgressFromAttempts(history),
  );
}

async function writeSkillProgress(
  profileId: string,
  skillRowId: string,
  snapshot: ReturnType<typeof skillProgressFromAttempts>,
) {
  const { error: upsertError } = await createAdminClient()
    .from("skill_progress")
    .upsert(
      {
        profile_id: profileId,
        skill_id: skillRowId,
        total_attempts: snapshot.totalAttempts,
        correct_attempts: snapshot.correctAttempts,
        mastery_score: Number(snapshot.masteryScore.toFixed(3)),
        current_level: snapshot.currentLevel,
        last_practiced_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,skill_id" },
    );

  if (upsertError !== null) {
    console.error("[quest-grade] could not upsert skill progress", upsertError);
  }
}

function sanitiseResponseTime(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > MAX_RESPONSE_MS) return MAX_RESPONSE_MS;
  return rounded;
}
