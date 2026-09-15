import { type Grade, type SkillId, SKILL_IDS } from "@/lib/types";

/**
 * Scavenger-hunt photo ideas shown on Scan *before* a photograph is taken.
 *
 * These are gameplay prompts. They are not an allowlist, not suitability,
 * not Skill Fit, not grounding, and not verification. A child may ignore
 * every suggestion and still receive a Sidequest from any safe object
 * the pipeline can honestly connect to math.
 */

export const HUNT_RECENT_KEY = "sidequest.hunt-recent";

export type HuntRoom = "kitchen" | "bedroom" | "school" | "everyday";

export type PhotoSuggestion = {
  id: string;
  /** Chip label, e.g. "Find a drink". */
  label: string;
  /** Short name for Surprise Me, e.g. "drink". */
  shortName: string;
  article: "a" | "an" | "some";
  icon: string;
  rooms: readonly HuntRoom[];
  skills: readonly SkillId[];
};

const ALL_SKILLS = SKILL_IDS;

export const PHOTO_SUGGESTION_CATALOGUE: readonly PhotoSuggestion[] = [
  {
    id: "drink",
    label: "Find a drink",
    shortName: "drink",
    article: "a",
    icon: "🥤",
    rooms: ["kitchen"],
    skills: ["addition", "division", "fractions", "measurement"],
  },
  {
    id: "shoes",
    label: "Find some shoes",
    shortName: "shoes",
    article: "some",
    icon: "👟",
    rooms: ["bedroom"],
    skills: ["multiplication", "measurement", "geometry"],
  },
  {
    id: "wallet",
    label: "Find a wallet",
    shortName: "wallet",
    article: "a",
    icon: "💰",
    rooms: ["everyday"],
    skills: ["addition", "subtraction", "multiplication"],
  },
  {
    id: "book",
    label: "Find a book",
    shortName: "book",
    article: "a",
    icon: "📚",
    rooms: ["bedroom", "school"],
    skills: ["addition", "subtraction", "measurement", "geometry"],
  },
  {
    id: "cards",
    label: "Find some cards",
    shortName: "cards",
    article: "some",
    icon: "🃏",
    rooms: ["everyday"],
    skills: ["addition", "multiplication", "division", "fractions"],
  },
  {
    id: "blocks",
    label: "Find some blocks",
    shortName: "blocks",
    article: "some",
    icon: "🧱",
    rooms: ["bedroom"],
    skills: ["addition", "subtraction", "multiplication", "division", "geometry"],
  },
  {
    id: "snack",
    label: "Find a snack",
    shortName: "snack",
    article: "a",
    icon: "🍪",
    rooms: ["kitchen"],
    skills: ["subtraction", "division", "fractions"],
  },
  {
    id: "cans",
    label: "Find some cans",
    shortName: "cans",
    article: "some",
    icon: "🥫",
    rooms: ["kitchen"],
    skills: ["multiplication", "division", "geometry", "measurement"],
  },
  {
    id: "cup",
    label: "Find a cup",
    shortName: "cup",
    article: "a",
    icon: "☕",
    rooms: ["kitchen"],
    skills: ["fractions", "division", "measurement"],
  },
  {
    id: "bottle",
    label: "Find a bottle",
    shortName: "bottle",
    article: "a",
    icon: "🍼",
    rooms: ["kitchen"],
    skills: ["measurement", "division", "fractions"],
  },
  {
    id: "box",
    label: "Find a box",
    shortName: "box",
    article: "a",
    icon: "📦",
    rooms: ["everyday"],
    skills: ["geometry", "multiplication", "measurement"],
  },
  {
    id: "ball",
    label: "Find a ball",
    shortName: "ball",
    article: "a",
    icon: "🏀",
    rooms: ["everyday"],
    skills: ["geometry", "addition", "subtraction"],
  },
  {
    id: "pencil",
    label: "Find a pencil",
    shortName: "pencil",
    article: "a",
    icon: "✏️",
    rooms: ["school"],
    skills: ["measurement", "geometry"],
  },
  {
    id: "clock",
    label: "Find a clock",
    shortName: "clock",
    article: "a",
    icon: "⏰",
    rooms: ["everyday"],
    skills: ["measurement", "fractions", "geometry"],
  },
  {
    id: "plate",
    label: "Find a plate",
    shortName: "plate",
    article: "a",
    icon: "🍽️",
    rooms: ["kitchen"],
    skills: ["geometry", "fractions"],
  },
  {
    id: "backpack",
    label: "Find a backpack",
    shortName: "backpack",
    article: "a",
    icon: "🎒",
    rooms: ["school"],
    skills: ["addition", "subtraction", "measurement"],
  },
  {
    id: "ruler",
    label: "Find a ruler",
    shortName: "ruler",
    article: "a",
    icon: "📏",
    rooms: ["school"],
    skills: ["measurement", "geometry"],
  },
  {
    id: "keys",
    label: "Find some keys",
    shortName: "keys",
    article: "some",
    icon: "🔑",
    rooms: ["everyday"],
    skills: ["addition", "subtraction", "geometry"],
  },
  {
    id: "toy",
    label: "Find a toy",
    shortName: "toy",
    article: "a",
    icon: "🧸",
    rooms: ["bedroom"],
    skills: ALL_SKILLS,
  },
  {
    id: "paper",
    label: "Find some paper",
    shortName: "paper",
    article: "some",
    icon: "📄",
    rooms: ["school"],
    skills: ["fractions", "geometry", "measurement"],
  },
  {
    id: "spoon",
    label: "Find a spoon",
    shortName: "spoon",
    article: "a",
    icon: "🥄",
    rooms: ["kitchen"],
    skills: ["measurement", "geometry"],
  },
  {
    id: "pillow",
    label: "Find a pillow",
    shortName: "pillow",
    article: "a",
    icon: "🛏️",
    rooms: ["bedroom"],
    skills: ["geometry", "measurement"],
  },
];

const SKILL_FOCUS: Record<SkillId, readonly string[]> = {
  addition: ["wallet", "book", "drink", "blocks", "cards"],
  subtraction: ["wallet", "snack", "blocks", "book", "keys"],
  multiplication: ["shoes", "cans", "blocks", "cards", "box"],
  division: ["snack", "cards", "blocks", "drink", "cup"],
  fractions: ["snack", "cup", "paper", "cards", "plate"],
  measurement: ["bottle", "shoes", "book", "pencil", "ruler"],
  geometry: ["cans", "box", "ball", "book", "plate"],
};

export type HuntRecentMap = Partial<Record<SkillId, string[]>>;

/**
 * Suggestions never decide whether a photo is accepted. Locked so tests
 * can prove an unsuggested object is still a valid hunt.
 */
export function suggestionsAreAllowlist(): false {
  return false;
}

export function suggestionMayRejectPhoto(
  objectName: string,
  suggestedIds: readonly string[],
): false {
  void objectName;
  void suggestedIds;
  return false;
}

export function surpriseLine(suggestion: PhotoSuggestion): string {
  return `Can you find ${suggestion.article} ${suggestion.shortName.toUpperCase()}?`;
}

export function suggestionsForSkill(
  skillId: SkillId,
  options: {
    grade?: Grade;
    excludeIds?: readonly string[];
    count?: number;
    start?: number;
  } = {},
): PhotoSuggestion[] {
  const count = options.count ?? 3;
  const pool = rotatePool(skillId, options.excludeIds ?? []);
  if (pool.length === 0) return [];

  const start = wrapIndex(options.start ?? 0, pool.length);
  const picked: PhotoSuggestion[] = [];
  for (let step = 0; step < pool.length && picked.length < count; step += 1) {
    const item = pool[(start + step) % pool.length];
    if (item) picked.push(item);
  }
  return picked;
}

export function surpriseSuggestion(
  skillId: SkillId,
  options: {
    grade?: Grade;
    hiddenIds: readonly string[];
    start?: number;
  },
): PhotoSuggestion {
  const pool = rotatePool(skillId, options.hiddenIds);
  if (pool.length === 0) {
    const fallback = PHOTO_SUGGESTION_CATALOGUE[0];
    if (!fallback) {
      throw new Error("Photo suggestion catalogue is empty.");
    }
    return fallback;
  }

  const start = wrapIndex(options.start ?? 0, pool.length);
  return pool[start] ?? pool[0]!;
}

export function nextHuntStart(recentIds: readonly string[], poolSize: number): number {
  if (poolSize <= 0) return 0;
  return recentIds.length % poolSize;
}

export function rememberHuntIds(
  stored: HuntRecentMap,
  skillId: SkillId,
  ids: readonly string[],
  limit = 12,
): HuntRecentMap {
  const previous = stored[skillId] ?? [];
  const merged = [...previous, ...ids].filter((id, index, all) => all.indexOf(id) === index);
  return {
    ...stored,
    [skillId]: merged.slice(-limit),
  };
}

export function parseHuntRecent(raw: string | null | undefined): HuntRecentMap {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: HuntRecentMap = {};
    for (const skillId of SKILL_IDS) {
      const value = (parsed as Record<string, unknown>)[skillId];
      if (!Array.isArray(value)) continue;
      result[skillId] = value.filter((id): id is string => typeof id === "string");
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeHuntRecent(stored: HuntRecentMap): string {
  return JSON.stringify(stored);
}

function rotatePool(
  skillId: SkillId,
  excludeIds: readonly string[],
): PhotoSuggestion[] {
  const focus = new Set(SKILL_FOCUS[skillId]);
  const preferred = PHOTO_SUGGESTION_CATALOGUE.filter((item) =>
    item.skills.includes(skillId),
  );
  const ranked = [
    ...preferred.filter((item) => focus.has(item.id)),
    ...preferred.filter((item) => !focus.has(item.id)),
  ];
  const unique = ranked.filter(
    (item, index) => ranked.findIndex((other) => other.id === item.id) === index,
  );
  const available = unique.filter((item) => !excludeIds.includes(item.id));
  return available.length >= 3 ? available : unique;
}

function wrapIndex(start: number, length: number): number {
  if (length <= 0) return 0;
  const mod = start % length;
  return mod < 0 ? mod + length : mod;
}
