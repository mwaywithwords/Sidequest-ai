/**
 * Quest status-transition checks.
 *
 * Run with: npx tsx lib/quest-status.check.ts
 */

import { canTransition, QUEST_STATUSES } from "@/lib/quest-status-rules";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

check("pending may become ready", canTransition("pending", "ready"));
check("processing may become ready", canTransition("processing", "ready"));
check("pending may become rejected", canTransition("pending", "rejected"));
check("pending may become failed", canTransition("pending", "failed"));
check("ready cannot become failed", !canTransition("ready", "failed"));
check("ready cannot become rejected", !canTransition("ready", "rejected"));
check("ready cannot become pending", !canTransition("ready", "pending"));
check("rejected cannot become ready", !canTransition("rejected", "ready"));
check("failed cannot become ready", !canTransition("failed", "ready"));
check("rejected cannot become failed", !canTransition("rejected", "failed"));
check("failed cannot become rejected", !canTransition("failed", "rejected"));
check("ready is idempotent", canTransition("ready", "ready"));
check("rejected is idempotent", canTransition("rejected", "rejected"));
check("failed is idempotent", canTransition("failed", "failed"));

for (const status of QUEST_STATUSES) {
  check(`${status} may stay ${status}`, canTransition(status, status));
}

if (failed > 0) {
  console.error(`\n${failed} quest-status checks failed`);
  process.exit(1);
}

console.log("\nall quest-status checks passed");
