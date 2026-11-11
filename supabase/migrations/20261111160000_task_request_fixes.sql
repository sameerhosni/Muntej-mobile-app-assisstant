-- Reviewer, 11 Nov (Nouran's four items, pass 1):
--   found_request_settled  also keeps WHO answered and WHAT (taken / declined / withdrawn): her list shows «سمير أضافها ✓»
--                          / «سمير ما أخذها», never her own verbs, and no undo for something someone else made
--   answer_task_request_as WhatsApp answers as the seat the request went to (two company seats, R136)
--   neutral words          «طلب من فيصل: …», not «تطلب» (most of the team are men; profiles have no gender)
--   features               three new things, testers first (R69)

create or replace function public.found_request_settled(p_item uuid, p_index int, p_state text, p_task uuid, p_answer text default null, p_by uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.incoming_items i
     set suggestions = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
           i.suggestions, array[p_index::text, 'state'], to_jsonb(p_state)),
           array[p_index::text, 'task_id'], coalesce(to_jsonb(p_task), 'null'::jsonb)),
           array[p_index::text, 'request_answer'], coalesce(to_jsonb(p_answer), 'null'::jsonb)),
           array[p_index::text, 'answered_by'], coalesce(to_jsonb(p_by), 'null'::jsonb)),
         status = case when exists (select 1 from jsonb_array_elements(
                          jsonb_set(i.suggestions, array[p_index::text, 'state'], to_jsonb(p_state))) s where s ->> 'state' = 'new')
                       then 'new' else case when p_state = 'accepted' then 'done' else i.status end end
   where i.id = p_item and jsonb_array_length(i.suggestions) > p_index;
$$;
revoke all on function public.found_request_settled(uuid, int, text, uuid, text, uuid) from public, anon, authenticated;
drop function if exists public.found_request_settled(uuid, int, text, uuid);

create or replace function public.answer_task_request(p_decision uuid, p_ok boolean, p_owner uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  d public.decisions;
  det jsonb;
  task uuid;
  who text;
  who_ar text;
  ttl text;
begin
  select * into d from public.decisions where id = p_decision;
  if not found or d.type <> 'task_request' then
    raise exception 'Request not found';
  end if;
  if d.manager_id is distinct from me then
    raise exception 'Only the person it was sent to can answer it. القرار لللي وصله الطلب.';
  end if;
  if d.status <> 'pending' then
    return d.task_id;
  end if;
  det := coalesce(d.details, '{}'::jsonb);
  ttl := coalesce(det ->> 'title', d.title);
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1) into who, who_ar
    from public.profiles where id = me;

  if p_ok then
    task := public.create_task_with_plan(jsonb_build_object(
      'title', ttl,
      'owner_id', coalesce(p_owner, me),
      'source', 'text',
      'transcript', left(coalesce(det ->> 'quote', ''), 500),
      'followup_plan', '[]'::jsonb));
    update public.tasks set description = coalesce(description, det ->> 'description') where id = task;
  end if;

  if d.requested_by is not null then
    insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
    values (d.requested_by, 'request_answered', me, task,
            left(case when p_ok then format('✅ %s took on "%s"', who, ttl) else format('%s won''t take "%s" on now', who, ttl) end, 200),
            case when p_ok then 'I''ll tell you when it''s done.' else '' end,
            left(case when p_ok then format('✅ %s أضاف «%s»', who_ar, ttl) else format('%s ما أخذ «%s» الحين', who_ar, ttl) end, 200),
            case when p_ok then 'أقول لك لما تخلص.' else '' end,
            'answer:' || d.id)
    on conflict (dedupe_key) do nothing;
  end if;

  update public.decisions
     set status = case when p_ok then 'approved' else 'declined' end::public.decision_status,
         task_id = coalesce(task, task_id), resolved_by = me, resolved_at = now(),
         details = det || jsonb_build_object('answered_task', task)
   where id = d.id;

  if det ? 'item_id' then
    perform public.found_request_settled((det ->> 'item_id')::uuid, (det ->> 'index')::int,
      case when p_ok then 'accepted' else 'ignored' end, task, case when p_ok then 'taken' else 'declined' end, me);
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', me, coalesce(d.requested_by, me), task, case when p_ok then 'task_request_taken' else 'task_request_declined' end,
          format('%s "%s" (asked for in a message)', case when p_ok then 'Took on' else 'Declined' end, ttl),
          format('%s «%s» (طلب من رسالة)', case when p_ok then 'أضفت' else 'ما أخذت' end, ttl), false);
  return task;
end;
$$;

-- WhatsApp: as the seat the request went to (whichever company the person last opened in the app)
create or replace function public.answer_task_request_as(p_actor uuid, p_decision uuid, p_ok boolean, p_owner uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  acct uuid;
begin
  select user_id, account_id into uid, acct from public.profiles where id = p_actor;
  if uid is null then
    raise exception 'No signed-in user behind this profile';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('muntej.acting_account', acct::text, true);
  return public.answer_task_request(p_decision, p_ok, p_owner);
end;
$$;
revoke all on function public.answer_task_request_as(uuid, uuid, boolean, uuid) from public, anon, authenticated;

create or replace function public.withdraw_task_request(p_decision uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
begin
  select * into d from public.decisions where id = p_decision;
  if not found or d.type <> 'task_request' or d.requested_by is distinct from public.current_profile_id() then
    raise exception 'Request not found';
  end if;
  if d.status <> 'pending' then
    return;
  end if;
  update public.decisions set status = 'expired', resolved_by = d.requested_by, resolved_at = now(),
         details = coalesce(d.details, '{}'::jsonb) || jsonb_build_object('withdrawn', true)
   where id = d.id;
  update public.alerts set read_at = now() where profile_id = d.manager_id and kind = 'decision_waiting' and read_at is null
     and dedupe_key like '%' || d.id || '%';
  if d.details ? 'item_id' then
    perform public.found_request_settled((d.details ->> 'item_id')::uuid, (d.details ->> 'index')::int, 'ignored', null, 'withdrawn', d.requested_by);
  end if;
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', d.requested_by, d.manager_id, null, 'task_request_withdrawn',
          format('Withdrew the request "%s"', coalesce(d.details ->> 'title', d.title)),
          format('سحبت طلب «%s»', coalesce(d.details ->> 'title', d.title)), false);
end;
$$;

insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('ask_up_requests', 'all', now(), true, 'Asks you can''t give go to your manager',
   'اللي ما تقدر تعطيه، يروح لمديرك',
   'When you ask someone above you or in another team for something in a message, it goes to your manager as a request: they add it or not, and you''re told.',
   'لما تطلب في رسالة شي من أحد فوقك أو في فريق ثاني، يوصل لمديرك كطلب: يضيفه أو لا، وأقول لك.', -29),
  ('when_finished', 'all', now(), true, 'Choose what happens when a task is finished',
   'اختر وش يصير لما تخلص المهمة',
   'On the task page: «I review it» or «Closes by itself». Everyone sees what will happen.',
   'من صفحة المهمة: «أراجعها أنا» أو «تنقفل لحالها». والكل يشوف وش بيصير.', -30),
  ('meet_attended', 'all', now(), true, 'Tasks from meetings you only attend',
   'مهام من الاجتماعات اللي تحضرها بس',
   'Muntej can now read the transcript and Gemini notes of meetings someone else organised. Allow it once in Your tools → Google Meet.',
   'صار منتج يقرا محضر وملاحظات Gemini للاجتماعات اللي نظّمها غيرك. اسمح له مرة من أدواتك ← Google Meet.', -31)
on conflict (key) do nothing;
