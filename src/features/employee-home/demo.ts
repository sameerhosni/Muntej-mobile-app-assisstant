// Demo gamification data for Employee Home (design/v2/html/EmployeeHome.dc.html). No backend yet.
export type QuestId = 'a' | 'b' | 'c';

export const QUESTS: { id: QuestId; pts: number }[] = [
  { id: 'a', pts: 5 },
  { id: 'b', pts: 15 },
  { id: 'c', pts: 70 },
];

export const STREAK_DAYS = 12;
export const BADGE_COUNT = 6;
export const TEAM_QUEST = { done: 31, goal: 40 };
