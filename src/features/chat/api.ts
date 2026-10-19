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
  /** optional next steps, each a ready-to-send message */
  suggestions?: string[];
  /** the user asked to delete this task in the chat: show the delete confirmation */
  confirm_delete?: boolean;
  /** PROPOSAL: nothing has changed yet; the user must confirm proposed_patch */
  confirm_update?: boolean;
  proposed_patch?: ProposedPatch;
  proposed_owner_name?: string | null;
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

export type ChatPayload = TaskSnapshot | CandidatesPayload | OrgProposalPayload | OrgDonePayload;

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
