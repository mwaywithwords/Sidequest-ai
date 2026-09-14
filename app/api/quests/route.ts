import { NextResponse } from "next/server";
import { MODEL_READABLE_IMAGE_TYPES } from "@/lib/ai/image-safety";
import { inspectUploadedImage } from "@/lib/image-capture";
import { createQuest } from "@/lib/quest-create";
import { toClientCreateBody } from "@/lib/quest-pipeline";
import { createQuestLogger, createQuestTraceId } from "@/lib/quest-trace";
import { parseMission } from "@/lib/skill-catalogue";

/**
 * Happy path is three model calls: moderation, vision, and combined
 * quest generation. A fourth challenge-only call happens only when the
 * first challenge candidate is rejected. Each call is bounded by the
 * client timeout in lib/ai/openai.ts well before this.
 *
 * Node.js runtime is required so console.info/warn/error are written to
 * stdout/stderr and captured as Vercel Function Logs. Edge would hide
 * the structured trace this route exists to emit.
 */
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Creates a quest from a photograph, in the order the pipeline requires:
 * validate the mission, resolve the skill row, moderate the file, run
 * combined vision analysis, store it, generate the educational quest, then
 * verify the candidate deterministically.
 *
 * This is the trusted half of the upload. The browser never holds the secret
 * key, and never gets to choose the profile, the quest id, or the storage
 * path. Everything it does send is validated again here, because a request can
 * reach this handler without having gone through the UI at all.
 *
 * Only verification may mark a quest ready. The response still does not
 * include the question or the answer.
 */
export async function POST(request: Request) {
  const questTraceId = createQuestTraceId();
  const logger = createQuestLogger(questTraceId);

  logger.stage({ stage: "mission_validation", status: "started" });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    logger.stage({
      stage: "mission_validation",
      status: "failed",
      failureCode: "missing",
    });
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const mission = parseMission(form.get("grade"), form.get("skill"));
  if (mission === null) {
    logger.stage({
      stage: "mission_validation",
      status: "failed",
      failureCode: "badMission",
    });
    return NextResponse.json({ error: "badMission" }, { status: 400 });
  }
  const { grade, skillCode: skillId } = mission;

  const image = form.get("image");
  const incoming = image instanceof File ? image : null;

  const inspected = await inspectUploadedImage(incoming);
  if (!inspected.ok) {
    logger.stage({
      stage: "mission_validation",
      status: "failed",
      failureCode: inspected.reason,
      grade,
      skill: skillId,
    });
    return NextResponse.json({ error: inspected.reason }, { status: 400 });
  }

  const file = inspected.file;

  if (!MODEL_READABLE_IMAGE_TYPES.includes(file.type)) {
    logger.stage({
      stage: "mission_validation",
      status: "failed",
      failureCode: "unsupported",
      grade,
      skill: skillId,
    });
    return NextResponse.json({ error: "unsupported" }, { status: 400 });
  }

  logger.stage({
    stage: "mission_validation",
    status: "passed",
    grade,
    skill: skillId,
  });

  try {
    const result = await createQuest({
      file,
      extension: inspected.extension,
      grade,
      skillId,
      logger,
    });

    if (result.kind === "failed" || result.kind === "generationFailed") {
      return NextResponse.json(toClientCreateBody(result), { status: 500 });
    }

    if (result.kind === "refused") {
      return NextResponse.json(toClientCreateBody(result), { status: 422 });
    }

    return NextResponse.json(toClientCreateBody(result), { status: 201 });
  } catch (error) {
    logger.generationFailed({
      grade,
      skill: skillId,
      candidate1FailureStage: "persistence_failure",
      candidate1FailureCode: "unhandled_exception",
    });
    void error;
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
