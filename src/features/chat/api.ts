import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Task, TaskPriority, TaskStatus } from '@/lib/api';
import { toError } from '@/features/capture/api';

// chat_messages and the chat RPCs (update_task_from_chat, undo_chat_task) are not in the generated
// database types yet. The untyped client stays inside this file; everything else uses the types below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type ChatSource = 'voice' | 'text';
export type ChatAction = 'none' | 'created' | 'updated' | 'undone';
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
  missing: MissingItem[];
};

export type ChatMessage = {
  id: string;
  profile_id: string;
  role: 'user' | 'assistant';
  content: string;
  task_id: string | null;
  action: ChatAction;
  payload: TaskSnapshot | null;
  created_at: string;
};

/** Current state of a task shown in the chat, so cards reflect edits/undo made after the snapshot. */
export type LiveTask = Pick<
  Task,
  'id' | 'title' | 'owner_id' | 'helper_id' | 'due_at' | 'priority' | 'definition_of_done' | 'budget' | 'goal' | 'status'
>;

export type ChatData = { messages: ChatMessage[]; tasks: Record<string, LiveTask> };

export const chatKey = ['chat'] as const;

/** Fields update_task_from_chat accepts. */
export type TaskPatch = Partial<
  Pick<LiveTask, 'title' | 'owner_id' | 'helper_id' | 'due_at' | 'priority' | 'definition_of_done' | 'budget' | 'goal'>
>;

async function fetchChat(): Promise<ChatData> {
  const { data, error } = await untyped
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  const messages = ((data ?? []) as ChatMessage[]).reverse();

  const ids = [...new Set(messages.map((m) => m.task_id).filter((x): x is string => !!x))];
  const tasks: Record<string, LiveTask> = {};
  if (ids.length) {
    const res = await supabase
      .from('tasks')
      .select('id, title, owner_id, helper_id, due_at, priority, definition_of_done, budget, goal, status')
      .in('id', ids);
    // live state is a nice-to-have: the cards fall back to their snapshot if this fails
    if (!res.error) for (const t of res.data) tasks[t.id] = t;
  }
  return { messages, tasks };
}

/** The signed-in person's chat with Muntej (last 60 messages, oldest first). */
export function useChat() {
  return useQuery({ queryKey: chatKey, queryFn: fetchChat });
}

/** Sends one message; returns the stored [user, assistant] rows. */
export async function sendChat(message: string, source: ChatSource): Promise<ChatMessage[]> {
  const { data, error } = await supabase.functions.invoke<{ messages: ChatMessage[] }>('muntej-chat', {
    body: { message, source },
  });
  if (error) throw await toError(error);
  return data?.messages ?? [];
}

/** Puts freshly returned rows into the cache right away (before the refetch lands). */
export function appendToChat(qc: QueryClient, rows: ChatMessage[]) {
  qc.setQueryData<ChatData>(chatKey, (old) => {
    const known = new Set((old?.messages ?? []).map((m) => m.id));
    return {
      messages: [...(old?.messages ?? []), ...rows.filter((r) => !known.has(r.id))],
      tasks: old?.tasks ?? {},
    };
  });
}

/** "Undo" on a task card: cancels the task and its pending follow-ups (nothing is deleted). */
export async function undoChatTask(taskId: string): Promise<void> {
  const { error } = await untyped.rpc('undo_chat_task', { p_task: taskId });
  if (error) throw new Error(error.message);
}

export async function updateTaskFromChat(taskId: string, patch: TaskPatch): Promise<void> {
  const { error } = await untyped.rpc('update_task_from_chat', { p_task: taskId, patch });
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
  missing: MissingItem[];
};

export function mergeTask(snap: TaskSnapshot, live?: LiveTask): CardTask {
  if (!live) return { ...snap, helper_id: null, goal: null };
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
    missing,
  };
}
