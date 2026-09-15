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

const EMPTY_HUD_XP_VIEW: HudXpView = { amount: 0, celebrate: false };

const listeners = new Set<() => void>();
let view: HudXpView = EMPTY_HUD_XP_VIEW;

export function readHudXpView(): HudXpView {
  return view;
}

export function getServerHudXpView(): HudXpView {
  return EMPTY_HUD_XP_VIEW;
}

export function setHudXpView(next: HudXpView): void {
  const amount =
    Number.isFinite(next.amount) && next.amount > 0
      ? Math.floor(next.amount)
      : 0;
  const celebrate = amount > 0 && next.celebrate === true;
  if (view.amount === amount && view.celebrate === celebrate) return;
  view =
    amount === 0 && celebrate === false
      ? EMPTY_HUD_XP_VIEW
      : { amount, celebrate };
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
