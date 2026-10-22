-- Part B of the self-serve journey:
--   coach_moments   Saree3's "first time this happens" tips (first review waiting, first blocked teammate, …), shown
--                   once per person; a row = shown (and whether "Show me" was used)
--   feedback        one-tap ratings (1 😍 … 4 🙁) + optional comment after big moments; people only write their own,
--                   ONLY the super admin reads them
--   growth_overview the super admin's view: every account's journey (signed up → named → first task → team →
--                   first hand-off → first review) + recent feedback

create table if not exists public.coach_moments (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  shown_at timestamptz not null default now(),
  acted boolean not null default false,
  primary key (profile_id, key)
);
alter table public.coach_moments enable row level security;
drop policy if exists coach_moments_own on public.coach_moments;
create policy coach_moments_own on public.coach_moments for select to authenticated using (profile_id = public.current_profile_id());

create or replace function public.coach_seen(p_key text, p_acted boolean default false)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.coach_moments (profile_id, key, acted) values (public.current_profile_id(), p_key, p_acted)
  on conflict (profile_id, key) do update set acted = public.coach_moments.acted or excluded.acted;
$$;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  moment text not null,
  rating smallint check (rating between 1 and 4),
  comment text,
  created_at timestamptz not null default now(),
  unique (profile_id, moment)
);
alter table public.feedback enable row level security;
-- nobody reads feedback but the super admin; people only see that they answered (for "don't ask twice")
drop policy if exists feedback_super on public.feedback;
create policy feedback_super on public.feedback for select to authenticated
  using (public.is_super_admin() or profile_id = public.current_profile_id());

-- rating null = "not now" (counts as asked, so we don't ask again for that moment)
create or replace function public.give_feedback(p_moment text, p_rating smallint, p_comment text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.feedback (profile_id, account_id, moment, rating, comment)
  values (public.current_profile_id(), public.current_account_id(), left(p_moment, 40), p_rating, nullif(left(trim(coalesce(p_comment, '')), 1000), ''))
  on conflict (profile_id, moment) do update set rating = excluded.rating, comment = coalesce(excluded.comment, public.feedback.comment);
$$;

create or replace function public.growth_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super admin only';
  end if;
  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
        select a.id, a.name, a.created_at,
          (select count(*) from public.profiles p where p.account_id = a.id and not p.hidden and p.status <> 'deleted') as people,
          exists (select 1 from public.onboarding o join public.profiles p on p.id = o.profile_id where p.account_id = a.id and o.account_named) as named,
          exists (select 1 from public.tasks t join public.profiles p on p.id = t.assigner_id where p.account_id = a.id and t.status <> 'cancelled') as first_task,
          (select count(*) from public.profiles p where p.account_id = a.id and not p.hidden and p.status <> 'deleted') > 1 as team,
          exists (select 1 from public.tasks t join public.profiles p on p.id = t.assigner_id
                   where p.account_id = a.id and t.owner_id is not null and t.owner_id <> t.assigner_id and t.status <> 'cancelled') as handoff,
          exists (select 1 from public.reviews r join public.tasks t on t.id = r.task_id join public.profiles p on p.id = t.owner_id
                   where p.account_id = a.id and r.decision is not null) as review,
          (select count(*) from public.tasks t join public.profiles p on p.id = t.assigner_id
            where p.account_id = a.id and t.status <> 'cancelled' and t.created_at > now() - interval '7 days') as tasks_7d,
          (select max(t.created_at) from public.tasks t join public.profiles p on p.id = t.assigner_id where p.account_id = a.id) as last_task_at
        from public.accounts a
      ) x
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(row_to_json(f) order by f.created_at desc) from (
        select fb.moment, fb.rating, fb.comment, fb.created_at, p.full_name as person, a.name as account
          from public.feedback fb join public.profiles p on p.id = fb.profile_id join public.accounts a on a.id = fb.account_id
         where fb.rating is not null
         order by fb.created_at desc limit 100
      ) f
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.coach_seen(text, boolean) from public, anon;
revoke all on function public.give_feedback(text, smallint, text) from public, anon;
revoke all on function public.growth_overview() from public, anon;
grant execute on function public.coach_seen(text, boolean) to authenticated;
grant execute on function public.give_feedback(text, smallint, text) to authenticated;
grant execute on function public.growth_overview() to authenticated;
grant select on public.coach_moments, public.feedback to authenticated;
