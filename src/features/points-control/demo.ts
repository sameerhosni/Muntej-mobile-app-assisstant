// Demo data for Screen 27 · Points control (no points backend yet). 10 pts = SAR 1.
import type { ColorToken } from '@/theme/tokens';

export const PTS_PER_SAR = 10;

export const BUDGET = { used: 12_800, total: 20_000, onTimeHours: 25 };

export type RuleId = 'ontime' | 'early' | 'proof' | 'star' | 'help';

export const RULES: { id: RuleId; pts: number; on: boolean; bg: ColorToken; fg: ColorToken }[] = [
  { id: 'ontime', pts: 50, on: true, bg: 'primaryTint', fg: 'primary' },
  { id: 'early', pts: 20, on: true, bg: 'purpleTint', fg: 'purple' },
  { id: 'proof', pts: 15, on: true, bg: 'greenTint', fg: 'green' },
  { id: 'star', pts: 30, on: true, bg: 'amberTint', fg: 'amberText' },
  { id: 'help', pts: 25, on: true, bg: 'redTint', fg: 'red' },
];

export const PTS_STEP = 5;
export const PTS_MIN = 5;
export const PTS_MAX = 200;

export type RequestId = 'early' | 'coffee';

export const REQUESTS: { id: RequestId; personId: string; cost: number }[] = [
  { id: 'early', personId: 'noura', cost: 800 },
  { id: 'coffee', personId: 'saad', cost: 300 },
];

/** Fairness check: someone doing the work but getting no recognition. */
export const FAIRNESS = { personId: 'khalid', tasksDone: 6 };
