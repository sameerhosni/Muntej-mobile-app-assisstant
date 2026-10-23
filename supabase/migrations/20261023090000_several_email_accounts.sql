-- Several email accounts per person (owner's request: up to 3, e.g. work Gmail + personal Gmail + Outlook).
-- A connection is now one ACCOUNT of a tool, not one tool: unique per person + tool + account (the signed-in email).
-- The 3-email cap is checked by the connect function when a new account signs in.
alter table public.connections drop constraint if exists connections_profile_id_provider_key;
create unique index if not exists connections_account_key on public.connections (profile_id, provider, account_label);
