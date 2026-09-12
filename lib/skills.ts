import type { Grade, Skill, SkillId } from "./types";

export const SKILLS: Skill[] = [
  {
    id: "addition",
    label: "Addition",
    symbol: "+",
    blurb: "Combine what you find",
    lookFor: "something with parts you can count and put together",
    accent: "#c8ff4d",
  },
  {
    id: "subtraction",
    label: "Subtraction",
    symbol: "−",
    blurb: "Find what's missing",
    lookFor: "something partly used, empty, or missing a few pieces",
    accent: "#57e2ff",
  },
  {
    id: "multiplication",
    label: "Multiplication",
    symbol: "×",
    blurb: "Spot repeating groups",
    lookFor: "rows, stacks, or repeated sections",
    accent: "#ff7a5a",
  },
  {
    id: "division",
    label: "Division",
    symbol: "÷",
    blurb: "Share it out evenly",
    lookFor: "something with a measurement printed on it, or parts to split",
    accent: "#ffc94d",
  },
  {
    id: "fractions",
    label: "Fractions",
    symbol: "½",
    blurb: "Break it into equal parts",
    lookFor: "something divided into equal slices, sections, or segments",
    accent: "#c79bff",
  },
  {
    id: "measurement",
    label: "Measurement",
    symbol: "⇥",
    blurb: "Read the real numbers",
    lookFor: "a label with ounces, grams, litres, inches, or minutes on it",
    accent: "#6bf0c0",
  },
  {
    id: "geometry",
    label: "Geometry",
    symbol: "△",
    blurb: "Hunt for shapes and angles",
    lookFor: "clear edges, corners, circles, or tiled patterns",
    accent: "#ff8fd4",
  },
];

const SKILLS_BY_ID = new Map<SkillId, Skill>(
  SKILLS.map((skill) => [skill.id, skill]),
);

export function getSkill(id: SkillId): Skill {
  const skill = SKILLS_BY_ID.get(id);
  if (!skill) {
    throw new Error(`Unknown skill: ${id}`);
  }
  return skill;
}

export const GRADE_BLURBS: Record<Grade, string> = {
  3: "Groups, sharing, and shapes",
  4: "Bigger numbers and fractions",
  5: "Decimals, volume, and area",
};
