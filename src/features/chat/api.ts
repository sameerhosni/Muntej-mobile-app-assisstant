import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Task, TaskPriority, TaskStatus } from '@/lib/api';
import { toError } from '@/features/capture/api';

// chat_messages and the chat RPCs (cancel_task, delete_task) are not in the generated
// database types yet. The untyped client stays inside this file; everything else uses the types below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type ChatSource = 'voice' | 'text';
export type ChatAction = 'none' | 'created' | 'updated' | 'cancelled' | 'deleted';
export type MissingItem = 'owner' | 'due' | 'definition_of_done' | 'budget';

/** Task card snapshot the muntej-chat function stores on an assistant message (action created/updated). */
export type TaskSnapshot = {
  id: string;
  title: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_reason: string | null;
  helper_name: string | null;
  due_at: string | null;
  priority: TaskPriority;
  definition_of_done: string | null;
  budget: string | null;
  status: TaskStatus;
  assigner_id?: string;
  missing: MissingItem[];
  /** the objective the task belongs to (title in the conversation language) */
  objective_id?: string | null;
  objective_title?: string | null;
  /** optional next steps, each a ready-to-send message */
  suggestions?: string[];
  /** the user asked to delete this task in the chat: show the delete confirmation */
  confirm_delete?: boolean;
  /** PROPOSAL: nothing has changed yet; the user must confirm proposed_patch */
  confirm_update?: boolean;
  proposed_patch?: ProposedPatch;
  proposed_owner_name?: string | null;
  /** title of proposed_patch.objective_id */
  proposed_objective_title?: string | null;
  /** the status was just changed in the chat: Undo (5 minutes) puts it back */
  undo_log_id?: string;
  /** hours of work, when known */
  estimate_hours?: number | null;
  /** Muntej's predicted finish when the card was made */
  prediction?: { at: string; confidence: number; late_days: number } | null;
};

/** Fields Muntej may propose to change on a described (not focused) task. */
export type ProposedPatch = {
  due_at?: string | null;
  owner_id?: string | null;
  helper_id?: string | null;
  priority?: TaskPriority;
  title?: string;
  definition_of_done?: string | null;
  budget?: string | null;
  goal?: string | null;
  /** link the task to this objective */
  objective_id?: string;
  /** take the task out of its objective */
  unlink_objective?: true;
};

/** A task that might be the one the user described (several fit). */
export type Candidate = { id: string; title: string; owner_name: string | null; due_at: string | null };

/** Assistant payload when several tasks fit: no id; the user picks one and the message is re-sent with that focus. */
export type CandidatesPayload = {
  id?: undefined;
  candidates: Candidate[];
  original_message: string;
  suggestions?: string[];
};

/** Patch for upsert_person (only the keys that change; id for an existing person). */
export type OrgPatch = Record<string, unknown> & { id?: string };

/** A team change Muntej proposes ("add Reem under Khalid", "Noura left"): nothing is saved until Confirm. */
export type OrgProposal = {
  op: 'add' | 'update' | 'move' | 'status';
  person_id: string | null;
  person_name: string;
  patch: OrgPatch;
  /** ready-made lines in the conversation language, e.g. "Manager: Ahmed → Maha" */
  summary_lines: string[];
};

export type OrgProposalPayload = { id?: undefined; suggestions?: undefined; org_proposal: OrgProposal };
/** Stored on the "Done" message after a confirmed team change. */
export type OrgDonePayload = { id?: undefined; suggestions?: undefined; org_done: { person_id: string; person_name: string } };

export type ObjectiveOp = 'create' | 'update' | 'cancel' | 'distribute';

/** Patch for upsert_objective (only the keys that change; empty for cancel / distribute). */
export type ObjectivePatch = {
  title?: string;
  title_ar?: string;
  description?: string;
  owner_id?: string;
  start_at?: string;
  due_at?: string;
};

/** An objective change Muntej proposes ("new objective: …", "move X to April", "spread X's tasks"): nothing is saved until Confirm. */
export type ObjectiveProposal = {
  op: ObjectiveOp;
  /** null only for create */
  objective_id: string | null;
  /** display title in the conversation language */
  title: string;
  patch: ObjectivePatch;
  /** ready-made lines in the conversation language, e.g. "Ends: Thu 5 Mar 2026 → Tue 31 Mar 2026" */
  summary_lines: string[];
};

export type ObjectiveProposalPayload = { id?: undefined; suggestions?: undefined; objective_proposal: ObjectiveProposal };
/** Stored on the "Done" message after a confirmed objective change (count = tasks spread, for distribute). */
export type ObjectiveDonePayload = {
  id?: undefined;
  suggestions?: undefined;
  objective_done: { objective_id: string; title: string; op: ObjectiveOp; count?: number };
};

/** The same change on many tasks ("mark all my tasks done"): nothing changes until Apply. */
export type BulkChange = {
  kind: 'status' | 'due' | 'priority' | 'owner' | 'cancel' | 'delete';
  status?: 'done' | 'in_progress' | 'blocked' | 'reopen';
  due_at?: string;
  priority?: TaskPriority;
  owner_id?: string;
};
export type BulkItem = {
  id: string;
  title: string;
  owner_name: string | null;
  due_at: string | null;
  status: string;
  /** what it becomes: done / submitted (review) / in_progress / blocked / cancelled / deleted, or unchanged status */
  to_status: string;
};
export type BulkProposal = { change: BulkChange; label: string; items: BulkItem[]; skipped: number; review: number };
export type BulkDone = {
  /** null when nothing can be undone (delete) */
  log_id: string | null;
  kind: BulkChange['kind'];
  ok: number;
  submitted: number;
  failed: { title: string | null; error: string }[];
  undo_until: string;
};

/** Fields of a new task Muntej held back to ask first (several people / looks like a duplicate). */
export type HeldTask = Record<string, unknown> & { title: string; owner_id: string | null };
export type PeopleChoice = { task: HeldTask; people: { id: string; name: string | null }[]; can_share: boolean };
export type Duplicate = {
  task: HeldTask;
  existing: { id: string; title: string; owner_name: string | null; due_at: string | null; status: string };
  /** what "Update the existing one" changes on it */
  patch: ProposedPatch;
};
export type CreatedItem = { id: string; title: string; owner_name: string | null; due_at: string | null };

/** A repeating schedule Muntej proposes ("standup every Monday 10:00"): nothing is saved until Confirm. */
export type RecurringProposal = {
  op: 'create' | 'update';
  recurring_id: string | null;
  title: string;
  patch: Record<string, unknown>;
  /** ready-made lines in the conversation language (schedule, owner, …) */
  summary_lines: string[];
};

type NoTask = { id?: undefined; suggestions?: undefined };
export type RecurringProposalPayload = NoTask & { recurring_proposal: RecurringProposal };
export type RecurringDonePayload = NoTask & { recurring_done: { id: string; title: string; next_due_at: string | null } };
export type BulkProposalPayload = NoTask & { bulk_proposal: BulkProposal };
export type BulkDonePayload = NoTask & { bulk_done: BulkDone };
export type UndoDonePayload = NoTask & { undo_done: { log_id: string } };
export type PeopleChoicePayload = NoTask & { people_choice: PeopleChoice };
export type DuplicatePayload = NoTask & { duplicate: Duplicate };
export type CreatedListPayload = NoTask & { created_list: CreatedItem[] };

export type ChatPayload =
  | TaskSnapshot
  | CandidatesPayload
  | OrgProposalPayload
  | OrgDonePayload
  | ObjectiveProposalPayload
  | ObjectiveDonePayload
  | BulkProposalPayload
  | BulkDonePayload
  | UndoDonePayload
  | PeopleChoicePayload
  | DuplicatePayload
  | CreatedListPayload
  | RecurringProposalPayload
  | RecurringDonePayload;

/** payload field of one card kind, or null */
export function payloadPart<
  K extends 'bulk_proposal' | 'bulk_done' | 'undo_done' | 'people_choice' | 'duplicate' | 'created_list' | 'recurring_proposal' | 'recurring_done',
>(
  p: ChatPayload | null | undefined,
  key: K,
): Extract<ChatPayload, Record<K, unknown>>[K] | null {
  if (!p || !(key in p)) return null;
  return ((p as Record<string, unknown>)[key] ?? null) as Extract<ChatPayload, Record<K, unknown>>[K] | null;
}

async function invokeChat(body: Record<string, unknown>): Promise<ChatMessage[]> {
  const { data, error } = await supabase.functions.invoke<{ messages: ChatMessage[] }>('muntej-chat', { body });
  if (error) throw await toError(error);
  return data?.messages ?? [];
}

/** Apply on a bulk preview: only the ticked tasks. Returns the stored result message. */
export function applyBulkChange(ids: string[], change: BulkChange, lang: 'en' | 'ar') {
  return invokeChat({ apply_bulk: { ids, change }, lang });
}

/** Confirm on a recurring card: saves the schedule (the first task may be created right away). */
export function confirmRecurring(recurringId: string | null, patch: Record<string, unknown>, lang: 'en' | 'ar') {
  return invokeChat({ apply_recurring: { recurring_id: recurringId, patch }, lang });
}

/** Undo a status / bulk change (the server allows 5 minutes). */
export function undoTaskChange(logId: string, lang: 'en' | 'ar') {
  return invokeChat({ undo_log_id: logId, lang });
}

/** A choice on a people / duplicate card: create without asking again. */
export function createHeldTask(
  task: HeldTask,
  opts: { owner_ids?: string[]; mode?: 'separate' | 'shared'; force?: boolean },
  lang: 'en' | 'ar',
) {
  return invokeChat({ apply_create: { task, ...opts }, lang });
}

export function objectiveProposal(p: ChatPayload | null | undefined): ObjectiveProposal | null {
  return p && 'objective_proposal' in p && p.objective_proposal ? p.objective_proposal : null;
}

export function objectiveDone(p: ChatPayload | null | undefined): ObjectiveDonePayload['objective_done'] | null {
  return p && 'objective_done' in p && p.objective_done ? p.objective_done : null;
}

export function isCandidates(p: ChatPayload | null | undefined): p is CandidatesPayload {
  return !!p && Array.isArray((p as CandidatesPayload).candidates);
}

export function orgProposal(p: ChatPayload | null | undefined): OrgProposal | null {
  return p && 'org_proposal' in p && p.org_proposal ? p.org_proposal : null;
}

export function orgDone(p: ChatPayload | null | undefined): OrgDonePayload['org_done'] | null {
  return p && 'org_done' in p && p.org_done ? p.org_done : null;
}

/** The task card snapshot on a message, if it has one. */
export function taskSnapshot(p: ChatPayload | null | undefined): TaskSnapshot | null {
  return p && !isCandidates(p) && typeof p.id === 'string' ? p : null;
}

export type ChatMessage = {
  id: string;
  profile_id: string;
  role: 'user' | 'assistant';
  content: string;
  task_id: string | null;
  action: ChatAction;
  payload: ChatPayload | null;
  created_at: string;
};

/** Current state of a task shown in the chat, so cards reflect edits/undo made after the snapshot. */
export type LiveTask = Pick<
  Task,
  'id' | 'title' | 'owner_id' | 'helper_id' | 'due_at' | 'priority' | 'definition_of_done' | 'budget' | 'goal' | 'status'
>;

export type LiveTaskRow = LiveTask & { assigner_id: string };
/** gone = task ids the chat mentions that no longer exist (deleted) */
export type ChatData = { messages: ChatMessage[]; tasks: Record<string, LiveTaskRow>; gone: string[] };

export const chatKey = ['chat'] as const;

async function fetchChat(): Promise<ChatData> {
  const { data, error } = await untyped
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  const messages = ((data ?? []) as ChatMessage[]).reverse();

  // payload.id survives a delete (task_id is set to null when the task row goes)
  const ids = [...new Set(messages.map((m) => taskSnapshot(m.payload)?.id ?? m.task_id).filter((x): x is string => !!x))];
  const tasks: Record<string, LiveTaskRow> = {};
  let gone: string[] = [];
  if (ids.length) {
    const res = await supabase
      .from('tasks')
      .select('id, title, owner_id, helper_id, assigner_id, due_at, priority, definition_of_done, budget, goal, status')
      .in('id', ids);
    // live state is a nice-to-have: the cards fall back to their snapshot if this fails
    if (!res.error) {
      for (const t of res.data) tasks[t.id] = t;
      gone = ids.filter((id) => !tasks[id]);
    }
  }
  return { messages, tasks, gone };
}

/** The signed-in person's chat with Muntej (last 60 messages, oldest first). */
export function useChat() {
  return useQuery({ queryKey: chatKey, queryFn: fetchChat });
}

/** Sends one message; returns the stored [user, assistant] rows.
 *  focusTaskId: the chat is locked on that task, so the server changes it directly. */
export async function sendChat(message: string, source: ChatSource, focusTaskId?: string | null): Promise<ChatMessage[]> {
  const { data, error } = await supabase.functions.invoke<{ messages: ChatMessage[] }>('muntej-chat', {
    body: focusTaskId ? { message, source, focus_task_id: focusTaskId } : { message, source },
  });
  if (error) throw await toError(error);
  return data?.messages ?? [];
}

/** Applies a proposed change the user confirmed; returns the one stored assistant row. */
export async function confirmChange(taskId: string, patch: ProposedPatch, lang: 'en' | 'ar'): Promise<ChatMessage[]> {
  const { data, error } = await supabase.functions.invoke<{ messages: ChatMessage[] }>('muntej-chat', {
    body: { apply: { task_id: taskId, patch }, lang },
  });
  if (error) throw await toError(error);
  return data?.messages ?? [];
}

/** Saves a team change the user confirmed (upsert_person runs as them and enforces permissions).
 *  Throws with the server's readable reason ("You can only change people in your own team"). */
export async function confirmOrg(patch: OrgPatch, lang: 'en' | 'ar'): Promise<ChatMessage[]> {
  const { data, error } = await supabase.functions.invoke<{ messages: ChatMessage[] }>('muntej-chat', {
    body: { apply_org: { patch }, lang },
  });
  if (error) throw await toError(error);
  return data?.messages ?? [];
}

/** Saves an objective change the user confirmed (upsert_objective / cancel_objective / distribute_tasks run as them).
 *  Throws with the server's readable reason ("Only the objective owner, its creator or their manager can change it"). */
export async function confirmObjective(
  op: ObjectiveOp,
  objectiveId: string | null,
  patch: ObjectivePatch,
  lang: 'en' | 'ar',
): Promise<ChatMessage[]> {
  const { data, error } = await supabase.functions.invoke<{ messages: ChatMessage[] }>('muntej-chat', {
    body: { apply_objective: { op, objective_id: objectiveId, patch }, lang },
  });
  if (error) throw await toError(error);
  return data?.messages ?? [];
}

/** Query keys whose data changes when an objective is saved (its tasks may be re-timed too). */
export function invalidateObjectiveData(qc: QueryClient) {
  return Promise.all([
    // same prefix as objectiveKeys.all in src/features/objectives/api.ts
    qc.invalidateQueries({ queryKey: ['objectives'] }),
    qc.invalidateQueries({ queryKey: ['tasks'] }),
    qc.invalidateQueries({ queryKey: ['homeStats'] }),
    qc.invalidateQueries({ queryKey: ['activity'] }),
  ]);
}

/** Query keys whose data changes when a team change is saved. */
export function invalidateTeamData(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['team'] }),
    qc.invalidateQueries({ queryKey: ['me'] }),
    qc.invalidateQueries({ queryKey: ['org'] }),
    qc.invalidateQueries({ queryKey: ['activity'] }),
  ]);
}

/** Puts freshly returned rows into the cache right away (before the refetch lands). */
export function appendToChat(qc: QueryClient, rows: ChatMessage[]) {
  qc.setQueryData<ChatData>(chatKey, (old) => {
    const known = new Set((old?.messages ?? []).map((m) => m.id));
    return {
      messages: [...(old?.messages ?? []), ...rows.filter((r) => !known.has(r.id))],
      tasks: old?.tasks ?? {},
      gone: old?.gone ?? [],
    };
  });
}

/** Mark a task done / reopen it (set_task_status). Done by its owner when someone else assigned it → 'submitted'
 *  (goes to that person for review); by the assigner, a manager above, or on a self-assigned task → 'done'. */
export async function setTaskStatus(taskId: string, status: 'done' | 'reopen' | 'in_progress' | 'blocked'): Promise<string> {
  const { data, error } = await untyped.rpc('set_task_status', { p_task: taskId, p_status: status });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Cancel: the task stays (status cancelled) and its pending follow-ups stop. */
export async function cancelTask(taskId: string): Promise<void> {
  const { error } = await untyped.rpc('cancel_task', { p_task: taskId });
  if (error) throw new Error(error.message);
}

/** Delete: removes the task for good (only its assigner or the owner's manager may). */
export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await untyped.rpc('delete_task', { p_task: taskId });
  if (error) throw new Error(error.message);
}

/** Query keys whose data changes when the chat creates, updates or cancels a task. */
export function invalidateTaskData(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['tasks'] }),
    qc.invalidateQueries({ queryKey: ['homeStats'] }),
    qc.invalidateQueries({ queryKey: ['activity'] }),
  ]);
}

/** What a card shows: the snapshot, overridden by the task's live state when we have it. */
export type CardTask = {
  id: string;
  title: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_reason: string | null;
  helper_id: string | null;
  helper_name: string | null;
  due_at: string | null;
  priority: TaskPriority;
  definition_of_done: string | null;
  budget: string | null;
  goal: string | null;
  status: TaskStatus;
  assigner_id: string | null;
  missing: MissingItem[];
};

export function mergeTask(snap: TaskSnapshot, live?: LiveTaskRow): CardTask {
  if (!live) return { ...snap, helper_id: null, goal: null, assigner_id: snap.assigner_id ?? null };
  const sameOwner = live.owner_id === snap.owner_id;
  const missing: MissingItem[] = [];
  if (!live.owner_id) missing.push('owner');
  if (!live.due_at) missing.push('due');
  if (!live.definition_of_done) missing.push('definition_of_done');
  if (!live.budget) missing.push('budget');
  return {
    id: snap.id,
    title: live.title,
    owner_id: live.owner_id,
    owner_name: sameOwner ? snap.owner_name : null,
    owner_reason: sameOwner ? snap.owner_reason : null,
    helper_id: live.helper_id,
    helper_name: live.helper_id ? snap.helper_name : null,
    due_at: live.due_at,
    priority: live.priority,
    definition_of_done: live.definition_of_done,
    budget: live.budget,
    goal: live.goal,
    status: live.status,
    assigner_id: live.assigner_id,
    missing,
  };
}
