import "server-only";

import { imageDataUrl } from "@/lib/ai/image-input";
import { moderateImage } from "@/lib/ai/moderation";
import { generateQuest } from "@/lib/ai/quest-generation";
import { analyzeVision } from "@/lib/ai/vision-analysis";
import { getAdaptiveProfile } from "@/lib/progress/adaptation";
import { loadAdaptationState } from "@/lib/progress/load";
import { getOrCreateProfileId } from "@/lib/profile";
import { storeQuestReading } from "@/lib/quest-analysis";
import { persistQuestChallenge } from "@/lib/quest-challenge";
import { persistQuestDiscovery } from "@/lib/quest-discovery";
import { persistQuestSkillFit } from "@/lib/quest-fit";
import {
  type QuestCreateResult,
  type SkillRecord,
  runQuestPipeline,
} from "@/lib/quest-pipeline";
import { setQuestStatus } from "@/lib/quest-status";
import { isJwtIssuedAtFutureError } from "@/lib/skill-catalogue";
import { createAdminClient } from "@/lib/supabase/admin";
import { QUEST_IMAGE_BUCKET, questImagePath } from "@/lib/supabase/storage";
import { verifyQuestChallenge } from "@/lib/quest-verify";
import type { Grade, SkillId } from "@/lib/types";

/**
 * Live POST /api/quests wiring: real model calls, real persistence.
 *
 * The ordered stages live in runQuestPipeline so tests can replay the
 * same fail-closed sequence without a network.
 */
export async function createQuest({
  file,
  extension,
  grade,
  skillId,
}: {
  file: File;
  extension: string;
  grade: Grade;
  skillId: SkillId;
}): Promise<QuestCreateResult> {
  const image = await imageDataUrl(file);

  return runQuestPipeline(
    { image, file, grade, skillId },
    {
      moderateImage,
      analyzeVision,
      generateQuest,
      verifyQuest: verifyQuestChallenge,
      adaptiveProfile: getAdaptiveProfile,
      persist: {
        async resolveSkill(nextGrade, nextSkillId) {
          return resolveSkillRow(nextGrade, nextSkillId);
        },
        async loadProfile(nextGrade) {
          return { profileId: await getOrCreateProfileId(nextGrade) };
        },
        async uploadAndInsert({ file: upload, profileId, skillRowId }) {
          const supabase = createAdminClient();
          const questId = crypto.randomUUID();
          const path = questImagePath(profileId, questId, extension);

          const { error: uploadError } = await supabase.storage
            .from(QUEST_IMAGE_BUCKET)
            .upload(path, upload, {
              contentType: upload.type,
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Storage upload failed: ${uploadError.message}`);
          }

          const { error: insertError } = await supabase.from("quests").insert({
            id: questId,
            profile_id: profileId,
            selected_skill_id: skillRowId,
            image_path: path,
            status: "pending",
          });

          if (insertError) {
            await supabase.storage.from(QUEST_IMAGE_BUCKET).remove([path]);
            throw new Error(`Quest insert failed: ${insertError.message}`);
          }

          return { questId };
        },
        storeReading: storeQuestReading,
        storeFit: persistQuestSkillFit,
        storeDiscovery: persistQuestDiscovery,
        storeChallenge: persistQuestChallenge,
        loadAdaptation: loadAdaptationState,
        markRejected: (questId) => setQuestStatus(questId, "rejected").then(() => undefined),
        markFailed: (questId) => setQuestStatus(questId, "failed").then(() => undefined),
      },
    },
  );
}

/**
 * Resolve the catalogue row for a parsed mission.
 *
 * `.maybeSingle()` keeps a missing row distinct from an auth or transport
 * failure. A JWT issued-at-future error is a known Supabase gateway flake
 * (PGRST303) and is retried once. It is not treated as a missing skill.
 */
async function resolveSkillRow(
  grade: Grade,
  skillId: SkillId,
): Promise<SkillRecord> {
  let result = await loadSkillRow(grade, skillId);

  if (isJwtIssuedAtFutureError(result.error)) {
    result = await loadSkillRow(grade, skillId);
  }

  if (result.error !== null) {
    throw new Error(
      `Skill lookup failed for grade ${grade} / ${skillId}: ${result.error.message}`,
    );
  }

  if (result.data === null) {
    throw new Error(`No skill row for grade ${grade} / ${skillId}`);
  }

  return {
    id: result.data.id,
    description: result.data.description,
  };
}

async function loadSkillRow(grade: Grade, skillId: SkillId) {
  return createAdminClient()
    .from("skills")
    .select("id, description")
    .eq("grade_level", grade)
    .eq("skill_code", skillId)
    .maybeSingle();
}

