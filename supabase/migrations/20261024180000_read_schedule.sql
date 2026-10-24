-- Your tools: each connected tool reads on its own schedule, set by its owner. read_every_min: how often Saree3 reads it
-- (10 = the default, every run of the 10-minute job), 0 = manual only ("Read now"). Allowed: 0, 10, 30, 60, 180, 1440.
alter table public.connections add column if not exists read_every_min integer not null default 10
  check (read_every_min in (0, 10, 30, 60, 180, 1440));
