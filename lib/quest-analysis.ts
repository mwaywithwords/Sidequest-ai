import "server-only";

import { imageDataUrl } from "@/lib/ai/image-input";
import {
  analyzeObject,
  type ObjectAnalysisResult,
} from "@/lib/ai/object-analysis";
import { setQuestStatus } from "@/lib/quest-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { QUEST_IMAGE_BUCKET } from "@/lib/supabase/storage";

/**
 * The object analysis stage, run against a stored quest.
 *
 * Takes a quest id and nothing else, so the stage can be driven from anywhere
 * that knows a quest exists — the upload handler today, a queue worker later.
 * It fetches the photograph itself, hands it to the model, and records the
 * result.
 *
 * The only thing it writes on success is the validated reading. On failure it
 * writes the fact of the failure and no metadata at all, because a half-read
 * object is exactly the input that would make the next stage invent numbers.
 */

/**
 * Analyses the photograph attached to `questId`.
 *
 * Throws when the quest or its image cannot be reached at all. That leaves the
 * row 'pending' on purpose: nothing was learned about the photo, so it is still
 * work waiting to happen rather than work that came to nothing.
 */
export async function analyzeQuestObject(
  questId: string,
): Promise<ObjectAnalysisResult> {
  const supabase = createAdminClient();

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("image_path")
    .eq("id", questId)
    .single();

  if (questError !== null || quest?.image_path == null) {
    throw new Error(
      `No image for quest ${questId}: ${questError?.message ?? "no image_path"}`,
    );
  }

  // Downloaded through the secret key, server-side. The bucket stays private and
  // no URL is minted: the bytes go straight from storage into the request to the
  // model, and are never logged, returned, or written to Postgres.
  const { data: image, error: downloadError } = await supabase.storage
    .from(QUEST_IMAGE_BUCKET)
    .download(quest.image_path);

  if (downloadError !== null || image === null) {
    throw new Error(
      `Could not download the image for quest ${questId}: ${downloadError?.message ?? "no data"}`,
    );
  }

  const result = await analyzeObject(await imageDataUrl(image));

  if (result.status === "failed") {
    // An unreadable object is 'rejected' — a photo we read and found nothing
    // usable in — while a stage that misbehaved is 'failed'. See
    // lib/quest-status.ts for why the two are worth keeping apart.
    await setQuestStatus(
      questId,
      result.failure.reason === "generation_failure" ? "failed" : "rejected",
    );

    return result;
  }

  // Structured JSON, already through ObjectAnalysisSchema. `image_path` is not
  // in the update, and neither is `status`: the pipeline is not finished, and it
  // is the stage that produces a challenge that makes a quest 'ready'.
  const { error: updateError } = await supabase
    .from("quests")
    .update({
      object_metadata: result.analysis,
      identified_object: result.analysis.objectName,
    })
    .eq("id", questId);

  if (updateError) {
    throw new Error(
      `Could not store the reading for quest ${questId}: ${updateError.message}`,
    );
  }

  return result;
}
