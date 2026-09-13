import type {
  ContextualFact,
  ContextualPayload,
  InspirationContext,
  ObjectAnalysis,
} from "@/lib/ai/schemas";
import { sameUnit } from "@/lib/math/units";

/**
 * Evergreen real-world context for Inspired Math.
 *
 * These facts are not observations about the photograph. They are broadly
 * established constants for a kind of object, used only when Skill Fit
 * chose inspired_math. Uncertain dates, records, prices, and celebrity
 * trivia stay out of the default payload.
 */

type CatalogEntry = {
  match: readonly string[];
  topic: string;
  reason: string;
  facts: readonly ContextualFact[];
};

const CATALOG: readonly CatalogEntry[] = [
  {
    match: ["basketball", "basket ball"],
    topic: "basketball scores, quarters, and court geometry",
    reason:
      "Basketball has fixed scoring values, quarters, team sizes, and court shapes that can anchor grade-appropriate maths.",
    facts: [
      {
        label: "free throw points",
        value: 1,
        unit: "point",
        statement: "A free throw is worth 1 point.",
      },
      {
        label: "two-point shot",
        value: 2,
        unit: "points",
        statement: "A shot from inside the three-point line is worth 2 points.",
      },
      {
        label: "three-point shot",
        value: 3,
        unit: "points",
        statement: "A shot from beyond the three-point line is worth 3 points.",
      },
      {
        label: "quarters in a game",
        value: 4,
        statement: "A basketball game is divided into 4 quarters.",
      },
      {
        label: "players on court per team",
        value: 5,
        statement: "Each team has 5 players on the court at a time.",
      },
    ],
  },
  {
    match: ["wallet", "purse", "billfold"],
    topic: "money, dollars, and budgeting",
    reason:
      "A wallet is used to hold money, so dollars, cents, and spending can inspire arithmetic.",
    facts: [
      {
        label: "cents in a dollar",
        value: 100,
        unit: "cents",
        statement: "One dollar is 100 cents.",
      },
      {
        label: "quarters in a dollar",
        value: 4,
        statement: "Four quarters make one dollar.",
      },
    ],
  },
  {
    match: ["sneaker", "shoe", "trainer", "sandal", "footwear"],
    topic: "walking, steps, and pairs",
    reason:
      "Shoes are used for walking and come in pairs, which can inspire step and grouping maths without inventing a shoe size.",
    facts: [
      {
        label: "shoes in a pair",
        value: 2,
        statement: "Shoes are sold as a pair of 2.",
      },
    ],
  },
  {
    match: ["book", "novel", "textbook", "paperback"],
    topic: "pages and chapters",
    reason:
      "Books are organised into pages and chapters, which can inspire counting and grouping.",
    facts: [],
  },
  {
    match: ["cup", "mug", "tumbler"],
    topic: "liquid, pouring, and servings",
    reason:
      "A cup is used for drinking and pouring, so servings and amounts can inspire maths without inventing this cup's capacity.",
    facts: [],
  },
  {
    match: ["backpack", "knapsack", "rucksack"],
    topic: "carrying items and school supplies",
    reason:
      "A backpack is used to carry items, so groups of supplies can inspire maths without inventing this bag's weight.",
    facts: [],
  },
];

/**
 * Builds the contextual payload a later challenge must be verified against.
 *
 * Matches the photographed object and the inspiration topic against a small
 * evergreen catalog. Does not invent a measurement of this specific object,
 * and does not look anything up on the web.
 */
export function buildContextualPayload(
  analysis: ObjectAnalysis,
  inspiration: InspirationContext | null,
): ContextualPayload {
  const hay = [
    analysis.objectName,
    analysis.category,
    inspiration?.topic ?? "",
    inspiration?.reason ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const entry = CATALOG.find((candidate) =>
    candidate.match.some((token) => hay.includes(token)),
  );

  if (entry === undefined) {
    return {
      topic: inspiration?.topic || analysis.objectName || "everyday object",
      reason:
        inspiration?.reason ||
        "The object's real-world context can inspire a hypothetical maths situation.",
      facts: [],
    };
  }

  return {
    topic: inspiration?.topic || entry.topic,
    reason: inspiration?.reason || entry.reason,
    facts: [...entry.facts],
  };
}

export function isContextualFact(
  value: { label: string; value: number; unit?: string },
  payload: ContextualPayload | null,
): boolean {
  if (payload === null || payload.facts.length === 0) return false;

  return payload.facts.some((fact) => {
    if (fact.value !== value.value) return false;
    if (!unitsAgree(fact.unit, value.unit)) return false;
    return labelsLooselyMatch(fact.label, value.label);
  });
}

function unitsAgree(left?: string, right?: string): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return sameUnit(left, right);
}

function labelsLooselyMatch(left: string, right: string): boolean {
  const a = normalise(left);
  const b = normalise(right);
  return a === b || a.includes(b) || b.includes(a);
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/g, "");
}
