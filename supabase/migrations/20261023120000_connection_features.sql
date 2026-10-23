-- Per-account switches for what a connected tool may read (owner: "activate it or not"). Google: gmail · calendar ·
-- meet ({"gmail": true, "calendar": true, "meet": false}); a missing key means its default (gmail and calendar on,
-- meet on once Google gave Meet access). Set from the Sources screen through the connect function.
alter table public.connections add column if not exists features jsonb not null default '{}'::jsonb;
