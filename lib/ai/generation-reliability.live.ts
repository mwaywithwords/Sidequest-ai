/**
 * Optional live generation check.
 *
 * Run with: npx tsx lib/ai/generation-reliability.live.ts
 *
 * Skips when OPENAI_API_KEY is absent. Repeats protein-bottle subtraction
 * and wallet geometry so intermittent model failures are visible.
 */

import { readFileSync } from "node:fs";
import { generateQuest } from "@/lib/ai/quest-generation";
import type { ObjectAnalysis } from "@/lib/ai/schemas";
import type { SkillId } from "@/lib/types";

function loadLocalKey(): string | null {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }

  try {
    const match = readFileSync(".env.local", "utf8").match(
      /^OPENAI_API_KEY=(.*)$/m,
    );
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, "");
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

const bottle: ObjectAnalysis = {
  objectName: "protein shake bottle",
  category: "packaged beverage",
  brand: "Premier Protein",
  confidence: 0.92,
  visibleText: ["Premier Protein", "11 FL OZ"],
  visibleMeasurements: [
    { value: 11, unit: "fl oz", label: "printed bottle volume" },
  ],
  countableProperties: [],
  shapeProperties: ["rectangular carton with a screw cap"],
  observableProperties: ["purple plastic cap"],
};

const wallet: ObjectAnalysis = {
  objectName: "wallet",
  category: "personal accessory",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["rectangular form", "symmetry"],
  observableProperties: ["card slots", "billfold"],
};

async function runOnce(
  name: string,
  analysis: ObjectAnalysis,
  skillId: SkillId,
) {
  const started = Date.now();
  const result = await generateQuest({
    analysis,
    skillId,
    skillDescription: null,
    grade: 4,
  });
  const timing_ms = Date.now() - started;

  console.log("[live-generation]", {
    name,
    status: result.status,
    challengeMode:
      result.status === "ok" ||
      result.status === "poorFit" ||
      result.status === "needsEvidence"
        ? result.fit.challengeMode
        : undefined,
    computationType:
      result.status === "ok" ? result.challenge.computation.type : undefined,
    timing_ms,
  });

  return result.status === "ok";
}

async function main() {
  const key = loadLocalKey();
  if (key === null) {
    console.log("skip live generation checks (no OPENAI_API_KEY)");
    return;
  }

  process.env.OPENAI_API_KEY = key;

  const runs = [
    ["protein bottle + subtraction A", bottle, "subtraction"],
    ["protein bottle + subtraction B", bottle, "subtraction"],
    ["wallet + geometry A", wallet, "geometry"],
    ["wallet + geometry B", wallet, "geometry"],
  ] as const;

  let passed = 0;
  for (const [name, analysis, skillId] of runs) {
    const ok = await runOnce(name, analysis, skillId);
    if (ok) passed += 1;
  }

  console.log(`[live-generation] ${passed}/${runs.length} ready quests`);
  if (passed < runs.length) process.exit(1);
}

void main();
