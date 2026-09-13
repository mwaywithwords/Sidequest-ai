/**
 * A small, explicit unit system for Grade 3–5 challenges.
 *
 * This is not a general units library. It only knows the everyday labels
 * SIDEQUEST actually generates, and it will not guess that two unfamiliar
 * strings mean the same thing.
 */

export const UNIT_FAMILIES = ["volume", "length", "mass", "count"] as const;
export type UnitFamily = (typeof UNIT_FAMILIES)[number];

const VOLUME: Record<string, string> = {
  "fl oz": "fl oz",
  floz: "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  ml: "ml",
  millilitre: "ml",
  milliliter: "ml",
  millilitres: "ml",
  milliliters: "ml",
  l: "l",
  litre: "l",
  liter: "l",
  litres: "l",
  liters: "l",
  gal: "gal",
  gallon: "gal",
  gallons: "gal",
};

const LENGTH: Record<string, string> = {
  in: "in",
  inch: "in",
  inches: "in",
  cm: "cm",
  centimetre: "cm",
  centimeter: "cm",
  centimetres: "cm",
  centimeters: "cm",
  mm: "mm",
  ft: "ft",
  foot: "ft",
  feet: "ft",
};

const MASS: Record<string, string> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
};

/**
 * Count labels that appear on Inspired Math facts. They are not SI units.
 * Singular and plural must still be the same unit so 1 point + 3 points
 * can add. Different count words stay incompatible.
 */
const COUNT: Record<string, string> = {
  point: "point",
  points: "point",
  dollar: "dollar",
  dollars: "dollar",
  cent: "cent",
  cents: "cent",
  page: "page",
  pages: "page",
  pair: "pair",
  pairs: "pair",
  shot: "shot",
  shots: "shot",
};

export function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Fold casing, dots, and spaces. "FL OZ" and "fl. oz." become "fl oz".
 * Unknown labels are returned folded, not mapped onto a known unit.
 */
export function normaliseUnit(unit: string): string {
  const folded = unit.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();

  if (folded === "fl oz" || folded === "fluid ounce" || folded === "fluid ounces") {
    return "fl oz";
  }

  return (
    VOLUME[folded] ??
    LENGTH[folded] ??
    MASS[folded] ??
    COUNT[folded] ??
    folded
  );
}

export function unitFamily(unit: string | undefined): UnitFamily | "unknown" {
  if (unit === undefined || unit.trim().length === 0) return "count";

  const normalised = normaliseUnit(unit);
  if (VOLUME[normalised] || normalised === "fl oz" || normalised === "ml" || normalised === "l" || normalised === "gal") {
    return "volume";
  }
  if (LENGTH[normalised] || normalised === "in" || normalised === "cm" || normalised === "mm" || normalised === "ft") {
    return "length";
  }
  if (MASS[normalised] || normalised === "g" || normalised === "kg" || normalised === "lb" || normalised === "oz") {
    return "mass";
  }

  return "unknown";
}

/**
 * Two units can sit in the same arithmetic slot when they are the same
 * family, or when both are missing (a count). "fl oz" vs "inches" is not
 * compatible. An unknown label is only compatible with the same unknown
 * label after normalisation.
 */
export function unitsCompatible(
  left: string | undefined,
  right: string | undefined,
): boolean {
  const leftFamily = unitFamily(left);
  const rightFamily = unitFamily(right);

  if (leftFamily === "count" && rightFamily === "count") return true;
  if (leftFamily === "count" || rightFamily === "count") return false;

  if (leftFamily === "unknown" || rightFamily === "unknown") {
    if (left === undefined || right === undefined) return false;
    return normaliseUnit(left) === normaliseUnit(right);
  }

  return leftFamily === rightFamily;
}

export function sameUnit(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return normaliseUnit(left) === normaliseUnit(right);
}

/**
 * Shared unit for add/subtract. All listed units must be compatible.
 * Counts stay unitless. Otherwise the first concrete unit wins as the
 * display form after normalisation.
 */
export function sharedUnit(
  units: readonly (string | undefined)[],
): string | undefined | null {
  if (units.length === 0) return undefined;

  for (let index = 1; index < units.length; index += 1) {
    if (!unitsCompatible(units[0], units[index])) return null;
  }

  const concrete = units.find(
    (unit) => unit !== undefined && unit.trim().length > 0,
  );

  return concrete === undefined ? undefined : normaliseUnit(concrete);
}
