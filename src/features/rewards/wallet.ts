// Demo points wallet shared by the employee screens (06 chat, 25 home, 26 rewards).
// Points, levels and rewards have no backend yet — this module-level store keeps the numbers
// consistent while you walk the prototype. 10 pts = SAR 1.
import { useSyncExternalStore } from 'react';

export const PTS_PER_SAR = 10;
/** Balance before anything happens today (Faisal, from the designs). */
export const BASE_BALANCE = 3480;
/** XP towards the next level before today's quests. */
export const BASE_XP = 1240;
export const LEVEL = 7;
export const NEXT_LEVEL_XP = 1500;

type State = {
  /** Points earned today, keyed by source (e.g. 'quest:b', 'chat'). Re-earning a source replaces it. */
  earned: Record<string, number>;
  spent: number;
  /** Reward ids already requested from the manager. */
  requested: Record<string, boolean>;
};

// Quest "Reply within 1 h" is already done when the day starts (design: done 09:12).
let state: State = { earned: { 'quest:a': 5 }, spent: 0, requested: {} };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export const wallet = {
  earn(source: string, pts: number) {
    set({ ...state, earned: { ...state.earned, [source]: pts } });
  },
  unearn(source: string) {
    const { [source]: _drop, ...rest } = state.earned;
    set({ ...state, earned: rest });
  },
  /** Returns false when the balance is too low or the reward was already requested. */
  redeem(id: string, cost: number) {
    if (state.requested[id] || balanceOf(state) < cost) return false;
    set({ ...state, spent: state.spent + cost, requested: { ...state.requested, [id]: true } });
    return true;
  },
};

function earnedOf(s: State) {
  return Object.values(s.earned).reduce((a, b) => a + b, 0);
}

function balanceOf(s: State) {
  return BASE_BALANCE + earnedOf(s) - s.spent;
}

export function useWallet() {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  const earnedToday = earnedOf(s);
  const balance = balanceOf(s);
  return {
    earned: s.earned,
    requested: s.requested,
    earnedToday,
    balance,
    sar: Math.floor(balance / PTS_PER_SAR),
    xp: BASE_XP + earnedToday,
  };
}
