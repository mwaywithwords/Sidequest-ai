import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  CHALLENGE_INSTRUCTIONS,
  INSPIRED_CHALLENGE_INSTRUCTIONS,
  WireChallengeSchema,
  skillPatternList,
} from "@/lib/ai/challenge";
import { DISCOVERY_INSTRUCTIONS, WireDiscoverySchema } from "@/lib/ai/discovery";
import { buildContextualPayload } from "@/lib/ai/inspired-context";
import { COMBINED_REQUEST_TIMEOUT_MS, openai } from "@/lib/ai/openai";
import {
  finalizeQuestGeneration,
  generationFailed,
  type QuestGenerationResult,
} from "@/lib/ai/quest-generation-finalize";
import type { ObjectAnalysis } from "@/lib/ai/schemas";
import {
  SKILL_FIT_INSTRUCTIONS,
  WireSkillFitSchema,
  skillInvestigationList,
} from "@/lib/ai/skill-fit";
import {
  type AdaptiveProfile,
  adaptationGenerationGuidance,
  getAdaptiveProfile,
} from "@/lib/progress/adaptation";
import { getSkill } from "@/lib/skills";
import type { Grade, SkillId } from "@/lib/types";

/**
 * Combined educational quest generation: investigation path, discovery,
 * and a challenge candidate in one structured text-only response.
 *
 * It does not see the photograph. Each section is parsed into the same
 * application schemas the standalone stages used. Discovery and a
 * challenge are required only when a ready path proceeds.
 */

const GENERATION_MODEL = "gpt-5.4";

const WireQuestGenerationSchema = z.strictObject({
  investigation: WireSkillFitSchema,
  discovery: WireDiscoverySchema.nullable(),
  challenge: WireChallengeSchema.nullable(),
});

function generationInstructions(): string {
  return `You are the educational quest-generation stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student chose a maths skill, then photographed an object. The vision stage has already read that object. You do not see the photograph.

You are doing up to three jobs in one response. Keep the sections distinct. Validate each against the reading. Do not invent a fact about the photographed object.

You MUST be able to return any of these four outcomes:
A. object_math — investigation ready, plus discovery, plus one challenge.
B. investigation_math — one evidence request. Set discovery and challenge to null.
C. inspired_math — investigation ready with inspirationContext, plus discovery, plus one challenge.
D. genuine poor_fit — last resort. Set discovery and challenge to null.

Discovery is required only when a challenge path proceeds (object_math or inspired_math). Do not write discovery or a challenge for investigation_math or poor_fit.

SECTION 1 — investigation
${SKILL_FIT_INSTRUCTIONS.replace("{skills}", skillInvestigationList())}

Fill "investigation" with that judgement.

SECTION 2 — discovery
Only when investigation.challengeMode is object_math or inspired_math. Otherwise set "discovery" to null.

${DISCOVERY_INSTRUCTIONS}

SECTION 3 — challenge
Only when investigation.challengeMode is object_math or inspired_math. Otherwise set "challenge" to null.

If challengeMode is object_math:
${CHALLENGE_INSTRUCTIONS.replace("{skills}", skillPatternList())}

If challengeMode is inspired_math:
${INSPIRED_CHALLENGE_INSTRUCTIONS.replace("{skills}", skillPatternList())}

If you cannot produce an honest challenge on a ready path, set challenge.canGenerate to false and still fill every challenge field with empty strings, empty arrays, zeros, and nulls.`;
}

export type { QuestGenerationResult };

export async function generateQuest({
  analysis,
  skillId,
  skillDescription,
  grade,
  adaptation,
}: {
  analysis: ObjectAnalysis;
  skillId: SkillId;
  skillDescription: string | null;
  grade: Grade;
  adaptation?: AdaptiveProfile;
}): Promise<QuestGenerationResult> {
  const skill = getSkill(skillId);
  const profile =
    adaptation ??
    getAdaptiveProfile({
      grade,
      progress: null,
      recentOutcomes: [],
    });

  const possibleContext = buildContextualPayload(analysis, null);

  let wire: z.infer<typeof WireQuestGenerationSchema> | null = null;

  try {
    const response = await openai().responses.parse(
      {
        model: GENERATION_MODEL,
        instructions: generationInstructions(),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  `Grade: ${grade}`,
                  `Selected skill: ${skillId} (${skill.label})`,
                  `What that means in grade ${grade}: ${skillDescription ?? skill.blurb}`,
                  adaptationGenerationGuidance(profile),
                  "Student-provided evidence: none. Do not invent any.",
                  "",
                  "Allowed contextual facts IF you choose inspired_math. These are NOT observations about this photograph:",
                  JSON.stringify(possibleContext, null, 2),
                  "If a number is not in that payload, it is not contextual. Use given_in_problem instead.",
                  "",
                  "The reading of the object:",
                  JSON.stringify(analysis, null, 2),
                ].join("\n"),
              },
            ],
          },
        ],
        text: {
          format: zodTextFormat(WireQuestGenerationSchema, "quest_generation"),
        },
      },
      { timeout: COMBINED_REQUEST_TIMEOUT_MS },
    );

    wire = response.output_parsed;
  } catch (error) {
    console.warn("[quest-generation] generation call failed", error);
    return generationFailed();
  }

  if (!wire) {
    console.warn("[quest-generation] no parsed generation");
    return generationFailed();
  }

  return finalizeQuestGeneration(wire, { analysis, skillId, grade });
}
