import {
  type Discovery,
  type DiscoveryCategory,
  DISCOVERY_CATEGORIES,
  DiscoverySchema,
  type ObjectAnalysis,
} from "@/lib/ai/schemas";

/**
 * Grounding and fallback for Discovery, kept out of the model call so they
 * can be tested without a network.
 *
 * The model proposes a short fact. This module decides whether that fact is
 * safe to persist. It does not edit a shaky claim into a better one: a
 * malformed answer is a failure, and an unsupported claim is discarded in
 * favour of a separately built observation.
 */

export const FACT_SUPPORTS = [
  "established",
  "well_known",
  "observation",
] as const;

export type FactSupport = (typeof FACT_SUPPORTS)[number];

/**
 * What the model answers. `factSupport` is a judgement for this module, not
 * part of the persisted Discovery.
 */
export type WireDiscovery = {
  title: string;
  text: string;
  category: DiscoveryCategory;
  factSupport: FactSupport;
};

export type DiscoveryFinalization =
  | { status: "ok"; discovery: Discovery; usedFallback: boolean }
  | { status: "generation_failure" };

const TITLE_MAX = 80;
const TEXT_MAX = 800;

const YEAR = /\b(?:1[0-9]{3}|20[0-9]{2})\b/;

const INVENTION_CLAIM =
  /\b(?:invented|patented|founded|discovered by|created by|designed by|first made in|first sold)\b/i;

const CITATION =
  /\b(?:according to|et al\b|source:|cited|wikipedia|references?)\b|\[\d+\]|\(\s*[A-Z][a-zA-Z.]+,\s*\d{4}\s*\)/;

const PRODUCT_CLAIM =
  /\b(?:best-selling|best selling|world'?s first|award-winning|number one|#1|clinically|guaranteed)\b/i;

const MEASUREMENT = /\b(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|oz|ounces?|mL|ml|millilitres?|milliliters?|L|litres?|liters?|g|grams?|kg|kilograms?|cm|centimetres?|centimeters?|mm|inches|inch|in\.?|feet|foot|ft|lbs?|pounds?)\b/gi;

const INVENTED_MATERIAL = [
  "stainless steel",
  "aluminum",
  "aluminium",
  "titanium",
  "carbon fiber",
  "carbon fibre",
  "polyethylene",
  "polypropylene",
] as const;

/**
 * Turns a parsed model answer into a Discovery the application may store,
 * or a typed failure.
 *
 * Empty fields, the wrong length, or an invalid category are generation
 * failures: those are broken output, and they are not repaired. A fluent
 * answer that invents a date or a specification is not repaired either —
 * its text is dropped and an observation built from the reading is used
 * instead, which is the documented fallback, not an edit of the claim.
 */
export function finalizeDiscovery(
  wire: WireDiscovery,
  analysis: ObjectAnalysis,
): DiscoveryFinalization {
  const title = wire.title.trim();
  const text = wire.text.trim();

  if (title.length === 0 || text.length === 0) {
    return { status: "generation_failure" };
  }

  if (title.length > TITLE_MAX || text.length > TEXT_MAX) {
    return { status: "generation_failure" };
  }

  if (!isDiscoveryCategory(wire.category)) {
    return { status: "generation_failure" };
  }

  if (!isFactSupport(wire.factSupport)) {
    return { status: "generation_failure" };
  }

  const sentences = sentenceCount(text);
  if (sentences < 2 || sentences > 4) {
    return { status: "generation_failure" };
  }

  const inconsistentObservation =
    wire.factSupport === "observation" && wire.category !== "observation";

  if (inconsistentObservation || hasUnsupportedClaims(title, text, analysis)) {
    return observationResult(analysis);
  }

  const parsed = DiscoverySchema.safeParse({
    title,
    text,
    category: wire.category,
  });

  if (!parsed.success) {
    return { status: "generation_failure" };
  }

  return { status: "ok", discovery: parsed.data, usedFallback: false };
}

/**
 * A short observation built only from the reading.
 *
 * Used when the model cannot support a richer fact, and when a proposed
 * fact fails the unsupported-claim checks. The wording is plain on purpose:
 * it restates what the photograph already established.
 */
export function observationDiscovery(analysis: ObjectAnalysis): Discovery {
  const objectName = analysis.objectName.trim();
  const shape = first(analysis.shapeProperties);
  const observable = first(analysis.observableProperties);
  const countable = first(analysis.countableProperties);
  const hasLabel =
    analysis.visibleText.length > 0 || analysis.visibleMeasurements.length > 0;

  const firstSentence = shape
    ? `Looking at this ${objectName}, you can see ${asComplement(shape)}.`
    : `This ${objectName} is something you can look at closely and describe.`;

  const secondSentence = hasLabel
    ? "Its printed label also gives useful information about what's inside."
    : observable
      ? `You can also see that it is ${observable}.`
      : countable
        ? `Looking closely, you can notice ${countable}.`
        : "Looking at its shape tells you how it was made to be used.";

  return DiscoverySchema.parse({
    title: observationTitle({ shape, hasLabel }),
    text: `${firstSentence} ${secondSentence}`,
    category: "observation",
  });
}

export function hasUnsupportedClaims(
  title: string,
  text: string,
  analysis: ObjectAnalysis,
): boolean {
  const combined = `${title}\n${text}`;

  if (YEAR.test(combined)) return true;
  if (INVENTION_CLAIM.test(combined)) return true;
  if (CITATION.test(combined)) return true;
  if (PRODUCT_CLAIM.test(combined)) return true;
  if (hasInventedMeasurement(combined, analysis)) return true;
  if (hasInventedMaterial(combined, analysis)) return true;

  return false;
}

export function sentenceCount(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((part) => part.replace(/[.!?]+/g, "").trim().length > 0).length;
}

function observationResult(analysis: ObjectAnalysis): DiscoveryFinalization {
  try {
    return {
      status: "ok",
      discovery: observationDiscovery(analysis),
      usedFallback: true,
    };
  } catch {
    return { status: "generation_failure" };
  }
}

function observationTitle({
  shape,
  hasLabel,
}: {
  shape: string | undefined;
  hasLabel: boolean;
}): string {
  const shapeText = shape?.toLowerCase() ?? "";

  if (/(tall|handle|grip|narrow|screw cap|cap)/.test(shapeText)) {
    return "Designed to be easy to hold";
  }

  if (hasLabel) {
    return "Made so you can read it";
  }

  if (shape) {
    return "A shape you can notice";
  }

  return "A closer look";
}

function hasInventedMeasurement(
  text: string,
  analysis: ObjectAnalysis,
): boolean {
  for (const match of text.matchAll(MEASUREMENT)) {
    const value = match[1];
    const unit = match[2];
    if (value === undefined || unit === undefined) continue;

    const recorded = analysis.visibleMeasurements.some(
      (measurement) =>
        String(measurement.value) === value &&
        unitsLooselyMatch(measurement.unit, unit),
    );

    const printed = analysis.visibleText.some(
      (line) =>
        line.includes(value) &&
        line.toLowerCase().includes(normaliseUnit(unit)),
    );

    if (!recorded && !printed) return true;
  }

  return false;
}

function hasInventedMaterial(
  text: string,
  analysis: ObjectAnalysis,
): boolean {
  const established = establishedText(analysis);

  return INVENTED_MATERIAL.some(
    (material) =>
      hasPhrase(text, material) && !hasPhrase(established, material),
  );
}

function establishedText(analysis: ObjectAnalysis): string {
  return [
    analysis.objectName,
    analysis.category,
    analysis.brand ?? "",
    ...analysis.visibleText,
    ...analysis.shapeProperties,
    ...analysis.observableProperties,
    ...analysis.countableProperties,
  ].join("\n");
}

function unitsLooselyMatch(recorded: string, mentioned: string): boolean {
  return normaliseUnit(recorded) === normaliseUnit(mentioned);
}

function normaliseUnit(unit: string): string {
  const folded = unit.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();

  if (folded === "fluid ounces" || folded === "fluid ounce" || folded === "fl oz") {
    return "fl oz";
  }
  if (folded === "ounces" || folded === "ounce" || folded === "oz") return "oz";
  if (folded === "millilitres" || folded === "milliliters" || folded === "millilitre" || folded === "milliliter" || folded === "ml") {
    return "ml";
  }
  if (folded === "litres" || folded === "liters" || folded === "litre" || folded === "liter" || folded === "l") {
    return "l";
  }
  if (folded === "grams" || folded === "gram") return "g";
  if (folded === "kilograms" || folded === "kilogram") return "kg";
  if (folded === "centimetres" || folded === "centimeters" || folded === "centimetre" || folded === "centimeter") {
    return "cm";
  }
  if (folded === "inches" || folded === "inch" || folded === "in") return "in";
  if (folded === "feet" || folded === "foot" || folded === "ft") return "ft";
  if (folded === "pounds" || folded === "pound" || folded === "lbs" || folded === "lb") {
    return "lb";
  }

  return folded;
}

function asComplement(property: string): string {
  if (/^(a|an|the|approximately|almost|roughly|about)\b/i.test(property)) {
    return property;
  }

  return /^[aeiou]/i.test(property) ? `an ${property}` : `a ${property}`;
}

function first(values: readonly string[]): string | undefined {
  const value = values[0]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function isDiscoveryCategory(value: string): value is DiscoveryCategory {
  return (DISCOVERY_CATEGORIES as readonly string[]).includes(value);
}

function isFactSupport(value: string): value is FactSupport {
  return (FACT_SUPPORTS as readonly string[]).includes(value);
}

function hasPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}
