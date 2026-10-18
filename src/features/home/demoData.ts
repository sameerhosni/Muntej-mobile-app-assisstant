// Demo values for the Home "Team energy this week" card (design/v2/html/Main.dc.html).
// Replace with a real points query once the points ledger is live.

export const teamEnergyDemo = {
  points: 2340,
  /** Week-over-week change, percent. */
  deltaPct: 18,
  streakCount: 3,
  /** Team members to recognize (Khalid + Saad in the design). */
  stars: [
    { name: 'Khalid', nameAr: 'خالد', gradient: 'avatarGreen' },
    { name: 'Saad', nameAr: 'سعد', gradient: 'avatarOrange' },
  ],
} as const;
