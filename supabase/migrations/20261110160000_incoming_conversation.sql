-- Reviewer, 10 Nov: "already answered" must look in the same conversation by the tool's own id (Gmail thread, Google
-- Chat space), never by subject or header line. The reader stores it on each item.
alter table public.incoming_items add column if not exists conversation text;
create index if not exists incoming_items_conversation_idx on public.incoming_items (owner_id, conversation) where conversation is not null;

-- "I found tasks for you in your tools" (Nouran, 10 Nov: "I discovered it by chance"): an everyday alert, so quiet
-- hours, Friday and the daily budget apply, and it shows on the Alerts screen too (reviewer, 10 Nov)
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge', 'support_reply', 'idea_update', 'member_joined', 'added_to_company',
  'detail_asked', 'task_comment', 'kudos_received', 'tools_found'
));
