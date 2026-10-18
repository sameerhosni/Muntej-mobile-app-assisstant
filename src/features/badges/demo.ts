// Demo levels & badges (design/v2/html/Badges.dc.html). No gamification backend yet.
// Level and XP come from the shared demo wallet (src/features/rewards/wallet.ts) so Employee Home matches.
import type { ColorToken } from '@/theme/tokens';

export type LevelState = 'done' | 'now' | 'next';

/** Level bands; `key` is the strings key for the name, `range` the level numbers shown in the circle. */
export const LEVEL_BANDS: { key: string; range: string; from: number; to: number }[] = [
  { key: 'l_starter', range: '1–3', from: 1, to: 3 },
  { key: 'l_achiever', range: '4–6', from: 4, to: 6 },
  { key: 'l_pro', range: '7', from: 7, to: 7 },
  { key: 'l_expert', range: '8–9', from: 8, to: 9 },
  { key: 'l_legend', range: '10', from: 10, to: 10 },
];

export function bandState(band: { from: number; to: number }, level: number): LevelState {
  if (level > band.to) return 'done';
  if (level >= band.from) return 'now';
  return 'next';
}

export type BadgeTone = 'green' | 'blue' | 'coral' | 'purple' | 'orange';

/** Hexagon gradient (light → dark), the tinted abbreviation color and the chip tint for each tone. */
export const TONES: Record<BadgeTone, { color: ColorToken; dark: ColorToken; tint: ColorToken }> = {
  green: { color: 'greenLight', dark: 'green', tint: 'greenTint' },
  blue: { color: 'primaryLight', dark: 'primary', tint: 'primaryTint' },
  coral: { color: 'orange', dark: 'red', tint: 'redTint' },
  purple: { color: 'purpleLight', dark: 'purple', tint: 'purpleTint' },
  orange: { color: 'gold', dark: 'orangeText', tint: 'orangeTint' },
};

export type BadgeId = 'eb' | 'pm' | 'st' | 'cc' | 'tp' | 'fs' | 'zc' | 'rh' | 'mn';

export type Badge = { id: BadgeId; tone: BadgeTone; got: boolean; progress: number; pts: number };

export const BADGES: Badge[] = [
  { id: 'eb', tone: 'green', got: true, progress: 1, pts: 100 },
  { id: 'pm', tone: 'blue', got: true, progress: 1, pts: 100 },
  { id: 'st', tone: 'coral', got: true, progress: 1, pts: 150 },
  { id: 'cc', tone: 'purple', got: true, progress: 1, pts: 80 },
  { id: 'tp', tone: 'orange', got: true, progress: 1, pts: 120 },
  { id: 'fs', tone: 'orange', got: true, progress: 1, pts: 150 },
  { id: 'zc', tone: 'green', got: false, progress: 19 / 22, pts: 300 },
  { id: 'rh', tone: 'purple', got: false, progress: 0.4, pts: 200 },
  { id: 'mn', tone: 'blue', got: false, progress: 0.3, pts: 250 },
];

/** The badge selected when the screen opens (the closest one to unlocking). */
export const DEFAULT_BADGE: BadgeId = 'zc';

/** Reliability stats from the design (demo). */
export const RELIABILITY = { overtimeHours: 0, onTimePct: 96, reminders: 0 };
