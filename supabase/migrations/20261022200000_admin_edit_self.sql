-- upsert_person: "Only a super admin can give or change admin roles" fired whenever the person being saved WAS an
-- admin - even when no role was being set (an account admin saving their own name in onboarding). The check is about
-- giving or changing a role, so it now applies only when the patch actually sets one.
do $$
declare
  fn text;
  name text;
begin
  for name in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('upsert_person', 'upsert_person_inner') loop
    fn := pg_get_functiondef(name::regprocedure);
    if position('if (new_role in (''admin'', ''super_admin'') or (not is_new and target.role' in fn) > 0 then
      fn := replace(fn,
        'if (new_role in (''admin'', ''super_admin'') or (not is_new and target.role in (''admin'', ''super_admin'') and p ? ''role''))',
        'if ((p ? ''role'' and new_role in (''admin'', ''super_admin'')) or (not is_new and target.role in (''admin'', ''super_admin'') and p ? ''role'' and new_role is distinct from target.role))');
      execute fn;
      raise notice 'patched %', name;
    end if;
  end loop;
end;
$$;
