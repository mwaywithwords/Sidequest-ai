import { NextResponse } from "next/server";
import {
  MODEL_READABLE_IMAGE_TYPES,
  screenImage,
} from "@/lib/ai/image-safety";
import {
  imageExtension,
  MAX_UPLOAD_BYTES,
  validateImageFile,
} from "@/lib/image-capture";
import { getOrCreateProfileId } from "@/lib/profile";
import { analyzeQuestObject } from "@/lib/quest-analysis";
import { assessQuestSkillFit } from "@/lib/quest-fit";
import { createAdminClient } from "@/lib/supabase/admin";
import { QUEST_IMAGE_BUCKET, questImagePath } from "@/lib/supabase/storage";
import {
  detourKindFromReason,
  sanitiseSuggestions,
} from "@/lib/detour";
import { parseGrade, parseSkillId } from "@/lib/types";

/**
 * Four model calls now sit inside this request, one of them reading small print,
 * so it needs longer than a platform's default ten seconds. Each call is bounded
 * by the client timeout in lib/ai/openai.ts well before this.
 */
export const maxDuration = 60;

/**
 * Creates a quest from a photograph, in the order the pipeline requires:
 * validate the file, screen it for safety and suitability, store it in the
 * private bucket, record the row that points at it, read the object in it, then
 * judge whether that object suits the mission the student chose.
 *
 * This is the trusted half of the upload. The browser never holds the secret
 * key, and never gets to choose the profile, the quest id, or the storage
 * path. Everything it does send is validated again here, because a request can
 * reach this handler without having gone through the UI at all.
 *
 * The stages run here for the same reason: this is the one point every photo
 * must pass through, and each stage is a gate the next one depends on. Nothing
 * is generated yet — a quest that gets this far stays 'pending' until challenge
 * generation exists to finish it.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  // The mission is re-parsed against the same tuples the UI uses, so an
  // unknown grade or skill cannot reach the database.
  const grade = parseGrade(form.get("grade"));
  const skillId = parseSkillId(form.get("skill"));
  if (grade === null || skillId === null) {
    return NextResponse.json({ error: "badMission" }, { status: 400 });
  }

  const image = form.get("image");
  const file = image instanceof File ? image : null;

  // Still the trust boundary. The browser normalises to well under this, but
  // this handler has no way to know a request came from the browser at all,
  // and the budget is what keeps a body inside the platform's own limit.
  const problem = validateImageFile(file, MAX_UPLOAD_BYTES);
  if (problem !== null || file === null) {
    return NextResponse.json({ error: problem ?? "missing" }, { status: 400 });
  }

  const extension = imageExtension(file.type);
  if (extension === null) {
    return NextResponse.json({ error: "unsupported" }, { status: 400 });
  }

  // A format the safety gate cannot read is a photo we cannot screen, so it
  // gets the same answer as a file that was never a readable photo.
  if (!MODEL_READABLE_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "unsupported" }, { status: 400 });
  }

  try {
    // Before the profile, the bucket, and the row: a photo that does not pass
    // leaves nothing behind, and nothing downstream ever sees it. Screening
    // throws if it could not reach a verdict, which lands in the catch below
    // as a retryable failure rather than as permission to continue.
    const safety = await screenImage(file);

    if (!safety.allowed) {
      // The normalised reason, for the log and for the client to carry; the
      // categories and scores behind it stayed inside lib/ai.
      console.warn("[POST /api/quests] image refused", safety.reason);

      return refused(safety.reason);
    }

    const supabase = createAdminClient();

    // Ordered so the cheap failures happen before the expensive upload.
    const profileId = await getOrCreateProfileId(grade);

    // `description` is the grade's own wording for the skill, which the seed
    // migration keeps as prompt material: it is what tells the skill-fit stage
    // how much a grade-3 division problem is allowed to ask for.
    const { data: skill, error: skillError } = await supabase
      .from("skills")
      .select("id, description")
      .eq("grade_level", grade)
      .eq("skill_code", skillId)
      .single();

    if (skillError !== null || skill === null) {
      throw new Error(
        `No skill row for grade ${grade} / ${skillId}: ${skillError?.message ?? "not found"}`,
      );
    }

    const questId = crypto.randomUUID();
    const path = questImagePath(profileId, questId, extension);

    const { error: uploadError } = await supabase.storage
      .from(QUEST_IMAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        // The path contains a fresh uuid, so a collision would mean something
        // is wrong rather than something to overwrite.
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { error: insertError } = await supabase.from("quests").insert({
      id: questId,
      profile_id: profileId,
      selected_skill_id: skill.id,
      image_path: path,
      status: "pending",
    });

    if (insertError) {
      // Don't leave an object behind that no row points at. The client retries
      // with a fresh quest id, so this path cannot be resumed anyway.
      await supabase.storage.from(QUEST_IMAGE_BUCKET).remove([path]);
      throw new Error(`Quest insert failed: ${insertError.message}`);
    }

    // Last, because it needs both halves of what came before: a photo that
    // passed the gate, and a row to hang the reading on.
    const reading = await analyzeQuestObject(questId);

    if (reading.status === "failed") {
      // The quest row stays, marked with what happened. The student gets the
      // sentence and a new photo to take; nothing downstream can pick this
      // quest up as something to teach from.
      console.warn("[POST /api/quests] no reading", reading.failure.reason);

      return refused(reading.failure.reason);
    }

    // Then whether that reading supports the mission the student picked. The
    // analysis is passed straight through: it has already been validated in this
    // request, and this stage is not allowed to learn anything new about the
    // object.
    const fit = await assessQuestSkillFit({
      questId,
      analysis: reading.analysis,
      grade,
      skillId,
      skillDescription: skill.description,
    });

    if (fit.status !== "ok") {
      // A poor fit and a broken stage are both refusals here, and both leave the
      // quest marked so nothing downstream treats it as teachable. Which of the
      // two it was is in the reason, and in the row.
      console.warn("[POST /api/quests] no challenge", fit.failure.reason);

      return refused(fit.failure.reason, {
        suggestions:
          fit.status === "poorFit"
            ? fit.fit.suggestedObjectCharacteristics
            : [],
        offerSkillChange:
          fit.status === "poorFit" && fit.fit.alternativeSkillCodes.length > 0,
      });
    }

    return NextResponse.json({ questId }, { status: 201 });
  } catch (error) {
    // Logged in full, reported vaguely: the student gets something retryable
    // and the internals stay on the server.
    console.error("[POST /api/quests]", error);

    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/**
 * The one shape a stage uses to turn a photo away.
 *
 * The internal reason is mapped to a student-safe kind here, so the browser
 * never sees a moderation category or a pipeline code. Suggestions and the
 * skill-change offer are optional extras for poor fit; everything else the
 * student reads is assembled from centralized copy on the client.
 */
function refused(
  reason: string,
  extras?: { suggestions?: readonly string[]; offerSkillChange?: boolean },
) {
  return NextResponse.json(
    {
      error: "refused",
      kind: detourKindFromReason(reason),
      suggestions: sanitiseSuggestions(extras?.suggestions ?? []),
      offerSkillChange: extras?.offerSkillChange === true,
    },
    { status: 422 },
  );
}
