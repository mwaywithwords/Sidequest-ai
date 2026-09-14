/**
 * Header XP chip display.
 *
 * Mirrors the quest's authoritative awarded XP so the HUD can pulse.
 * It does not calculate, persist, or invent a second total.
 */

export type HudXpView = {
  amount: number;
  celebrate: boolean;
};

const listeners = new Set<() => void>();
let view: HudXpView = { amount: 0, celebrate: false };

export function readHudXpView(): HudXpView {
  return view;
}

export function setHudXpView(next: HudXpView): void {
  const amount =
    Number.isFinite(next.amount) && next.amount > 0
      ? Math.floor(next.amount)
      : 0;
  const celebrate = amount > 0 && next.celebrate === true;
  if (view.amount === amount && view.celebrate === celebrate) return;
  view = { amount, celebrate };
  for (const listener of listeners) listener();
}

export function subscribeHudXpView(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function resetHudXpView(): void {
  setHudXpView({ amount: 0, celebrate: false });
}
