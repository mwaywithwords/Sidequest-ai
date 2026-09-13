import "server-only";

import { cache } from "react";
import {
  CorrectAnswerSchema,
  DiscoverySchema,
  GenerationMetadataSchema,
  ObjectAnalysisSchema,
  SkillFitAnalysisSchema,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import {
  type DetourPresentation,
  presentDetour,
  sanitiseSuggestions,
} from "@/lib/detour";
import { getProfileId, isUuid } from "@/lib/profile";
import {
  presentStudentQuest,
  type QuestExperience,
  type QuestPhoto,
  type StudentQuest,
} from "@/lib/quest-present";
import { getSkill } from "@/lib/skills";
import { createAdminClient } from "@/lib/supabase/admin";
import { signQuestImageUrl } from "@/lib/supabase/storage";
import {
  parseGrade,
  parseSkillId,
  type Grade,
  type Skill,
  type SkillId,
} from "@/lib/types";

/**
 * Trusted load of a quest for /quest/[id].
 *
 * Ownership is checked here, against the anonymous profile cookie, before
 * any student-facing field is selected. The browser client is not used:
 * RLS has no policies, so the only safe read is the secret key behind this
 * boundary, after the profile match.
 *
 * A quest that is not ready never returns challenge text. Ready quests
 * return a shaped presentation, not the row.
 */

type SkillRef = {
  skill: Skill;
  grade: Grade;
  skillId: SkillId;
};

export const loadQuestExperience = cache(
  async (questId: string): Promise<QuestExperience> => {
    if (!isUuid(questId)) return { kind: "missing" };

    const profileId = await getProfileId();
    if (profileId === null) return { kind: "missing" };

    const supabase = createAdminClient();

    const { data: quest, error } = await supabase
      .from("quests")
      .select(
        "id, profile_id, status, image_path, identified_object, object_metadata, discovery, validation_result, selected_skill_id",
      )
      .eq("id", questId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error !== null) {
      console.error("[quest-experience] could not load quest", error);
      return { kind: "missing" };
    }

    if (quest === null) return { kind: "missing" };

    const skillRef = await loadSkillRef(quest.selected_skill_id);
    const photo = await signPhoto(quest.image_path, quest.identified_object);
    const links = hrefsFor(skillRef);
    const accent = skillRef?.skill.accent ?? "#c8ff4d";
    const missionLabel = skillRef
      ? `Grade ${skillRef.grade} · ${skillRef.skill.label}`
      : "";

    if (quest.status === "pending" || quest.status === "processing") {
      return {
        kind: "working",
        photo,
        accent,
        missionLabel,
        retryHref: `/quest/${questId}`,
        scanHref: links.scanHref,
      };
    }

    if (quest.status === "rejected") {
      const refused = detourForRejected(quest.validation_result, skillRef);
      return {
        kind: "rejected",
        detour: refused.presentation,
        photo,
        accent,
        primaryHref: links.scanHref,
        secondaryHref: refused.offerSkillChange ? links.setupHref : null,
      };
    }

    if (quest.status !== "ready") {
      return {
        kind: "failed",
        photo,
        accent,
        scanHref: links.scanHref,
        setupHref: links.setupHref,
      };
    }

    const presented = await presentReadyQuest({
      questId,
      objectMetadata: quest.object_metadata,
      validationResult: quest.validation_result,
      discovery: quest.discovery,
      identifiedObject: quest.identified_object,
      photo,
      skillRef,
    });

    if (presented === null) {
      return {
        kind: "failed",
        photo,
        accent,
        scanHref: links.scanHref,
        setupHref: links.setupHref,
      };
    }

    return { kind: "ready", quest: presented };
  },
);

async function presentReadyQuest({
  questId,
  objectMetadata,
  validationResult,
  discovery,
  identifiedObject,
  photo,
  skillRef,
}: {
  questId: string;
  objectMetadata: unknown;
  validationResult: unknown;
  discovery: unknown;
  identifiedObject: string | null;
  photo: QuestPhoto | null;
  skillRef: SkillRef | null;
}): Promise<StudentQuest | null> {
  if (skillRef === null) return null;

  const analysis = ObjectAnalysisSchema.safeParse(objectMetadata);
  const fit = SkillFitAnalysisSchema.safeParse(validationResult);
  const fact = DiscoverySchema.safeParse(discovery);

  if (!analysis.success || !fit.success || !fact.success) return null;

  if (
    fit.data.challengeMode !== "direct" &&
    fit.data.challengeMode !== "grounded_scenario"
  ) {
    return null;
  }

  const { data: rows, error } = await createAdminClient()
    .from("challenges")
    .select(
      "question, hint_1, object_connection, correct_answer, generation_metadata",
    )
    .eq("quest_id", questId);

  if (error !== null) {
    console.error("[quest-experience] could not load challenge", error);
    return null;
  }

  if (rows === null || rows.length !== 1) {
    console.warn("[quest-experience] ready quest did not have one challenge", {
      questId,
      count: rows?.length ?? 0,
    });
    return null;
  }

  const row = rows[0];
  const metadata = GenerationMetadataSchema.safeParse(row.generation_metadata);
  const answer = CorrectAnswerSchema.safeParse(row.correct_answer);
  const connection = row.object_connection?.trim();
  const question = row.question?.trim();

  if (!metadata.success || !answer.success || !connection || !question) {
    return null;
  }

  return presentStudentQuest({
    objectName: analysis.data.objectName || identifiedObject || "object",
    photo,
    discoveryTitle: fact.data.title,
    discoveryText: fact.data.text,
    objectConnection: connection,
    valuesUsed: metadata.data.valuesUsed,
    challengeMode: fit.data.challengeMode,
    question,
    hint1: row.hint_1,
    answer: answer.data,
    skillLabel: skillRef.skill.label,
    skillAccent: skillRef.skill.accent,
    grade: skillRef.grade,
    skillId: skillRef.skillId,
  });
}

async function loadSkillRef(skillRowId: string): Promise<SkillRef | null> {
  const { data, error } = await createAdminClient()
    .from("skills")
    .select("skill_code, grade_level")
    .eq("id", skillRowId)
    .maybeSingle();

  if (error !== null || data === null) return null;

  const skillId = parseSkillId(data.skill_code);
  const grade = parseGrade(data.grade_level);
  if (skillId === null || grade === null) return null;

  return { skill: getSkill(skillId), grade, skillId };
}

async function signPhoto(
  imagePath: string | null,
  objectName: string | null,
): Promise<QuestPhoto | null> {
  if (imagePath == null || imagePath.length === 0) return null;

  const url = await signQuestImageUrl(imagePath);
  if (url === null) return null;

  const name = objectName?.trim();

  return {
    url,
    alt: name ? copy.quest.experience.photoAlt(name) : copy.scan.previewAlt,
  };
}

function hrefsFor(skillRef: SkillRef | null) {
  if (skillRef === null) {
    return { scanHref: "/setup", setupHref: "/setup" };
  }

  return {
    scanHref: `/scan?grade=${skillRef.grade}&skill=${skillRef.skillId}`,
    setupHref: `/setup?grade=${skillRef.grade}`,
  };
}

function detourForRejected(
  validationResult: unknown,
  skillRef: SkillRef | null,
): { presentation: DetourPresentation; offerSkillChange: boolean } {
  const skill = skillRef?.skill ?? getSkill("addition");
  const fit = SkillFitAnalysisSchema.safeParse(validationResult);

  if (fit.success && fit.data.challengeMode === "poor_fit") {
    return {
      presentation: presentDetour(
        {
          kind: "poorFit",
          suggestions: sanitiseSuggestions(
            fit.data.suggestedObjectCharacteristics,
          ),
          offerSkillChange: fit.data.alternativeSkillCodes.length > 0,
        },
        skill,
      ),
      offerSkillChange: fit.data.alternativeSkillCodes.length > 0,
    };
  }

  const kind = fit.success ? "wandered" : "unknown";

  return {
    presentation: presentDetour(
      { kind, suggestions: [], offerSkillChange: false },
      skill,
    ),
    offerSkillChange: false,
  };
}
