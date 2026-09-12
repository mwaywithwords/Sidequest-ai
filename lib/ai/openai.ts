import "server-only";

import OpenAI from "openai";
import { openaiApiKey } from "@/lib/env.server";

/**
 * The one OpenAI client, and the only place the key is handed to anything.
 *
 * `server-only` is the enforcement: pulling any part of the AI pipeline into a
 * Client Component's module graph fails the build rather than shipping a
 * billable key to the browser.
 */

/**
 * How long a single call may take before it is abandoned.
 *
 * The safety gate sits inside the upload request, so a model that stops
 * answering has to become an error quickly. Timing out is a refusal to
 * continue, which is the behaviour we want anyway.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * One retry, not the SDK's default of two. A student is waiting behind a
 * spinner, and a second failure is better spent telling them than retrying.
 */
const MAX_RETRIES = 1;

let client: OpenAI | null = null;

/**
 * Built on first use rather than on import, so a page that never calls a model
 * does not fail to render because the key is missing from the environment.
 */
export function openai(): OpenAI {
  client ??= new OpenAI({
    apiKey: openaiApiKey(),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });

  return client;
}
