"use client";

import { useSyncExternalStore } from "react";
import { BoltIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import {
  readHudXpView,
  subscribeHudXpView,
} from "@/lib/hud-xp-view";

function serverHudXp() {
  return { amount: 0, celebrate: false };
}

export function HudXpChip() {
  const { amount, celebrate } = useSyncExternalStore(
    subscribeHudXpView,
    readHudXpView,
    serverHudXp,
  );

  if (amount <= 0) return null;

  return (
    <span
      aria-hidden
      data-hud-xp=""
      className={cn("hud-xp", celebrate && "is-celebrating")}
    >
      <BoltIcon className="size-4" />
      <span>{amount}</span>
    </span>
  );
}
