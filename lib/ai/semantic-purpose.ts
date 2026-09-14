import type {
  InspirationContext,
  ObjectAnalysis,
} from "@/lib/ai/schemas";
import type { SkillId } from "@/lib/types";

/**
 * Semantic / real-world purpose of a photographed object.
 *
 * This is not an observed measurement. A wallet being used for money does
 * not mean any amount was visible. The path resolver must not special-case
 * named objects; it asks whether an identifiable object can anchor a
 * situation. This module answers what that situation may honestly be.
 */

export type SemanticDomainId =
  | "money"
  | "walking"
  | "liquid"
  | "scoring"
  | "reading"
  | "carrying"
  | "servings"
  | "food"
  | "time"
  | "seating"
  | "travel";

export type SemanticPurpose = {
  domains: SemanticDomainId[];
  activities: string[];
  reason: string;
};

type DomainLexicon = {
  id: SemanticDomainId;
  /**
   * Mathematical situations and activities, never a claimed measurement.
   */
  situations: readonly string[];
  /**
   * Evidence that this kind of object belongs to the domain. Used only
   * to infer purpose from a reading, not to pick a path by object name.
   */
  objectKinds: readonly string[];
};

const DOMAINS: readonly DomainLexicon[] = [
  {
    id: "money",
    situations: [
      "money",
      "dollar",
      "dollars",
      "cent",
      "cents",
      "bill",
      "bills",
      "coin",
      "coins",
      "spend",
      "spent",
      "spending",
      "save",
      "saving",
      "change",
      "price",
      "prices",
      "budget",
      "budgeting",
      "pay",
      "paid",
      "payment",
      "cash",
      "currency",
    ],
    objectKinds: ["wallet", "purse", "billfold", "coin purse"],
  },
  {
    id: "walking",
    situations: [
      "walk",
      "walking",
      "step",
      "steps",
      "stride",
      "pace",
      "lap",
      "laps",
      "distance",
      "pair",
      "pairs",
    ],
    objectKinds: [
      "sneaker",
      "sneakers",
      "shoe",
      "shoes",
      "sandal",
      "sandals",
      "boot",
      "boots",
      "trainer",
      "trainers",
      "footwear",
    ],
  },
  {
    id: "liquid",
    situations: [
      "water",
      "liquid",
      "pour",
      "poured",
      "pouring",
      "fill",
      "filled",
      "filling",
      "drink",
      "drinking",
      "serving",
      "servings",
      "capacity",
      "volume",
      "millilitre",
      "millilitres",
      "milliliter",
      "milliliters",
      "ml",
    ],
    objectKinds: [
      "cup",
      "mug",
      "glass",
      "tumbler",
      "bottle",
      "pitcher",
      "flask",
      "beaker",
    ],
  },
  {
    id: "scoring",
    situations: [
      "score",
      "scores",
      "scoring",
      "point",
      "points",
      "quarter",
      "quarters",
      "team",
      "teams",
      "shot",
      "shots",
      "game",
      "basket",
      "hoop",
      "court",
    ],
    objectKinds: [
      "basketball",
      "soccer",
      "football",
      "baseball",
      "volleyball",
      "sports ball",
    ],
  },
  {
    id: "reading",
    situations: [
      "page",
      "pages",
      "chapter",
      "chapters",
      "reading",
      "story",
      "stories",
    ],
    objectKinds: [
      "book",
      "novel",
      "textbook",
      "paperback",
      "hardcover",
      "notebook",
    ],
  },
  {
    id: "carrying",
    situations: [
      "carry",
      "carrying",
      "pack",
      "packed",
      "supplies",
      "items",
      "weight",
      "load",
      "pencils",
      "erasers",
    ],
    objectKinds: [
      "backpack",
      "backpacks",
      "bag",
      "satchel",
      "knapsack",
      "rucksack",
    ],
  },
  {
    id: "servings",
    situations: [
      "serving",
      "servings",
      "portion",
      "portions",
      "scoop",
      "scoops",
      "bite",
      "bites",
    ],
    objectKinds: ["spoon", "fork", "bowl", "plate", "cereal"],
  },
  {
    id: "food",
    situations: [
      "apple",
      "apples",
      "pizza",
      "pizzas",
      "slice",
      "slices",
      "orange",
      "oranges",
      "cookie",
      "cookies",
      "sandwich",
      "sandwiches",
    ],
    objectKinds: [
      "apple",
      "pizza",
      "orange",
      "cookie",
      "sandwich",
      "food",
      "cereal",
    ],
  },
  {
    id: "time",
    situations: [
      "hour",
      "hours",
      "minute",
      "minutes",
      "o'clock",
      "clock",
      "time",
    ],
    objectKinds: ["clock", "watch", "timer"],
  },
  {
    id: "seating",
    situations: [
      "seat",
      "seats",
      "seating",
      "sit",
      "sitting",
      "group",
      "groups",
      "people",
    ],
    objectKinds: ["chair", "stool", "bench", "sofa"],
  },
  {
    id: "travel",
    situations: [
      "distance",
      "wheel",
      "wheels",
      "travel",
      "trip",
      "trips",
      "drive",
      "driving",
      "miles",
    ],
    objectKinds: ["toy car", "toy truck", "car", "truck", "vehicle"],
  },
];

const DOMAIN_TOPIC: Record<SemanticDomainId, string> = {
  money: "money, spending, and saving",
  walking: "walking, steps, and pairs",
  liquid: "liquid, pouring, and servings",
  scoring: "scoring, teams, and shots",
  reading: "reading, pages, and chapters",
  carrying: "carrying items and school supplies",
  servings: "servings and portions",
  food: "food portions and sharing",
  time: "hours and elapsed time",
  seating: "seating and groups",
  travel: "distance, wheels, and travel",
};

/**
 * Ordinary uses and related activities inferred from the reading.
 *
 * `typicalUses` from vision are situation evidence, not observed numbers.
 * Object-kind tokens only help recognise the category of thing; they are
 * not a path table.
 */
export function inferSemanticPurpose(
  analysis: ObjectAnalysis,
): SemanticPurpose {
  const identity = identityHay(analysis);
  const uses = usesHay(analysis);
  const domains: SemanticDomainId[] = [];
  const activities: string[] = [];

  for (const domain of DOMAINS) {
    const kindHit = domain.objectKinds.some((token) =>
      containsToken(identity, token),
    );
    const useHit = domain.situations.some((token) => containsToken(uses, token));

    if (!kindHit && !useHit) continue;

    domains.push(domain.id);
    activities.push(
      ...domain.situations.filter((token) => containsToken(uses, token)),
    );
  }

  return {
    domains,
    activities: unique(activities),
    reason: purposeReason(analysis, domains),
  };
}

export function canAnchorSemantically(analysis: ObjectAnalysis): boolean {
  if (analysis.objectName.trim().length === 0) return false;
  if (analysis.confidence < 0.5) return false;
  if (isFeaturelessScene(analysis)) return false;

  return (
    hasIdentityFeatures(analysis) || inferSemanticPurpose(analysis).domains.length > 0
  );
}

export function buildSemanticInspiration(
  analysis: ObjectAnalysis,
  skillId: SkillId,
  purpose: SemanticPurpose = inferSemanticPurpose(analysis),
): InspirationContext | null {
  if (!canAnchorSemantically(analysis)) return null;

  const object = analysis.objectName.trim() || "object";
  const topic =
    purpose.domains.length > 0
      ? DOMAIN_TOPIC[purpose.domains[0]!]
      : `everyday use of this ${object}`;

  return {
    topic,
    reason:
      purpose.reason ||
      `A ${analysis.category || "real-world object"} like this can honestly anchor a ${skillId} situation without inventing a measurement of the photograph.`,
  };
}

export function challengeMatchesObjectPurpose(
  question: string,
  objectConnection: string,
  analysis: ObjectAnalysis,
  inspiration?: InspirationContext | null,
): boolean {
  const purpose = inferSemanticPurpose(analysis);
  const objectDomains = unique([
    ...purpose.domains,
    ...domainsInText(inspiration?.topic ?? ""),
  ]);
  const challengeHay = [question, objectConnection].join(" ").toLowerCase();
  const challengeDomains = domainsInText(challengeHay);

  if (objectDomains.length === 0) {
    return !challengeDomains.includes("food");
  }

  const shared = objectDomains.filter((domain) =>
    challengeDomains.includes(domain),
  );

  if (shared.length > 0) return true;

  return !hasUnrelatedSituation(challengeDomains, objectDomains);
}

/**
 * objectConnection may cite the semantic domain (money, bills, steps)
 * rather than repeating the object label next to every number.
 */
export function connectionCitesSemanticDomain(
  connection: string,
  analysis: ObjectAnalysis,
  inspiration?: InspirationContext | null,
): boolean {
  const purpose = inferSemanticPurpose(analysis);
  const hay = connection.toLowerCase();
  const domains = unique([
    ...purpose.domains,
    ...domainsInText(inspiration?.topic ?? ""),
  ]);

  if (domains.some((domain) => containsToken(hay, domain))) return true;

  for (const domain of DOMAINS) {
    if (!domains.includes(domain.id)) continue;
    if (domain.situations.some((token) => containsToken(hay, token))) {
      return true;
    }
  }

  return false;
}

function hasUnrelatedSituation(
  challengeDomains: readonly SemanticDomainId[],
  objectDomains: readonly SemanticDomainId[],
): boolean {
  return challengeDomains.some((domain) => !objectDomains.includes(domain));
}

function domainsInText(text: string): SemanticDomainId[] {
  const hay = text.toLowerCase();
  const found: SemanticDomainId[] = [];

  if (/(?:\$|£|€)\s*\d/.test(hay) && !found.includes("money")) {
    found.push("money");
  }

  for (const domain of DOMAINS) {
    if (domain.situations.some((token) => containsToken(hay, token))) {
      if (!found.includes(domain.id)) found.push(domain.id);
    }
  }

  return found;
}

function identityHay(analysis: ObjectAnalysis): string {
  return [
    analysis.objectName,
    analysis.category,
    ...analysis.observableProperties,
    ...analysis.shapeProperties,
    ...analysis.visibleText,
  ]
    .join(" ")
    .toLowerCase();
}

function usesHay(analysis: ObjectAnalysis): string {
  return [...(analysis.typicalUses ?? []), ...analysis.observableProperties]
    .join(" ")
    .toLowerCase();
}

function hasIdentityFeatures(analysis: ObjectAnalysis): boolean {
  return (
    analysis.visibleText.length > 0 ||
    analysis.visibleMeasurements.length > 0 ||
    analysis.countableProperties.length > 0 ||
    analysis.shapeProperties.length > 0 ||
    analysis.observableProperties.length > 0 ||
    (analysis.typicalUses?.length ?? 0) > 0
  );
}

function isFeaturelessScene(analysis: ObjectAnalysis): boolean {
  const category = analysis.category.toLowerCase();
  return (
    (category === "scene" || category === "landscape") &&
    !hasIdentityFeatures(analysis)
  );
}

function purposeReason(
  analysis: ObjectAnalysis,
  domains: readonly SemanticDomainId[],
): string {
  const object = analysis.objectName.trim() || "object";
  if (domains.length === 0) {
    return `This ${object} can still inspire a hypothetical maths situation from its ordinary real-world use.`;
  }

  const topic = domains.map((domain) => DOMAIN_TOPIC[domain]).join("; ");
  return `A ${object} is ordinarily connected to ${topic}, so those situations can anchor the skill without treating them as visible numbers.`;
}

function containsToken(hay: string, token: string): boolean {
  const needle = token.toLowerCase();
  if (needle.includes(" ")) return hay.includes(needle);

  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`).test(
    hay,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
