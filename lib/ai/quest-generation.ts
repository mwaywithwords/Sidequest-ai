import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  CHALLENGE_INSTRUCTIONS,
  INSPIRED_CHALLENGE_INSTRUCTIONS,
  requestChallengeWire,
  WireChallengeSchema,
  skillPatternList,
} from "@/lib/ai/challenge";
import { DISCOVERY_INSTRUCTIONS, WireDiscoverySchema } from "@/lib/ai/discovery";
import { buildContextualPayload } from "@/lib/ai/inspired-context";
import { COMBINED_REQUEST_TIMEOUT_MS, openai } from "@/lib/ai/openai";
import { type QuestGenerationResult, type QuestGenerationWire } from "@/lib/ai/quest-generation-finalize";
import { extractCombinedPayload } from "@/lib/ai/quest-generation-parse";
import type { RegenerationHint } from "@/lib/ai/generation-failure";
import {
  runQuestGenerationWithRetry,
  type CombinedRequestResult,
} from "@/lib/ai/quest-generation-retry";
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
import { sanitiseZodIssues, type QuestLogger, type SafeZodIssue } from "@/lib/quest-trace";
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

You MUST be able to return any of these four outcomes. Prefer them in this order:
A. object_math — a visible number or visible form already supports the skill. Plus discovery and one challenge. Shape-only form is for geometry, not arithmetic.
B. inspired_math — no useful number, but the object's ordinary real-world use can honestly anchor the skill. Plus inspirationContext, discovery, and one challenge that may introduce given_in_problem numbers with suppose / imagine / if / let's say.
C. investigation_math — interacting with the actual object would produce a BETTER lesson, not merely because the photo lacks a number. One evidence request. Set discovery and challenge to null.
D. genuine poor_fit — last resort. A safe identifiable ordinary object is not poor_fit just because it has no printed number. Set discovery and challenge to null.

When the selected skill is arithmetic and the photographed object has no usable observed number, prefer a semantic real-world scenario over asking the child for another observation.
Examples: wallet + addition → money; shoe + multiplication → steps; cup + division → servings/liquid; basketball + subtraction → score difference.
Do not ask the child to measure or count something unless that is actually the stronger educational path.

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
  logger,
}: {
  analysis: ObjectAnalysis;
  skillId: SkillId;
  skillDescription: string | null;
  grade: Grade;
  adaptation?: AdaptiveProfile;
  logger?: QuestLogger;
}): Promise<QuestGenerationResult> {
  const profile =
    adaptation ??
    getAdaptiveProfile({
      grade,
      progress: null,
      recentOutcomes: [],
    });

  const possibleContext = buildContextualPayload(analysis, null);

  return runQuestGenerationWithRetry({
    analysis,
    skillId,
    grade,
    requestCombined: (hintInput) =>
      requestCombinedWire({
        analysis,
        skillId,
        skillDescription,
        grade,
        adaptation: profile,
        possibleContext,
        regeneration: hintInput?.hint,
      }),
    requestChallenge: ({ fit, contextualGrounding, hint }) =>
      requestChallengeWire({
        analysis,
        fit,
        skillId,
        skillDescription,
        grade,
        adaptation: profile,
        contextualGrounding,
        regeneration: hint,
      }),
    logger,
  });
}

async function requestCombinedWire({
  analysis,
  skillId,
  skillDescription,
  grade,
  adaptation,
  possibleContext,
  regeneration,
}: {
  analysis: ObjectAnalysis;
  skillId: SkillId;
  skillDescription: string | null;
  grade: Grade;
  adaptation: AdaptiveProfile;
  possibleContext: ReturnType<typeof buildContextualPayload>;
  regeneration?: RegenerationHint;
}): Promise<CombinedRequestResult> {
  const skill = getSkill(skillId);

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
                  adaptationGenerationGuidance(adaptation),
                  "Student-provided evidence: none. Do not invent any.",
                  "",
                  "Allowed contextual facts IF you choose inspired_math. These are NOT observations about this photograph:",
                  JSON.stringify(possibleContext, null, 2),
                  "If a number is not in that payload, it is not contextual. Use given_in_problem instead.",
                  "",
                  regeneration ? regeneration.guidance : "",
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

    if (!response.output_parsed) {
      return fromCombinedParse(parseCombinedGeneration(response));
    }

    return fromCombinedParse(parseCombinedGeneration(response.output_parsed));
  } catch (error) {
    const recovered = parseCombinedGeneration(extractCombinedPayload(error));
    if (recovered.status !== "unparsed") {
      return fromCombinedParse(recovered);
    }

    if (isTransportFailure(error)) {
      return { status: "api_failure" };
    }

    return {
      status: "parse_failure",
      zodIssues: zodIssuesFromUnknown(error),
    };
  }
}

type CombinedSectionParse =
  | {
      status: "ok";
      wire: QuestGenerationWire;
      challengeIssues: SafeZodIssue[];
    }
  | {
      status: "investigation_failed";
      issues: SafeZodIssue[];
    }
  | {
      status: "discovery_failed";
      issues: SafeZodIssue[];
    }
  | { status: "unparsed" };

function parseCombinedGeneration(raw: unknown): CombinedSectionParse {
  const direct =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const record =
    direct !== null && "investigation" in direct
      ? direct
      : extractCombinedPayload(raw);
  if (record === null || !("investigation" in record)) {
    return { status: "unparsed" };
  }

  const investigation = WireSkillFitSchema.safeParse(record.investigation);
  if (!investigation.success) {
    return {
      status: "investigation_failed",
      issues: sanitiseZodIssues(investigation.error),
    };
  }

  const discoveryValue = record.discovery ?? null;
  const discovery =
    discoveryValue === null
      ? { success: true as const, data: null }
      : WireDiscoverySchema.safeParse(discoveryValue);

  if (!discovery.success) {
    return {
      status: "discovery_failed",
      issues: sanitiseZodIssues(discovery.error),
    };
  }

  const challengeValue = record.challenge ?? null;
  if (challengeValue === null) {
    return {
      status: "ok",
      wire: {
        investigation: investigation.data,
        discovery: discovery.data,
        challenge: null,
      },
      challengeIssues: [],
    };
  }

  const challenge = WireChallengeSchema.safeParse(challengeValue);
  if (!challenge.success) {
    return {
      status: "ok",
      wire: {
        investigation: investigation.data,
        discovery: discovery.data,
        challenge: null,
      },
      challengeIssues: sanitiseZodIssues(challenge.error),
    };
  }

  return {
    status: "ok",
    wire: {
      investigation: investigation.data,
      discovery: discovery.data,
      challenge: challenge.data,
    },
    challengeIssues: [],
  };
}

function fromCombinedParse(
  parsed: ReturnType<typeof parseCombinedGeneration>,
): CombinedRequestResult {
  if (parsed.status === "unparsed") {
    return { status: "parse_failure" };
  }

  if (
    parsed.status === "investigation_failed" ||
    parsed.status === "discovery_failed"
  ) {
    return { status: "parse_failure", zodIssues: parsed.issues };
  }

  return {
    status: "ok",
    wire: parsed.wire,
    challengeIssues: parsed.challengeIssues,
  };
}

function isTransportFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.toLowerCase() : "";
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
  const status = typeof record.status === "number" ? record.status : null;
  return (
    name.includes("timeout") ||
    name.includes("abort") ||
    name.includes("fetch") ||
    name.includes("connection") ||
    code.includes("etimedout") ||
    code.includes("econnreset") ||
    status === 408 ||
    status === 429 ||
    (status !== null && status >= 500)
  );
}

function zodIssuesFromUnknown(error: unknown): ReturnType<typeof sanitiseZodIssues> | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  const issues = record.issues;
  if (!Array.isArray(issues)) return undefined;
  return sanitiseZodIssues({ issues: issues as unknown[] });
}
