-- Private bucket for task evidence. Object path convention: <task_id>/<filename>.

insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 52428800) -- 50 MB
on conflict (id) do nothing;

-- first path segment as uuid, or null when it isn't one
create or replace function public.evidence_task_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (string_to_array(object_name, '/'))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy evidence_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.can_see_task(public.evidence_task_id(name)));

create policy evidence_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.can_see_task(public.evidence_task_id(name)));

create policy evidence_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and owner_id = (select auth.uid())::text);
