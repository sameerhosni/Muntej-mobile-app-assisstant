-- Owner, 10 Nov: "superadmin has no tasks, he has overview on the system itself like number of active accounts and
-- number of users under each account or overall and number of tasks … statistics to help our team to monitor system
-- performance". system_overview: the super admin's dashboard (band + Overview · Companies · Health), one call.
--   totals     companies, active / invited people, tasks this week (and the week before), open, late
--   per_day    new tasks each of the last 7 days (Riyadh)
--   companies  each company: active, invited, tasks in 7 days, open, late, last activity
--   health     last 24 h: alerts delivered, pushed, WhatsApp sent / failed, reports sent, scheduled jobs failed
-- The super admin's own seats and hidden viewing seats never count as people. A task belongs to the company of the
-- person who gave it (or owns it, when nobody did).
create or replace function public.system_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  day0 timestamptz := date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh';
  jobs_failed int := 0;
  jobs_run int := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin only';
  end if;
  -- pg_cron's run log (may be missing on a project without pg_cron: then 0)
  begin
    execute $q$select count(*) filter (where status = 'failed'), count(*) from cron.job_run_details where start_time > now() - interval '24 hours'$q$
      into jobs_failed, jobs_run;
  exception when others then
    jobs_failed := 0; jobs_run := 0;
  end;

  return (
    with seat as (
      select p.id, p.account_id, p.status from public.profiles p
       where not p.hidden and p.role <> 'super_admin' and p.status in ('active', 'pending')
    ),
    task as (
      select t.id, t.status, t.due_at, t.created_at, t.updated_at,
             (select p.account_id from public.profiles p where p.id = coalesce(t.assigner_id, t.owner_id)) as account_id
        from public.tasks t
       where t.status <> 'cancelled'
    ),
    per_acc as (
      select a.id, a.name, a.created_at,
             (select count(*) from seat s where s.account_id = a.id and s.status = 'active') as active,
             (select count(*) from seat s where s.account_id = a.id and s.status = 'pending') as invited,
             (select count(*) from task t where t.account_id = a.id and t.created_at > now() - interval '7 days') as tasks_7d,
             (select count(*) from task t where t.account_id = a.id and t.status in ('assigned', 'in_progress', 'blocked', 'returned', 'submitted')) as open,
             (select count(*) from task t where t.account_id = a.id and t.status in ('assigned', 'in_progress', 'blocked', 'returned') and t.due_at < now()) as late,
             (select max(t.updated_at) from task t where t.account_id = a.id) as last_active
        from public.accounts a
       where exists (select 1 from seat s where s.account_id = a.id)
    )
    select jsonb_build_object(
      'at', now(),
      'totals', jsonb_build_object(
        'companies', (select count(*) from per_acc where active > 0),
        'new_companies_7d', (select count(*) from per_acc where created_at > now() - interval '7 days'),
        'idle_companies_7d', (select count(*) from per_acc where active > 0 and tasks_7d = 0),
        'active', (select count(*) from seat where status = 'active'),
        'invited', (select count(*) from seat where status = 'pending'),
        'tasks_7d', (select count(*) from task where created_at > now() - interval '7 days'),
        'tasks_prev_7d', (select count(*) from task where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
        'open', (select coalesce(sum(open), 0) from per_acc),
        'late', (select coalesce(sum(late), 0) from per_acc)
      ),
      'per_day', (
        select jsonb_agg(jsonb_build_object('day', to_char(d at time zone 'Asia/Riyadh', 'YYYY-MM-DD'), 'n',
                 (select count(*) from task t where t.created_at >= d and t.created_at < d + interval '1 day')) order by d)
          from generate_series(day0 - interval '6 days', day0, interval '1 day') d
      ),
      'companies', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'active', active, 'invited', invited, 'tasks_7d', tasks_7d,
                                            'open', open, 'late', late, 'last_active', last_active)
                         order by tasks_7d desc, active desc, name)
          from per_acc
      ), '[]'::jsonb),
      'health', jsonb_build_object(
        'alerts', (select count(*) from public.alerts where delivered_at > now() - interval '24 hours'),
        'pushed', (select count(*) from public.alerts where delivered_at > now() - interval '24 hours' and sent_push),
        'wa_sent', (select count(*) from public.alerts where delivered_at > now() - interval '24 hours' and whatsapp_status = 'sent'),
        'wa_failed', (select count(*) from public.alerts where delivered_at > now() - interval '24 hours' and whatsapp_status = 'error'),
        'reports', (select count(*) from public.daily_summaries where day = (now() at time zone 'Asia/Riyadh')::date and cardinality(channels) > 0),
        'jobs_run', jobs_run,
        'jobs_failed', jobs_failed
      )
    )
  );
end;
$$;
revoke all on function public.system_overview() from public, anon;
grant execute on function public.system_overview() to authenticated;
