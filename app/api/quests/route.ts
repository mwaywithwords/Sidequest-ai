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
import { createAdminClient } from "@/lib/supabase/admin";
import { QUEST_IMAGE_BUCKET, questImagePath } from "@/lib/supabase/storage";
import { parseGrade, parseSkillId } from "@/lib/types";

/**
 * Two model calls now sit inside this request, so it needs longer than a
 * platform's default ten seconds. A hung call is bounded by the client timeout
 * in lib/ai/openai.ts well before this.
 */
export const maxDuration = 30;

/**
 * Creates a quest from a photograph: screens the image, stores it in the
 * private bucket, and records the row that points at it.
 *
 * This is the trusted half of the upload. The browser never holds the secret
 * key, and never gets to choose the profile, the quest id, or the storage
 * path. Everything it does send is validated again here, because a request can
 * reach this handler without having gone through the UI at all.
 *
 * The safety gate runs here for the same reason: it is the first point every
 * photo must pass through, and the last point before the photo becomes
 * something the product keeps.
 *
 * Nothing is analysed yet — a screened photo's row lands as 'pending' and the
 * AI pipeline picks it up later.
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

      return NextResponse.json(
        {
          error: "unsafe",
          reason: safety.reason,
          message: safety.messageForStudent,
        },
        { status: 422 },
      );
    }

    const supabase = createAdminClient();

    // Ordered so the cheap failures happen before the expensive upload.
    const profileId = await getOrCreateProfileId(grade);

    const { data: skill, error: skillError } = await supabase
      .from("skills")
      .select("id")
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

    return NextResponse.json({ questId }, { status: 201 });
  } catch (error) {
    // Logged in full, reported vaguely: the student gets something retryable
    // and the internals stay on the server.
    console.error("[POST /api/quests]", error);

    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
