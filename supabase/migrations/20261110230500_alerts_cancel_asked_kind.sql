-- QA, 10 Nov: the cancel request's own alert kind (cancel_asked) was refused by alerts_kind_check
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind = any (array[
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star', 'objective_achieved',
  'objective_at_risk', 'objective_missed', 'changed_for_you', 'task_assigned', 'new_submission', 'decision_waiting',
  'no_reply', 'escalated', 'tool_sync', 'new_feature', 'request_answered', 'ladder_nudge', 'support_reply', 'idea_update',
  'member_joined', 'added_to_company', 'detail_asked', 'task_comment', 'kudos_received', 'tools_found', 'cancel_asked'
]::text[]));