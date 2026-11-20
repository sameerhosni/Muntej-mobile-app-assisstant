-- Reviewer, 20 Nov (R156): Tasks → "Late" holds only overdue work, not blocked work, so What's new names only what it holds.
update public.features set
  benefit = 'Late work across your team is in Tasks under "Late"; this week''s wins stay on Home.',
  benefit_ar = 'المتأخر في فريقك تلقاه في المهام تحت «متأخرة»، وإنجازات الأسبوع باقية في الرئيسية.'
where key = 'team_risks';
