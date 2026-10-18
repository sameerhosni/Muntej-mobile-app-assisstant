-- RLS smoke test: impersonates a seed profile inside a transaction that is never committed.
-- Usage: .\scripts\db-apply.ps1 -SqlFile supabase\tests\rls_check.sql -Vars @{phone='966500000002'}
begin;
update public.profiles set user_id = '11111111-1111-4111-8111-111111111111' where phone = ':phone';
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select
  (select full_name from public.profiles where id = public.current_profile_id())               as me,
  (select count(*) from public.profiles)                                                         as profiles_visible,
  (select count(*) from public.tasks)                                                            as tasks_visible,
  (select count(*) from public.tasks where owner_id <> public.current_profile_id()
                                       and coalesce(helper_id::text,'') <> public.current_profile_id()::text
                                       and assigner_id <> public.current_profile_id())           as others_tasks_visible,
  (select count(*) from public.decisions)                                                        as decisions_visible,
  (select count(*) from public.achievements)                                                     as achievements_visible,
  (select count(*) from public.achievements where profile_id <> public.current_profile_id())     as others_achievements,
  (select count(*) from public.activity_log)                                                     as activity_visible,
  (select count(*) from public.notification_prefs)                                               as prefs_visible;
