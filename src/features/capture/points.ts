// Points reward shown on the Capture review (design/v2/html/Capture.dc.html: "+65 pts · +20 if early").
// DEMO rule until the points engine is live (screen 27 · Points control will own these values).
export const POINTS_ON_TIME = 50;
export const POINTS_PROOF = 15;
export const POINTS_EARLY_BONUS = 20;

export function taskPointsReward() {
  return { total: POINTS_ON_TIME + POINTS_PROOF, early: POINTS_EARLY_BONUS };
}

/** m:ss, e.g. 0:09. */
export function formatClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
