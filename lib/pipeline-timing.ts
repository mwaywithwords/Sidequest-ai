/**
 * Server-side stage timings for quest creation.
 *
 * Logged as millisecond totals only. Never sent to the student, and never
 * attached to an image, a signed URL, an answer, or a secret.
 */

export type PipelineTimings = {
  moderation_ms: number;
  vision_ms: number;
  generation_ms: number;
  verification_ms: number;
  database_ms: number;
  total_ms: number;
};

export type PipelineTimer = {
  measure<T>(
    stage: "moderation" | "vision" | "generation" | "verification",
    fn: () => Promise<T>,
  ): Promise<T>;
  measureDb<T>(fn: () => Promise<T>): Promise<T>;
  snapshot(): PipelineTimings;
  log(): void;
};

export function createPipelineTimer(): PipelineTimer {
  const started = Date.now();
  const marks: Partial<
    Record<"moderation" | "vision" | "generation" | "verification", number>
  > = {};
  let databaseMs = 0;

  return {
    async measure(stage, fn) {
      const t0 = Date.now();
      try {
        return await fn();
      } finally {
        marks[stage] = Date.now() - t0;
      }
    },
    async measureDb(fn) {
      const t0 = Date.now();
      try {
        return await fn();
      } finally {
        databaseMs += Date.now() - t0;
      }
    },
    snapshot() {
      return {
        moderation_ms: marks.moderation ?? 0,
        vision_ms: marks.vision ?? 0,
        generation_ms: marks.generation ?? 0,
        verification_ms: marks.verification ?? 0,
        database_ms: databaseMs,
        total_ms: Date.now() - started,
      };
    },
    log() {
      console.info("[quest-pipeline]", this.snapshot());
    },
  };
}
