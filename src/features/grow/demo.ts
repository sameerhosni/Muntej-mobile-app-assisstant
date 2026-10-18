// Demo growth data for the manager (design/v2/html/Grow.dc.html). No invites/referrals backend yet.
import type { ColorToken } from '@/theme/tokens';

export const GROW_STATS = { teamsLive: 2, peopleActive: 17, selfJoinedPct: 94 };

/** Branch Muntej spotted from task mentions that is not on Muntej yet. */
export const SPOTTED_BRANCH = { cityKey: 'jeddah', tasks: 14, hoursPerMonth: 25, sarPerMonth: 5000, managerKey: 'omar' };

export type GrowAction = {
  key: 'newTeam' | 'inviteManager' | 'showBoss';
  route: '/34-add-team' | '/31-team-launch' | '/32-receipt';
  icon: 'plus' | 'userPlus' | 'receipt';
  tint: ColorToken;
  ink: ColorToken;
};

export const GROW_ACTIONS: GrowAction[] = [
  { key: 'newTeam', route: '/34-add-team', icon: 'plus', tint: 'primaryTint', ink: 'primary' },
  { key: 'inviteManager', route: '/31-team-launch', icon: 'userPlus', tint: 'purpleTint', ink: 'purple' },
  { key: 'showBoss', route: '/32-receipt', icon: 'receipt', tint: 'greenTint', ink: 'green' },
];

/** Numbers quoted in the referral message (the manager's receipt, demo). */
export const RECEIPT_SUMMARY = { hours: 25, sar: 5000 };
