-- Owner, 10 Nov: "AI should be allowed by default in our system no need to ask for permissions except the user
-- stopped it so give him clear notification of this". Picked: ask once on iPhone only (Apple 5.1.2, the 8 Nov
-- rejection); everywhere else AI is on until the person turns it off. The server can't tell the phone, so here it is
-- simply: on unless they said no (null = on). The iPhone app itself keeps its assistant off until they answer.
create or replace function public.ai_allowed(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select coalesce(p.ai_consent, true) from public.profiles p where p.id = p_profile), false);
$$;

-- turning it off gets a clear line on the Alerts screen and phone: what stops, and how to turn it back on
create or replace function public.ai_turned_off_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ai_consent is false and old.ai_consent is distinct from false then
    insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
    values (new.id, 'changed_for_you', null,
            'AI assistant is off',
            'Muntej no longer reads your messages, mail or voice with AI: the chat, voice, tools and WhatsApp answers wait. Turn it back on in Settings → AI assistant.',
            'مساعد الذكاء الاصطناعي متوقف',
            'منتج ما عاد يقرأ رسايلك وإيميلك وصوتك بالذكاء الاصطناعي: المحادثة والصوت والأدوات وردود الواتساب متوقفة. ترجّعه من الإعدادات ← مساعد الذكاء الاصطناعي.',
            -- one notice per login, not one per company seat (set_ai_consent changes every seat at once)
            'ai_off:' || coalesce(new.user_id::text, new.id::text) || ':' || (extract(epoch from now())::bigint / 60))
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists ai_turned_off_notice on public.profiles;
create trigger ai_turned_off_notice after update of ai_consent on public.profiles
  for each row execute function public.ai_turned_off_notice();
