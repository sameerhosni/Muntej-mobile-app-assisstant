-- Each tool has its own page: remember which connected account a message came from, so two Google accounts on one
-- person show apart. Older rows (and WhatsApp / pasted) have none and are matched by source.
alter table public.incoming_items
  add column if not exists connection_id uuid references public.connections (id) on delete set null;
create index if not exists incoming_items_owner_source_idx on public.incoming_items (owner_id, source, received_at desc);
