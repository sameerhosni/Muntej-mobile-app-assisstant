-- "Your steps in Muntej" (E1–E3) didn't move for the owner (28 Oct: "nothing changing here even with actions taken"):
--   · the steps were recorded only for role 'employee', but anyone may see the employee Home (an admin with no team)
--   · they counted only tasks someone else gave you, so your own tasks (made, opened, finished) never ticked them
-- Now: E-steps are recorded for everyone, and any task of yours counts. E2 also counts moving your task in the app.
create or replace function public.ladder_rungs(p uuid)
returns table (rung_id text, reached_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'M1', min(t.created_at) from public.tasks t where t.assigner_id = p and t.source in ('voice', 'text')
  union all
  select 'M2', min(t.created_at) from public.tasks t where t.assigner_id = p and t.owner_id is not null and t.owner_id <> p
  union all
  select 'M3', min(f.sent_at)
    from public.followups f join public.tasks t on t.id = f.task_id
   where t.assigner_id = p and t.owner_id <> p and f.status in ('sent', 'replied') and f.sent_at is not null
     and coalesce(t.manager_touches, 0) = 0 and f.recipient_id = t.owner_id
  union all
  select 'M4', min(t.closed_at) from public.tasks t
   where t.assigner_id = p and t.owner_id <> p and t.status = 'done' and t.closed_at is not null
  union all
  select 'M5', min(b.day)::timestamptz from public.brief_opens b
   where b.profile_id = p
     and (select count(*) from public.brief_opens c where c.profile_id = p and c.day between b.day - 6 and b.day) >= 3
  union all
  select 'M6', case when (
      select count(distinct t.owner_id) from public.tasks t
       where t.status = 'done' and t.closed_at > now() - interval '7 days' and t.owner_id <> p and public.is_below(t.owner_id, p)
    ) >= 3 then now() end
  union all
  select 'M7', min(i.decided_at) from public.incoming_items i
   where i.owner_id = p and i.source not in ('paste', 'share')
     and exists (select 1 from jsonb_array_elements(i.suggestions) s where s->>'state' = 'accepted')
  union all
  -- E1 clear ask: opened a task of theirs (given to them or their own)
  select 'E1', min(t.seen_at) from public.tasks t where t.owner_id = p
  union all
  -- E2 easy update: answered Saree3 with one tap / a reply, or moved their task along in the app
  select 'E2', min(a.created_at) from public.activity_log a
   where a.actor_id = p and (a.action = 'update_received' or (a.action = 'task_status_changed' and a.task_id is not null))
  union all
  -- E3 recognised: first task of theirs finished
  select 'E3', min(t.closed_at) from public.tasks t where t.owner_id = p and t.status = 'done';
$$;
revoke all on function public.ladder_rungs(uuid) from public, anon, authenticated;

create or replace function public.compute_ladder()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr record;
  r record;
  n integer := 0;
  started timestamptz;
  is_mgr boolean;
  nxt text;
  wait interval;
  rung_names jsonb := '{
    "M1": ["First capture", "أول مهمة بصوتك"], "M2": ["First hand-off", "أول تسليم"],
    "M3": ["First forget", "أول مرة نسيتها"], "M4": ["First closed loop", "أول مهمة تقفل لحالها"],
    "M5": ["Daily brief habit", "عادة الملخص اليومي"], "M6": ["Team runs on it", "فريقك يشتغل عليه"],
    "M7": ["Work comes to Muntej", "الشغل يجي لمنتج"], "E1": ["Clear ask", "طلب واضح"],
    "E2": ["Easy update", "تحديث بضغطة"], "E3": ["Recognised", "شغلك ينشاف"]}';
begin
  for pr in
    select p.id, p.role, coalesce(o.started_at, p.created_at) as started
      from public.profiles p left join public.onboarding o on o.profile_id = p.id
     where p.status = 'active' and p.user_id is not null and coalesce(p.hidden, false) = false
  loop
    is_mgr := pr.role <> 'employee';
    for r in select * from public.ladder_rungs(pr.id) where reached_at is not null loop
      -- E-steps for everyone (anyone can land on the employee Home); M-steps for managers
      if r.rung_id like 'E%' or is_mgr then
        insert into public.value_ladder (profile_id, rung_id, reached_at)
        values (pr.id, r.rung_id, r.reached_at)
        on conflict (profile_id, rung_id) do update set reached_at = excluded.reached_at
          where public.value_ladder.reached_at is null;
        if found then
          n := n + 1;
          insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
          values ('muntej', pr.id, 'ladder_rung_reached',
                  format('Reached %s: %s', r.rung_id, rung_names->r.rung_id->>0),
                  format('وصل %s: %s', r.rung_id, rung_names->r.rung_id->>1),
                  r.rung_id, false);
        end if;
      end if;
    end loop;

    if is_mgr then
      select x.id, x.w into nxt, wait from (values ('M1', interval '10 minutes', 1), ('M2', interval '24 hours', 2),
                                                 ('M3', interval '48 hours', 3), ('M5', interval '5 days', 5)) as x(id, w, o)
       where not exists (select 1 from public.value_ladder v where v.profile_id = pr.id and v.rung_id = x.id and (v.reached_at is not null or v.skipped_at is not null))
         and not exists (select 1 from public.value_ladder v where v.profile_id = pr.id and v.reached_at is not null
                           and v.rung_id in ('M2', 'M3', 'M4', 'M5', 'M6') and v.rung_id > x.id)
       order by x.o limit 1;
      if nxt is not null and now() - pr.started > wait
         and not exists (select 1 from public.value_ladder v where v.profile_id = pr.id and v.rung_id = nxt and v.nudged_at is not null) then
        insert into public.value_ladder (profile_id, rung_id, nudged_at) values (pr.id, nxt, now())
        on conflict (profile_id, rung_id) do update set nudged_at = now();
        insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
        select pr.id, 'ladder_nudge', pr.id, m.t, m.b, m.ta, m.ba, 'ladder:' || pr.id || ':' || nxt
          from (values
            ('M1', 'Try your first task by voice', 'Just tap the mic and say it 🎤', 'جرّب أول مهمة بصوتك', 'بس اضغط المايك وقلها 🎤'),
            ('M2', 'Hand it to your team', 'Add a teammate and let Muntej deliver the task', 'سلّمها لفريقك', 'أضف واحد من فريقك وخلّ منتج يوصّل له المهمة'),
            ('M3', 'Give it a due date', 'Muntej will follow up for you', 'عطها موعد تسليم', 'ومنتج بيتابعها عنك'),
            ('M5', 'Your daily brief is ready', 'One minute to know where your team stands', 'ملخصك اليومي جاهز', 'دقيقة وتعرف وين وصل فريقك')
          ) as m(id, t, b, ta, ba)
         where m.id = nxt
        on conflict (dedupe_key) do nothing;
      end if;
    end if;
    nxt := null;
  end loop;
  return n;
end;
$$;
revoke all on function public.compute_ladder() from public, anon, authenticated;

-- catch up now; steps reached more than a day ago aren't celebrated (no burst of old toasts)
select public.compute_ladder();
update public.value_ladder set celebrated_at = now()
 where rung_id like 'E%' and reached_at < now() - interval '1 day' and celebrated_at is null;
