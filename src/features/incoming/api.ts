// Incoming: messages from other tools that Muntej read and turned into task suggestions (table incoming_items,
// written only by the intake Edge Function). The person accepts, edits or ignores each suggestion.
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import i18n from '@/lib/i18n';
import { NS } from './strings';
import { toError } from '@/features/capture/api';
import { invalidateTaskData } from '@/features/chat/api';

// incoming_items isn't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type Suggestion = {
  title: string;
  owner_id: string | null;
  /** who the message says should do it, as written, when they aren't on the team ("Mohammed Nabulsi") */
  owner_name?: string | null;
  /** who asked for it (name as written), when Saree3 could tell */
  requested_by?: string | null;
  due_at: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  definition_of_done: string | null;
  /** the details the message gave (older suggestions don't have them) */
  description?: string | null;
  proof_required?: 'none' | 'any' | 'file' | 'image' | 'link';
  budget?: string | null;
  estimate_hours: number | null;
  confidence: number;
  quote: string;
  duplicate_of: { id: string; title: string } | null;
  /** filtered: Saree3's own check dropped it (stale, already done, your own update…): never shown */
  state: 'new' | 'accepted' | 'ignored' | 'filtered';
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
  let res = await supabase.functions.invoke<T>('intake', { body });
  // the app sat in the background and its sign-in token ran out: refresh it and try once more (the gateway's 401
  // carries no message of ours, so the person only saw "non-2xx status code")
  if (res.error instanceof FunctionsHttpError && res.error.context?.status === 401) {
    await supabase.auth.refreshSession();
    res = await supabase.functions.invoke<T>('intake', { body });
  }
  if (res.error) {
    const status = res.error instanceof FunctionsHttpError ? (res.error.context?.status as number | undefined) : undefined;
    const err = await toError(res.error);
    if (status === 401) throw new Error(i18n.t(`${NS}.errSession`));
    if (/non-2xx/i.test(err.message)) throw new Error(i18n.t(`${NS}.errServer`));
    throw err;
  }
  return res.data as T;
}

/** several messages at a time, so a long list doesn't crawl */
const AT_ONCE = 5;

/** The incoming actions; each refreshes the list (and tasks when one was created). */
export function useIncomingActions() {
  const qc = useQueryClient();
  const done = async (tasks = false) => {
    await qc.invalidateQueries({ queryKey: KEY });
    if (tasks) await invalidateTaskData(qc);
  };
  // off the list the moment it's decided (owner, 5 Nov: "any task deleted remove it directly"); a failure refreshes it back
  const hide = (id: string, index?: number) => {
    const without = (list: IncomingItem[]) =>
      list.flatMap((it) => {
        if (it.id !== id) return [it];
        if (index === undefined) return [];
        const suggestions = it.suggestions.map((s, i) => (i === index ? { ...s, state: 'ignored' as const } : s));
        return suggestions.some((s) => s.state === 'new') ? [{ ...it, suggestions }] : [];
      });
    const update = (old: unknown) => {
      if (Array.isArray(old)) return without(old as IncomingItem[]);
      const pages = (old as { pages?: IncomingItem[][] } | undefined)?.pages;
      return pages ? { ...(old as object), pages: pages.map(without) } : old;
    };
    qc.setQueriesData({ queryKey: KEY }, update);
  };
  /** each message: off the list, then done on the server; onProgress counts them */
  const everything = async (ids: string[], one: (id: string) => Promise<unknown>, onProgress?: (done: number, total: number) => void) => {
    let finished = 0;
    onProgress?.(0, ids.length);
    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        hide(id);
        await one(id);
        onProgress?.(++finished, ids.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, ids.length) }, worker));
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
    /** every waiting message at once: add all their tasks / ignore them all (one refresh at the end) */
    acceptEverything: async (ids: string[], onProgress?: (done: number, total: number) => void) => {
      try {
        await everything(ids, (id) => call({ action: 'accept_all', id }), onProgress);
      } finally {
        await done(true);
      }
    },
    ignoreEverything: async (ids: string[], onProgress?: (done: number, total: number) => void) => {
      try {
        await everything(ids, (id) => call({ action: 'ignore', id }), onProgress);
      } finally {
        await done();
      }
    },
    ignore: async (id: string, index?: number) => {
      hide(id, index);
      try {
        await call({ action: 'ignore', id, index });
      } finally {
        await done();
      }
    },
    /** a person was just added to the team: this task goes to them */
    setOwner: async (id: string, index: number, ownerId: string) => {
      await call({ action: 'set_owner', id, index, owner_id: ownerId });
      await done();
    },
    /** the email of someone a message names, from the message or the connected mailbox; null when not found */
    findEmail: (id: string, index: number) => call<{ email: string | null; from: 'message' | 'mailbox' | null }>({ action: 'find_email', id, index }),
  };
}
