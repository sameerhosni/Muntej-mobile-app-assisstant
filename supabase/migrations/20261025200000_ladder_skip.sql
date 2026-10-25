-- Value ladder: "Skip for now" on the current step (owner: "add skip"). A skipped step stops holding the journey
-- and gets no nudge; it still ticks by itself later if it really happens.
alter table public.value_ladder add column if not exists skipped_at timestamptz;

create or replace function public.ladder_skip(p_rung text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.value_ladder (profile_id, rung_id, skipped_at)
  select public.current_profile_id(), p_rung, now()
   where public.current_profile_id() is not null and p_rung ~ '^[ME][0-9]$'
  on conflict (profile_id, rung_id) do update set skipped_at = now();
$$;
revoke all on function public.ladder_skip(text) from public, anon;
grant execute on function public.ladder_skip(text) to authenticated;

-- no nudge for a skipped step
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
      if (is_mgr and r.rung_id like 'M%') or (not is_mgr and r.rung_id like 'E%') then
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

    -- the next rung on their ladder, and how long to wait before one gentle nudge
    if is_mgr then
      select x.id, x.w into nxt, wait from (values ('M1', interval '10 minutes', 1), ('M2', interval '24 hours', 2),
                                                 ('M3', interval '48 hours', 3), ('M5', interval '5 days', 5)) as x(id, w, o)
       where not exists (select 1 from public.value_ladder v where v.profile_id = pr.id and v.rung_id = x.id and (v.reached_at is not null or v.skipped_at is not null))
         -- a later step already reached means they're past this one: no nudge
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
