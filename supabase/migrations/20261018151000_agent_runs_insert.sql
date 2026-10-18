-- Owners may record runs (e.g. the dry run from "New agent") for their own agents.
create policy agent_runs_insert on public.agent_runs for insert to authenticated
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = public.current_profile_id()));
