import {
  type Discovery,
  type DiscoveryCategory,
  DiscoverySchema,
  type ObjectAnalysis,
} from "@/lib/ai/schemas";

/**
 * Student-facing Did You Know facts about a *kind* of object.
 *
 * This is not ObjectAnalysis, not grounding, and not a math input. A
 * fact here may talk about candles in general; it must never claim a
 * material, capacity, or date for the photographed specimen.
 */

export const DID_YOU_KNOW_ANGLES = [
  "history",
  "science",
  "how_it_works",
  "how_its_made",
  "everyday",
] as const;

export type DidYouKnowAngle = (typeof DID_YOU_KNOW_ANGLES)[number];

/**
 * Persisted Discovery categories stay stable for stored quests. The
 * student-facing angles map onto those existing values.
 */
export const ANGLE_TO_CATEGORY: Record<DidYouKnowAngle, DiscoveryCategory> = {
  history: "history",
  science: "science",
  how_it_works: "engineering",
  how_its_made: "design",
  everyday: "culture",
};

const GENERIC_DESCRIPTION = [
  /\bthis object is commonly used for\b/i,
  /\bthis item appears to\b/i,
  /\bthis container is designed to\b/i,
  /\bthis product features\b/i,
  /\bthis object can be seen\b/i,
  /\bthis object appears to\b/i,
  /\bthis item is commonly used\b/i,
  /\bthis photo shows\b/i,
  /\blooking at this [a-z]/i,
  /\bthis object is designed to\b/i,
] as const;

type FallbackFact = {
  keys: readonly string[];
  title: string;
  text: string;
  category: DiscoveryCategory;
};

/**
 * Well-established general facts for ordinary object types. Used only
 * when the model cannot support a stronger Did You Know claim. Matched
 * by whole-word keys against the reading's name and category — never
 * against a suggestion list.
 */
const FALLBACK_FACTS: readonly FallbackFact[] = [
  {
    keys: ["wallet", "purse", "billfold"],
    title: "A pocket keeper",
    text: "Wallets were made so people could keep money and important cards together in a pocket. Folding them flat made them easier to carry than a bag of loose coins.",
    category: "history",
  },
  {
    keys: ["sneaker", "shoe", "shoes", "footwear", "sandal", "boot"],
    title: "Grip underfoot",
    text: "The grooves on many shoe soles help create friction with the ground. That extra grip can help keep you from slipping.",
    category: "science",
  },
  {
    keys: ["cup", "mug", "tumbler"],
    title: "A wall for liquid",
    text: "A cup keeps a drink in place because its solid walls and closed bottom stop liquid from spreading out. The open top is what lets you sip.",
    category: "engineering",
  },
  {
    keys: ["bottle"],
    title: "A lid that travels",
    text: "Bottles use a narrow opening and a cap so liquid does not spill while you carry them. That simple idea is why people can take drinks from place to place.",
    category: "engineering",
  },
  {
    keys: ["beverage can", "soda can", "aluminum can", "tin can", "can"],
    title: "Metal that can start over",
    text: "Aluminum cans can be recycled and made into new cans again. Aluminum can be reused many times instead of being thrown away.",
    category: "culture",
  },
  {
    keys: ["candle jar", "candle", "jar"],
    title: "Light before electricity",
    text: "Candles have been used for thousands of years. Long ago, people used them as an important source of light before electric lights existed.",
    category: "history",
  },
  {
    keys: ["basketball", "soccer ball", "football", "ball"],
    title: "Air that springs back",
    text: "A basketball bounces because the air inside pushes against its rubber walls. When the ball hits the floor, it squishes for a moment and springs back into shape.",
    category: "science",
  },
  {
    keys: ["book", "notebook", "textbook"],
    title: "Pages that stay in order",
    text: "A book is made of many sheets of paper pressed and bound along one edge. That binding is why the pages stay in order instead of flying apart.",
    category: "design",
  },
  {
    keys: ["toy", "block", "blocks", "lego"],
    title: "Play that repeats",
    text: "Many toys are designed so kids can play with the same idea again and again. Repeating a game or a motion is one way people practice new skills.",
    category: "culture",
  },
  {
    keys: ["pencil"],
    title: "A core that writes",
    text: "A pencil writes because a clay-and-graphite core rubs tiny bits onto the paper. The wooden sides keep that core from snapping in your hand.",
    category: "engineering",
  },
  {
    keys: ["zipper"],
    title: "Tiny teeth that zip",
    text: "A zipper uses a slider to push two rows of tiny teeth together. Moving the slider the other way pulls the teeth apart.",
    category: "engineering",
  },
  {
    keys: ["clock", "watch"],
    title: "Hands that chase time",
    text: "Many clocks show time with hands that travel around a circle. The short hand marks the hour, and the long hand marks the minutes.",
    category: "engineering",
  },
  {
    keys: ["box", "carton", "cardboard"],
    title: "Folds that make walls",
    text: "Cardboard boxes start as flat sheets. Folds and flaps turn those sheets into walls that can protect what is inside.",
    category: "design",
  },
  {
    keys: ["plate", "dish"],
    title: "A rim that holds food",
    text: "A plate is wide and shallow so food can sit in the middle. The raised rim helps keep bites from sliding off the edge.",
    category: "design",
  },
  {
    keys: ["key", "keys"],
    title: "A shape that matches a lock",
    text: "A key works because its bumps match the inside of one lock. If the pattern does not fit, the lock stays closed.",
    category: "engineering",
  },
];

const GENERIC_FALLBACK: FallbackFact = {
  keys: [],
  title: "A closer look",
  text: "Everyday objects like this one can hide interesting ideas in how they are made, how they work, or how people use them.",
  category: "observation",
};

export function hasGenericDescriptionLanguage(text: string): boolean {
  return GENERIC_DESCRIPTION.some((pattern) => pattern.test(text));
}

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
}

/**
 * A safe Did You Know built only from the identified object *type*.
 *
 * Photographic details stay in ObjectAnalysis. This fallback must not
 * restate a visible measurement or invent a date.
 */
export function didYouKnowFallback(analysis: ObjectAnalysis): Discovery {
  const match = matchFallbackFact(analysis);
  return DiscoverySchema.parse({
    title: match.title,
    text: match.text,
    category: match.category,
  });
}

export function matchFallbackFact(analysis: ObjectAnalysis): FallbackFact {
  const haystack = `${analysis.objectName} ${analysis.category}`;
  const ranked = [...FALLBACK_FACTS].sort(
    (left, right) => longestKey(right.keys) - longestKey(left.keys),
  );

  for (const fact of ranked) {
    if (fact.keys.some((key) => hasWholePhrase(haystack, key))) {
      return fact;
    }
  }

  return GENERIC_FALLBACK;
}

function longestKey(keys: readonly string[]): number {
  return keys.reduce((best, key) => Math.max(best, key.length), 0);
}

function hasWholePhrase(text: string, phrase: string): boolean {
  const escaped = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}
