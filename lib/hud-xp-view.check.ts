/**
 * HUD XP snapshot checks.
 *
 * Run with: npx tsx lib/hud-xp-view.check.ts
 *
 * These do not paint the DOM. They confirm useSyncExternalStore snapshots
 * stay referentially stable until the HUD XP state actually changes.
 */

import {
  getServerHudXpView,
  readHudXpView,
  resetHudXpView,
  setHudXpView,
  subscribeHudXpView,
} from "@/lib/hud-xp-view";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

resetHudXpView();

check(
  "server snapshot is the empty HUD view",
  getServerHudXpView().amount === 0 && getServerHudXpView().celebrate === false,
);

check(
  "server snapshot is cached",
  getServerHudXpView() === getServerHudXpView(),
);

check(
  "initial client snapshot matches the cached server snapshot",
  readHudXpView() === getServerHudXpView(),
);

const initial = readHudXpView();
check(
  "unchanged store reads return the same snapshot",
  readHudXpView() === initial && readHudXpView() === readHudXpView(),
);

let notifications = 0;
const unsubscribe = subscribeHudXpView(() => {
  notifications += 1;
});

setHudXpView({ amount: 0, celebrate: false });
check(
  "identical empty write does not publish a new snapshot",
  readHudXpView() === initial && notifications === 0,
);

setHudXpView({ amount: 10, celebrate: false });
const afterAmount = readHudXpView();
check(
  "XP update publishes a new snapshot",
  afterAmount !== initial &&
    afterAmount.amount === 10 &&
    afterAmount.celebrate === false &&
    notifications === 1,
);

check(
  "reread after XP update keeps the same snapshot",
  readHudXpView() === afterAmount,
);

setHudXpView({ amount: 10, celebrate: false });
check(
  "identical XP write does not publish a new snapshot",
  readHudXpView() === afterAmount && notifications === 1,
);

setHudXpView({ amount: 10, celebrate: true });
const afterCelebrate = readHudXpView();
check(
  "celebration update publishes a new snapshot",
  afterCelebrate !== afterAmount &&
    afterCelebrate.amount === 10 &&
    afterCelebrate.celebrate === true &&
    notifications === 2,
);

setHudXpView({ amount: 10, celebrate: true });
check(
  "identical celebration write does not publish a new snapshot",
  readHudXpView() === afterCelebrate && notifications === 2,
);

check(
  "server snapshot stays the cached empty object after client updates",
  getServerHudXpView() === initial && getServerHudXpView().amount === 0,
);

resetHudXpView();
check(
  "reset restores the cached empty snapshot",
  readHudXpView() === getServerHudXpView() &&
    readHudXpView().amount === 0 &&
    readHudXpView().celebrate === false &&
    notifications === 3,
);

unsubscribe();
resetHudXpView();

if (failed > 0) {
  console.error(`\n${failed} hud-xp-view checks failed`);
  process.exit(1);
}

console.log("\nall hud-xp-view checks passed");
