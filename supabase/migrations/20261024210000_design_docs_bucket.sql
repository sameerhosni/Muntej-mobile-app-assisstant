-- System design documents for the super admin (Settings → System design): HLD + LLD PDF, the full design image, and
-- the integration API PDF. Private bucket; only the super admin can read (signed links from the app). Uploaded by
-- scripts/upload-design-docs.js after scripts/build-design-docs.js.
insert into storage.buckets (id, name, public, file_size_limit)
values ('design-docs', 'design-docs', false, 20971520)
on conflict (id) do nothing;

drop policy if exists design_docs_super_read on storage.objects;
create policy design_docs_super_read on storage.objects for select to authenticated
  using (bucket_id = 'design-docs' and public.is_super_admin());
