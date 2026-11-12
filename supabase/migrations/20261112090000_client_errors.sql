-- client_errors: a sign-in step that failed on someone's phone, sent by the app before anyone is signed in
-- (supabase/functions/client-error). Apple's iPad hit "an error" on 10 Nov and our logs showed nothing, because the
-- request never reached us; now the app says the real cause with a ref number, and the same ref lands here.
-- No content and no full email: only the step, the error, the device, the build, and the email's domain.
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ref text not null,
  -- when it happened on the phone (a report kept while offline arrives later)
  client_at text,
  step text not null,
  kind text not null,
  message text,
  status int,
  platform text,
  os_version text,
  device text,
  ipad boolean,
  app_version text,
  build text,
  update_id text,
  email_domain text,
  review_login boolean not null default false
);

create index if not exists client_errors_at on public.client_errors (at desc);
create index if not exists client_errors_ref on public.client_errors (ref);

-- only the server writes and reads it (service role); nobody reads it from the app
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
