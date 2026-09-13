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
  runQuestPipeline,
} from "@/lib/quest-pipeline";
import { setQuestStatus } from "@/lib/quest-status";
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
        async loadProfileAndSkill(nextGrade, nextSkillId) {
          const supabase = createAdminClient();
          const [profileId, skillResult] = await Promise.all([
            getOrCreateProfileId(nextGrade),
            supabase
              .from("skills")
              .select("id, description")
              .eq("grade_level", nextGrade)
              .eq("skill_code", nextSkillId)
              .single(),
          ]);

          if (skillResult.error !== null || skillResult.data === null) {
            throw new Error(
              `No skill row for grade ${nextGrade} / ${nextSkillId}: ${skillResult.error?.message ?? "not found"}`,
            );
          }

          return {
            profileId,
            skill: {
              id: skillResult.data.id,
              description: skillResult.data.description,
            },
          };
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

