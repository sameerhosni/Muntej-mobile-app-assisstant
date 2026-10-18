// Demo team quest + league data (design/v2/html/TeamQuests.dc.html). No backend for quests/leagues yet.
// The quest progress is shared with Employee Home (TEAM_QUEST in src/features/employee-home/demo.ts).
import type { ColorToken } from '@/theme/tokens';

export const QUEST_DAYS_LEFT = 3;
export const QUEST_BONUS_PTS = 100;
export const QUEST_REWARD_SAR = 600;
/** Teammates who contributed to the quest (ids from src/features/demo/team.ts). */
export const QUEST_HELPERS = ['faisal', 'abdullah', 'maha'];

export type LeagueRow = { key: 'sales' | 'ops' | 'marketing' | 'finance'; pts: number; trend: number; mine?: boolean };

export const LEAGUE: LeagueRow[] = [
  { key: 'sales', pts: 18420, trend: 12, mine: true },
  { key: 'ops', pts: 17960, trend: 4 },
  { key: 'marketing', pts: 15300, trend: -3 },
  { key: 'finance', pts: 12870, trend: 9 },
];

export type MeIcon = 'clock' | 'star' | 'eye' | 'bell';

/** "You vs. last week": bar lengths (0..1) for now/before and the change label. */
export type MeRow = { key: 'm_onTime' | 'm_points' | 'm_clarity' | 'm_reminders'; now: number; prev: number; delta: string; tint: ColorToken; ink: ColorToken; icon: MeIcon };

export const ME_ROWS: MeRow[] = [
  { key: 'm_onTime', now: 0.92, prev: 0.78, delta: '+14%', tint: 'primaryTint', ink: 'primary', icon: 'clock' },
  { key: 'm_points', now: 0.82, prev: 0.64, delta: '+120', tint: 'orangeTint', ink: 'orange', icon: 'star' },
  { key: 'm_clarity', now: 0.88, prev: 0.8, delta: '+8', tint: 'purpleTint', ink: 'purple', icon: 'eye' },
  { key: 'm_reminders', now: 0.2, prev: 0.45, delta: '−5', tint: 'greenTint', ink: 'green', icon: 'bell' },
];

/** Share of the team quest you drove this week (%). */
export const MY_SHARE_PCT = 18;
/** Bottom stats. */
export const QUEST_STATS = { reportingHoursPerWeek: 1.5, statusMeetings: 0 };
