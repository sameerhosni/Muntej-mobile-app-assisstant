// Incoming: messages from other tools that Muntej read and turned into task suggestions (table incoming_items,
// written only by the intake Edge Function). The person accepts, edits or ignores each suggestion.
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toError } from '@/features/capture/api';
import { invalidateTaskData } from '@/features/chat/api';

// incoming_items isn't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type Suggestion = {
  title: string;
  owner_id: string | null;
  due_at: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  definition_of_done: string | null;
  estimate_hours: number | null;
  confidence: number;
  quote: string;
  duplicate_of: { id: string; title: string } | null;
  state: 'new' | 'accepted' | 'ignored';
  task_id: string | null;
  /** added by Muntej without asking (it was sure) */
  auto?: boolean;
};

export type IncomingItem = {
  id: string;
  source: 'paste' | 'share' | 'email' | 'whatsapp' | 'teams' | 'slack' | 'jira';
  sender: string | null;
  subject: string | null;
  body: string;
  summary: string | null;
  received_at: string;
  status: 'new' | 'done' | 'ignored' | 'nothing';
  suggestions: Suggestion[];
  duplicate_message?: boolean;
};

export type SuggestionEdit = { title?: string; owner_id?: string | null; due_at?: string | null };

const KEY = ['incoming'] as const;

/** Items still waiting for a decision, newest first (RLS: your own). */
export function useIncoming() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<IncomingItem[]> => {
      const { data, error } = await untyped
        .from('incoming_items')
        .select('id, source, sender, subject, body, summary, received_at, status, suggestions')
        .eq('status', 'new')
        .order('received_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as IncomingItem[];
    },
  });
}

/** The Tasks from email list by date and time (newest or oldest first), 10 messages a page ("Show more" loads the next 10). */
export const PAGE = 10;
export function useIncomingPages(newestFirst = true) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'pages', newestFirst],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<IncomingItem[]> => {
      const { data, error } = await untyped
        .from('incoming_items')
        .select('id, source, sender, subject, body, summary, received_at, status, suggestions')
        .eq('status', 'new')
        .order('received_at', { ascending: !newestFirst })
        .order('id', { ascending: !newestFirst })
        .range(pageParam, pageParam + PAGE - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as IncomingItem[];
    },
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length * PAGE),
  });
}

/** messages Muntej read since `since` (Check my email shows it counting up) */
export async function readSince(since: string): Promise<number> {
  const { count } = await untyped.from('incoming_items').select('id', { count: 'exact', head: true }).gte('created_at', since);
  return count ?? 0;
}

/** How many task suggestions are waiting (for the Home row). */
export function useIncomingCount() {
  const q = useIncoming();
  const items = q.data ?? [];
  return { items, count: items.reduce((n, it) => n + it.suggestions.filter((s) => s.state === 'new').length, 0) };
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('intake', { body });
  if (error) throw await toError(error);
  return data as T;
}

/** The incoming actions; each refreshes the list (and tasks when one was created). */
export function useIncomingActions() {
  const qc = useQueryClient();
  const done = async (tasks = false) => {
    await qc.invalidateQueries({ queryKey: KEY });
    if (tasks) await invalidateTaskData(qc);
  };
  return {
    ingest: async (text: string, source: 'paste' | 'share' | 'meeting' = 'paste', subject?: string) => {
      const item = await call<IncomingItem>({ action: 'ingest', text, source, subject });
      await done();
      return item;
    },
    accept: async (id: string, index: number, edit?: SuggestionEdit) => {
      await call({ action: 'accept', id, index, edit });
      await done(true);
    },
    acceptAll: async (id: string) => {
      await call({ action: 'accept_all', id });
      await done(true);
    },
    ignore: async (id: string, index?: number) => {
      await call({ action: 'ignore', id, index });
      await done();
    },
  };
}
