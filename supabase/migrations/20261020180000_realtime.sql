-- Live updates: the app listens (Supabase Realtime, postgres_changes) to these tables and refreshes what is on
-- screen when something changes. Realtime applies each table's RLS select policy per listener, so people only
-- hear about rows they may see. See src/lib/realtime.ts.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'tasks', 'subtasks', 'evidence', 'reviews', 'followups', 'decisions', 'activity_log', 'alerts',
    'chat_messages', 'profiles', 'objectives', 'recurring_tasks', 'achievements', 'workspaces'
  ] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
