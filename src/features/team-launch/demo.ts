// Demo data for Screen 31 · Bring your team in (no invites backend yet). 10 pts = SAR 1.
export const TEAM_SIZE = 8;
export const JOINED_BASE = 5;
export const ALL_IN_PTS = 200;
export const PTS_PER_SAR = 10;
export const INVITE_LINK = 'muntej.app/join/ahmed';

/** People invited but not joined yet (ids from src/features/demo/team.ts). */
export const MISSING = ['khalid', 'noura', 'saad'] as const;
export type MissingId = (typeof MISSING)[number];
