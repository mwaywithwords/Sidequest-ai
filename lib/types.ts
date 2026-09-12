export const GRADES = [3, 4, 5] as const;
export type Grade = (typeof GRADES)[number];

export const SKILL_IDS = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
  "fractions",
  "measurement",
  "geometry",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export type Skill = {
  id: SkillId;
  label: string;
  /** Mathematical glyph used as the tile mark. Cleaner than an icon set. */
  symbol: string;
  /** One line of kid-facing framing, shown under the label. */
  blurb: string;
  /** What to point the camera at, reused for "no good challenge here" copy. */
  lookFor: string;
  /** Raw colour value so components can set it as a CSS custom property. */
  accent: string;
};

/**
 * A measurable fact the vision stage claims to have found in the photo.
 * Rendered as a spec-sheet chip so the student can see what the object
 * contributed to their challenge.
 */
export type ObservedProperty = {
  label: string;
  value: string;
  /** How the value was obtained, which is also the honesty signal. */
  source: "printed label" | "counted" | "measured shape";
};

export type Challenge = {
  prompt: string;
  answerUnit: string;
  hint: string;
  solutionSteps: string[];
  /**
   * Mock only. Once the real pipeline lands this never reaches the browser:
   * grading moves into a Server Action and this column stays server-side.
   */
  expectedAnswer: number;
};

export type Quest = {
  id: string;
  grade: Grade;
  skillId: SkillId;
  objectName: string;
  /** Short caption standing in for the photo the student took. */
  objectCaption: string;
  discovery: string;
  connection: string;
  observed: ObservedProperty[];
  challenge: Challenge;
};

export type SkillProgress = {
  skillId: SkillId;
  attempted: number;
  correct: number;
};

export type RecentQuest = {
  id: string;
  objectName: string;
  skillId: SkillId;
  solved: boolean;
  when: string;
};

export type ProgressSummary = {
  questsSolved: number;
  objectsScanned: number;
  dayStreak: number;
  skills: SkillProgress[];
  recent: RecentQuest[];
};

/** Search params arrive as strings, so parse rather than assert. */
export function parseGrade(value: unknown): Grade | null {
  return GRADES.find((grade) => String(grade) === String(value)) ?? null;
}

export function parseSkillId(value: unknown): SkillId | null {
  return SKILL_IDS.find((skill) => skill === value) ?? null;
}
