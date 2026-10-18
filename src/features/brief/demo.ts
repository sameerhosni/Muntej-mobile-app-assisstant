// Design demo values for screen 05 (used only when the workspace has no tasks yet).
export const BRIEF_DEMO = {
  hours: 6.2,
  sar: 1240,
  closed: 32,
  onTime: 87,
  followups: 124,
  calls: 3,
  monthHours: 25.8,
  monthSar: 5160,
  pulse: [
    { id: 'faisal', rate: 92 },
    { id: 'abdullah', rate: 78 },
    { id: 'khalid', rate: 55 },
  ],
  suggestion: { id: 'khalid', kind: 'up' as const, n: 40 },
};
