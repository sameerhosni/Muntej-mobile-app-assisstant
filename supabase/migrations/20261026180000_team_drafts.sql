-- Smart team setup, step 1 (owner, 26 Oct: "the org structure and invitations are the hook"): every way of bringing a
-- team in (photo of an org chart, Excel / PDF, a pasted list, the chat, later Microsoft / Google / Jisr) makes one
-- draft; the person reviews it as a tree, fixes it, and confirms once (team-import function → upsert_person as them).

create table if not exists public.team_drafts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('photo', 'file', 'paste', 'chat', 'microsoft', 'google', 'jisr', 'manual')),
  -- [{ref, full_name, full_name_ar, title, email, phone, department, manager_ref, manager_id, existing_id, role,
  --   confidence, unsure[], skip}]
  people jsonb not null default '[]',
  company_name text,
  status text not null default 'draft' check (status in ('draft', 'applied', 'discarded')),
  -- what confirm did: {created, updated, failed: [{ref, name, error}], ids: {ref: profile id}}
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_drafts_by_idx on public.team_drafts (created_by, created_at desc);
alter table public.team_drafts enable row level security;
drop policy if exists team_drafts_own on public.team_drafts;
create policy team_drafts_own on public.team_drafts for all to authenticated
  using (created_by = public.current_profile_id())
  with check (created_by = public.current_profile_id() and account_id = public.current_account_id());
grant select, insert, update, delete on public.team_drafts to authenticated;

-- What's new
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('build_team', 'manager', now(), 'Your whole team in a minute',
   'فريقك كامل في دقيقة',
   'Snap your org chart, upload your Excel or paste a list: I read it, draw the tree, you fix what you like and confirm once.',
   'صوّر الهيكل التنظيمي، أو ارفع ملف الإكسل، أو الصق القائمة: أقراها، أرسم الشجرة، تعدّل اللي تبي وتأكد مرة وحدة.', -19)
on conflict (key) do nothing;
