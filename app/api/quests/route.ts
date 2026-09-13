import { NextResponse } from "next/server";
import { MODEL_READABLE_IMAGE_TYPES } from "@/lib/ai/image-safety";
import { inspectUploadedImage } from "@/lib/image-capture";
import { createQuest } from "@/lib/quest-create";
import { toClientCreateBody } from "@/lib/quest-pipeline";
import { parseGrade, parseSkillId } from "@/lib/types";

/**
 * Up to four model calls now sit inside this request — moderation, combined
 * vision, combined quest generation, and one controlled regeneration if the
 * first candidate fails verification. Each call is bounded by the client
 * timeout in lib/ai/openai.ts well before this.
 */
export const maxDuration = 300;

/**
 * Creates a quest from a photograph, in the order the pipeline requires:
 * validate the file, moderate it, run combined vision analysis, store it,
 * generate the educational quest, then verify the candidate deterministically.
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const grade = parseGrade(form.get("grade"));
  const skillId = parseSkillId(form.get("skill"));
  if (grade === null || skillId === null) {
    return NextResponse.json({ error: "badMission" }, { status: 400 });
  }

  const image = form.get("image");
  const incoming = image instanceof File ? image : null;

  const inspected = await inspectUploadedImage(incoming);
  if (!inspected.ok) {
    return NextResponse.json({ error: inspected.reason }, { status: 400 });
  }

  const file = inspected.file;

  if (!MODEL_READABLE_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "unsupported" }, { status: 400 });
  }

  try {
    const result = await createQuest({
      file,
      extension: inspected.extension,
      grade,
      skillId,
    });

    if (result.kind === "failed") {
      return NextResponse.json(toClientCreateBody(result), { status: 500 });
    }

    if (result.kind === "refused") {
      return NextResponse.json(toClientCreateBody(result), { status: 422 });
    }

    return NextResponse.json(toClientCreateBody(result), { status: 201 });
  } catch (error) {
    console.error("[POST /api/quests]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
