// Saree3's guided walkthrough: the screen dims, one real element lights up, Saree3 says one line next to it, with
// "Show me how" (a short live demo) / Next / Skip. Screens mark their elements with <TourTarget id> and start their
// steps once (useWalkthrough); the overlay (Walkthrough.tsx, mounted in app/_layout.tsx) draws the current step.
import { useSyncExternalStore } from 'react';
import type { View } from 'react-native';

export type Demo = 'say' | 'tick' | 'add' | 'approve';
/** one step: the element to light up, its text key (walk strings: <key>Title / <key>Body), an optional demo */
export type WalkStep = { target: string; key: string; demo?: Demo };
type Run = { screen: string; steps: WalkStep[]; at: number; onEnd: (finished: boolean) => void };

const targets = new Map<string, View>();
let run: Run | null = null;
/** the last screen that offered a walkthrough, so "Teach me this page" can replay it */
let offered: { screen: string; steps: WalkStep[] } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const walkthrough = {
  setTarget(id: string, v: View | null) {
    if (v) targets.set(id, v);
    else targets.delete(id);
  },
  target: (id: string) => targets.get(id),
  offer(screen: string, steps: WalkStep[]) {
    offered = { screen, steps };
  },
  start(screen: string, steps: WalkStep[], onEnd: (finished: boolean) => void = () => {}) {
    // only the steps whose element is on screen right now
    const live = steps.filter((s) => targets.has(s.target));
    if (!live.length) return false;
    run = { screen, steps: live, at: 0, onEnd };
    emit();
    return true;
  },
  /** Saree3 → "Teach me this page" */
  replay() {
    return offered ? walkthrough.start(offered.screen, offered.steps) : false;
  },
  canReplay: () => !!offered,
  next() {
    if (!run) return;
    if (run.at + 1 >= run.steps.length) return walkthrough.end(true);
    run = { ...run, at: run.at + 1 };
    emit();
  },
  end(finished: boolean) {
    const r = run;
    run = null;
    emit();
    r?.onEnd(finished);
  },
  current: () => run,
};

export function useWalkRun() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => run,
  );
}
