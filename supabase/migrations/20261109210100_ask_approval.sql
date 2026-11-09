-- N9: ask for an approval in your own words (from the chat). It goes to whoever gave the task it's about, else to your
-- manager, as a decision (the insert trigger sends them the decision_waiting alert: push / WhatsApp); their answer
-- comes back to you as request_answered. Returns the approver's id (null = nobody above you).
create or replace function public.ask_approval(p_text text, p_task uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  them uuid;
  who_en text;
  who_ar text;
  what text := btrim(coalesce(p_text, ''));
begin
  if me is null then raise exception 'Not signed in'; end if;
  if what = '' then raise exception 'Say what needs approving'; end if;
  if p_task is not null then
    select * into t from public.tasks where id = p_task;
    if t.id is not null and public.can_see_task(p_task) then
      them := public.task_other_side(t, me);
    end if;
  end if;
  if them is null or them = me then
    select manager_id into them from public.profiles where id = me;
  end if;
  if them is null then return null; end if;

  select split_part(p.full_name, ' ', 1), split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1)
    into who_en, who_ar from public.profiles p where p.id = me;
  insert into public.decisions (task_id, manager_id, requested_by, type, title, title_ar, details,
                                recommendation, recommendation_ar, recommendation_reason)
  values (
    t.id, them, me, 'approval_request',
    left(format('%s asks for your approval', who_en), 200),
    left(format('%s يطلب موافقتك', who_ar), 200),
    jsonb_build_object('asked_from', 'chat', 'text', left(what, 1000)),
    left(what, 500), left(what, 500), left(what, 1000)
  );
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, them, t.id, 'approval_asked', 'Asked for an approval', 'طلب موافقة', left(what, 300), false);
  return them;
end;
$$;
revoke all on function public.ask_approval(text, uuid) from public, anon;
grant execute on function public.ask_approval(text, uuid) to authenticated;
