-- Ideas & notes (owner, 26 Oct): say it by voice and attach a photo, a screenshot or a PDF. Files go in a private
-- bucket under the sender's profile id (<profile_id>/<file>); the sender and the super admin can open them.
alter table public.ideas add column if not exists attachments jsonb not null default '[]'; -- [{path, name, mime}]

insert into storage.buckets (id, name, public, file_size_limit)
values ('ideas', 'ideas', false, 15728640) -- 15 MB
on conflict (id) do nothing;

drop policy if exists ideas_objects_insert on storage.objects;
create policy ideas_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ideas' and (string_to_array(name, '/'))[1] = public.current_profile_id()::text);
drop policy if exists ideas_objects_select on storage.objects;
create policy ideas_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'ideas' and ((string_to_array(name, '/'))[1] = public.current_profile_id()::text or public.is_super_admin()));
