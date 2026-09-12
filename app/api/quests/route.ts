import { NextResponse } from "next/server";
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
 * Creates a quest from a photograph: stores the image in the private bucket
 * and records the row that points at it.
 *
 * This is the trusted half of the upload. The browser never holds the secret
 * key, and never gets to choose the profile, the quest id, or the storage
 * path. Everything it does send is validated again here, because a request can
 * reach this handler without having gone through the UI at all.
 *
 * Nothing is processed yet — the row lands as 'pending' and the AI pipeline
 * picks it up later.
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

  try {
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
