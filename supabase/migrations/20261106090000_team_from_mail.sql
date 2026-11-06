-- People from your mail (owner, 6 Nov: "once we connect Google tools, saree3 should import all users email found in
-- tasks and suggest to add it to the account org structure under one of the existing users or skip the user"). The
-- people Muntej finds in what it read for you become a team draft (source 'mail') reviewed on screen 62; whoever you
-- leave out is remembered here, so they're never suggested again.

alter table public.team_drafts drop constraint if exists team_drafts_source_check;
alter table public.team_drafts add constraint team_drafts_source_check
  check (source in ('photo', 'file', 'paste', 'chat', 'microsoft', 'google', 'jisr', 'manual', 'mail'));

create table if not exists public.team_mail_skips (
  created_by uuid not null references public.profiles (id) on delete cascade,
  -- an email, or "name:<normalised name>" for someone known only by name (Google Chat)
  key text not null,
  created_at timestamptz not null default now(),
  primary key (created_by, key)
);
alter table public.team_mail_skips enable row level security;
drop policy if exists team_mail_skips_own on public.team_mail_skips;
create policy team_mail_skips_own on public.team_mail_skips
  for all to authenticated
  using (created_by = public.current_profile_id())
  with check (created_by = public.current_profile_id());

insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('team_from_mail', 'manager', now(), 'Your team, from your mail',
   'فريقك من إيميلاتك',
   'I find the colleagues in the mail and chats I read for you, suggest who each one works under, and you add or skip them in one go.',
   'ألقى زملاءك في الإيميلات والمحادثات اللي أقراها لك، وأقترح كل واحد تحت مين يشتغل، وأنت تضيفهم أو تتخطاهم مرة وحدة.', -21)
on conflict (key) do nothing;
