-- AI permission (Apple, 8 Nov, guidelines 5.1.1(i) and 5.1.2(i): "the app does not clearly explain what data is sent,
-- identify who the data is sent to, and ask the user's permission before sharing the data"). Each person answers once,
-- in the app, before anything of theirs goes to OpenAI: null = not asked yet, true = allowed, false = "Not now".
-- The answer is per login, so it is saved on every company seat of that login. Until `ship --live` the check only
-- applies to testers (features.testing), so the live app, which has no screen yet, keeps working.

alter table public.profiles add column if not exists ai_consent boolean;
alter table public.profiles add column if not exists ai_consent_at timestamptz;

create or replace function public.set_ai_consent(p boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  uid uuid := (select auth.uid());
begin
  if me is null or uid is null then
    raise exception 'Not signed in';
  end if;
  update public.profiles set ai_consent = p, ai_consent_at = now() where user_id = uid;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  values ('user', me, me, case when p then 'ai_allowed' else 'ai_declined' end,
          case when p then 'Allowed Muntej to use AI (OpenAI) on their data' else 'Chose not to let Muntej use AI on their data' end,
          case when p then 'سمح لمنتج يستخدم الذكاء الاصطناعي (OpenAI) على بياناته' else 'اختار ما يستخدم منتج الذكاء الاصطناعي على بياناته' end,
          false);
end;
$$;
revoke all on function public.set_ai_consent(boolean) from public, anon;
grant execute on function public.set_ai_consent(boolean) to authenticated;

-- may Muntej send this person's data to the AI? (server jobs ask about someone who isn't signed in, so by profile)
create or replace function public.ai_allowed(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
             -- before --live, only testers are asked; everyone else keeps AI as before
             when f.testing and not p.tester then true
             else coalesce(p.ai_consent, false)
           end
      from public.profiles p
      left join public.features f on f.key = 'ai_consent'
     where p.id = p_profile
  ), false);
$$;
revoke all on function public.ai_allowed(uuid) from public, anon;
grant execute on function public.ai_allowed(uuid) to authenticated, service_role;

insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort, testing) values
  ('ai_consent', 'all', now(), 'You decide about AI',
   'أنت تقرر عن الذكاء الاصطناعي',
   'Muntej asks before any of your data goes to its AI provider (OpenAI), shows exactly what is sent, and you can switch it off in Settings.',
   'منتج يستأذنك قبل ما يروح أي شي من بياناتك لمزوّد الذكاء الاصطناعي (OpenAI)، ويوضح لك وش ينرسل بالضبط، وتقدر توقفه من الإعدادات.', -23, true)
on conflict (key) do nothing;
