import {
  didYouKnowFallback,
  hasGenericDescriptionLanguage,
  wordCount,
} from "@/lib/ai/did-you-know";
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
 * The model proposes a short Did You Know fact. This module decides
 * whether that fact is safe to persist. It does not edit a shaky claim
 * into a better one: a malformed answer is a failure, and an unsupported
 * claim is discarded in favour of a separately built general fact about
 * the object type. Photographic restatements are not educational facts.
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
const TEXT_MAX = 400;
const TEXT_MIN_WORDS = 8;
const TEXT_MAX_WORDS = 70;

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
  if (sentences < 1 || sentences > 3) {
    return { status: "generation_failure" };
  }

  const words = wordCount(text);
  if (words < TEXT_MIN_WORDS || words > TEXT_MAX_WORDS) {
    return { status: "generation_failure" };
  }

  const inconsistentObservation =
    wire.factSupport === "observation" && wire.category !== "observation";

  if (
    inconsistentObservation ||
    hasUnsupportedClaims(title, text, analysis) ||
    hasGenericDescriptionLanguage(`${title}\n${text}`)
  ) {
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
 * A short Did You Know built from the identified object type.
 *
 * Used when the model cannot support a richer fact, and when a proposed
 * fact fails the unsupported-claim checks. This is a general fact about
 * the kind of object, never a restatement of the photograph.
 */
export function observationDiscovery(analysis: ObjectAnalysis): Discovery {
  return didYouKnowFallback(analysis);
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

  return INVENTED_MATERIAL.some((material) => {
    if (!hasPhrase(text, material) || hasPhrase(established, material)) {
      return false;
    }

    const escaped = material.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(
      `\\b(?:this|your)\\b[^.!?]{0,90}${escaped}|${escaped}[^.!?]{0,40}\\b(?:this|your)\\b`,
      "i",
    ).test(text);
  });
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
