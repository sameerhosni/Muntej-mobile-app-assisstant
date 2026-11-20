-- The «اللي عيني عليه عنك» list left Home (owner, 19 Nov: "not urgent for me to see what Saree3 is doing").
-- What's new still offered "Risks and achievements on Home": say where late work lives now (Tasks → Late,
-- FEATURE_PLACES.team_risks) and keep the wins, which are still on Home.
update public.features set
  title = 'Late work in Tasks, wins on Home',
  title_ar = 'المتأخر في المهام، والإنجازات في الرئيسية',
  benefit = 'Late and blocked work across your team is in Tasks under "Late"; this week''s wins stay on Home.',
  benefit_ar = 'المتأخر والواقف في فريقك تلقاه في المهام تحت «متأخرة»، وإنجازات الأسبوع باقية في الرئيسية.'
where key = 'team_risks';
