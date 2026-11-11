-- (task_request, part 2: the enum value from 20261111140000 must be committed before it's used)

-- the found task on the asker's list follows the request (incoming_items.suggestions[index])
create or replace function public.found_request_settled(p_item uuid, p_index int, p_state text, p_task uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.incoming_items i
     set suggestions = jsonb_set(
           jsonb_set(i.suggestions, array[p_index::text, 'state'], to_jsonb(p_state)),
           array[p_index::text, 'task_id'], coalesce(to_jsonb(p_task), 'null'::jsonb)),
         status = case when exists (select 1 from jsonb_array_elements(
                          jsonb_set(i.suggestions, array[p_index::text, 'state'], to_jsonb(p_state))) s where s ->> 'state' = 'new')
                       then 'new' else case when p_state = 'accepted' then 'done' else i.status end end
   where i.id = p_item and jsonb_array_length(i.suggestions) > p_index;
$$;
revoke all on function public.found_request_settled(uuid, int, text, uuid) from public, anon, authenticated;

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
    return d.task_id; -- already answered
  end if;
  det := coalesce(d.details, '{}'::jsonb);
  ttl := coalesce(det ->> 'title', d.title);
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1) into who, who_ar
    from public.profiles where id = me;

  if p_ok then
    -- theirs, or someone they may give it to (create_task_with_plan applies the assign rule as them)
    task := public.create_task_with_plan(jsonb_build_object(
      'title', ttl,
      'owner_id', coalesce(p_owner, me),
      'source', 'text',
      'transcript', left(coalesce(det ->> 'quote', ''), 500),
      'followup_plan', '[]'::jsonb));
    update public.tasks set description = coalesce(description, det ->> 'description') where id = task;
  end if;

  -- the asker hears it in words that fit (before the status change, so the generic «وافق» notice is not added too)
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
    perform public.found_request_settled((det ->> 'item_id')::uuid, (det ->> 'index')::int, case when p_ok then 'accepted' else 'ignored' end, task);
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', me, coalesce(d.requested_by, me), task, case when p_ok then 'task_request_taken' else 'task_request_declined' end,
          format('%s "%s" (asked for in a message)', case when p_ok then 'Took on' else 'Declined' end, ttl),
          format('%s «%s» (طلب من رسالة)', case when p_ok then 'أضفت' else 'ما أخذت' end, ttl), false);
  return task;
end;
$$;
revoke all on function public.answer_task_request(uuid, boolean, uuid) from public, anon;
grant execute on function public.answer_task_request(uuid, boolean, uuid) to authenticated;

-- the asker takes it back while it waits
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
  update public.decisions set status = 'expired', resolved_by = d.requested_by, resolved_at = now() where id = d.id;
  update public.alerts set read_at = now() where profile_id = d.manager_id and kind = 'decision_waiting' and read_at is null
     and dedupe_key like '%' || d.id || '%';
  if d.details ? 'item_id' then
    perform public.found_request_settled((d.details ->> 'item_id')::uuid, (d.details ->> 'index')::int, 'ignored', null);
  end if;
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', d.requested_by, d.manager_id, null, 'task_request_withdrawn',
          format('Withdrew the request "%s"', coalesce(d.details ->> 'title', d.title)),
          format('سحبت طلب «%s»', coalesce(d.details ->> 'title', d.title)), false);
end;
$$;
revoke all on function public.withdraw_task_request(uuid) from public, anon;
grant execute on function public.withdraw_task_request(uuid) to authenticated;

-- when the task it became is done, whoever asked hears it
create or replace function public.tell_asker_when_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    for d in select id, requested_by from public.decisions
              where task_id = new.id and type = 'task_request' and status = 'approved' and requested_by is not null loop
      insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
      values (d.requested_by, 'request_answered', new.owner_id, new.id,
              left(format('✅ Done: "%s" (you asked for it)', new.title), 200), '',
              left(format('✅ خلصت: «%s» (اللي طلبتها)', new.title), 200), '',
              'request_done:' || d.id)
      on conflict (dedupe_key) do nothing;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists tell_asker_when_done on public.tasks;
create trigger tell_asker_when_done after update of status on public.tasks for each row execute function public.tell_asker_when_done();
