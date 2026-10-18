// Demo rewards catalog (design/v2/html/Rewards.dc.html). Costs in points; 10 pts = SAR 1.
import type { ColorToken } from '@/theme/tokens';

export type RewardId = 'c' | 'd' | 'h' | 'p' | 'l' | 'r';

export type Reward = { id: RewardId; cost: number; bg: ColorToken; fg: ColorToken };

export const REWARDS: Reward[] = [
  { id: 'c', cost: 300, bg: 'orangeTint', fg: 'orange' },
  { id: 'd', cost: 500, bg: 'greenTint', fg: 'green' },
  { id: 'h', cost: 800, bg: 'primaryTint', fg: 'primary' },
  { id: 'p', cost: 1500, bg: 'purpleTint', fg: 'purple' },
  { id: 'l', cost: 2500, bg: 'redTint', fg: 'red' },
  { id: 'r', cost: 4000, bg: 'primaryTint', fg: 'cyan' },
];

/** The reward the employee is saving towards (shown on Employee Home). */
export const NEXT_REWARD = REWARDS[5];

/** Points earned earlier this week, before today (design shows "+410 this week" with today's 5). */
export const EARNED_EARLIER_THIS_WEEK = 405;
