-- Hindi as a language people can choose (owner, 5 Nov: "add indian language in the whole app as an option"; Arabic stays
-- the default). Muntej's own messages are written in English and Arabic all over the server, so instead of a third column
-- everywhere, the English text is put into Hindi when it's delivered and remembered here: each line is paid for once.

alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check check (locale in ('en', 'ar', 'hi'));

create or replace function public.set_my_locale(p_locale text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set locale = p_locale
   where user_id = (select auth.uid()) and p_locale in ('en', 'ar', 'hi') and locale is distinct from p_locale;
$$;

create or replace function public.task_translation_targets(p_task uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.locale), '{}')
    from public.tasks t
    join public.profiles p
      on p.id in (t.owner_id, t.assigner_id, t.helper_id)
      or p.id in (select s.owner_id from public.subtasks s where s.task_id = t.id)
   where t.id = p_task
     and t.source_language is not null
     and p.locale <> t.source_language
     and p.locale in ('en', 'ar', 'hi');
$$;

create table if not exists public.text_translations (
  lang text not null,
  hash text not null,
  source text not null,
  translated text not null,
  created_at timestamptz not null default now(),
  primary key (lang, hash)
);
alter table public.text_translations enable row level security;
