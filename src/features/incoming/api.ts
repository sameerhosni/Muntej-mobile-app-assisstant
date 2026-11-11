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
  /** requested: sent to your manager to decide (someone you can't give work to directly, owner 11 Nov) */
  state: 'new' | 'accepted' | 'ignored' | 'filtered' | 'requested';
  request_id?: string;
  request_to?: string;
  /** how the request ended: the manager took it on / declined it, or she withdrew it (and who) */
  request_answer?: 'taken' | 'declined' | 'withdrawn' | null;
  answered_by?: string | null;
  task_id: string | null;
  /** added by Muntej without asking (it was sure) */
  auto?: boolean;
  /** «خلصتها قبل»: added as already done */
  done_before?: boolean;
  /** how it closed: 'done', or 'submitted' (gone to the manager to approve) */
  done_status?: string;
};

/** a found task's new choices (already done, a date in Edit, «رجّعها»): testers first (feature found_task_choices) */
export function useFoundChoicesOn() {
  return (
    useQuery({
      queryKey: ['featureOn', 'found_task_choices'],
      queryFn: async () => (await supabase.rpc('feature_on' as never, { p_key: 'found_task_choices' } as never)).data === true,
      staleTime: 5 * 60_000,
    }).data === true
  );
}

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
/** how long «تجاهلتها · رجّعها» stays on a card (the same 6 seconds as a cancelled task) */
export const UNDO_MS = 6000;

/** what you ignored in the last 7 days, to bring one back (owner, 11 Nov) */
export function useHandledIgnored(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'handled'],
    enabled,
    queryFn: async (): Promise<IncomingItem[]> => {
      const { data, error } = await untyped
        .from('incoming_items')
        .select('id, source, sender, subject, body, summary, received_at, status, suggestions')
        // a message with one task ignored and another added is 'done' (reviewer, 11 Nov)
        .in('status', ['ignored', 'done'])
        .gte('decided_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
        .order('decided_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      // (and what went to your manager as a request, to follow it)
      return ((data ?? []) as IncomingItem[]).filter((it) => it.suggestions.some((s) => s.state === 'ignored' || s.state === 'requested'));
    },
  });
}

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
    // (the handled list too: KEY is its prefix)
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
  // the row reads «تجاهلتها · رجّعها» while the 6 seconds run
  const markIgnored = (id: string, index: number) => {
    const mark = (list: IncomingItem[]) =>
      list.map((it) => (it.id !== id ? it : { ...it, suggestions: it.suggestions.map((s, i) => (i === index ? { ...s, state: 'ignored' as const } : s)) }));
    qc.setQueriesData({ queryKey: KEY }, (old: unknown) => {
      if (Array.isArray(old)) return mark(old as IncomingItem[]);
      const pages = (old as { pages?: IncomingItem[][] } | undefined)?.pages;
      return pages ? { ...(old as object), pages: pages.map(mark) } : old;
    });
  };
  // the item as the server saved it stays on the card for 6 seconds (its «رجّعها»), then the list catches up
  const keepOnCard = (saved: IncomingItem, tasks: boolean) => {
    const put = (list: IncomingItem[]) => list.map((it) => (it.id === saved.id ? { ...it, suggestions: saved.suggestions } : it));
    qc.setQueriesData({ queryKey: KEY }, (old: unknown) => {
      if (Array.isArray(old)) return put(old as IncomingItem[]);
      const pages = (old as { pages?: IncomingItem[][] } | undefined)?.pages;
      return pages ? { ...(old as object), pages: pages.map(put) } : old;
    });
    if (tasks) void invalidateTaskData(qc);
    setTimeout(() => void done(), UNDO_MS);
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
    accept: async (id: string, index: number, edit?: SuggestionEdit, keep = false) => {
      const saved = await call<IncomingItem>({ action: 'accept', id, index, edit });
      // with the new choices on: «أضيفت · رجّعها» stays on the card for 6 seconds (owner, 11 Nov); sent to the manager
      // as a request: «أرسلتها لـX يقرر» stays too, for everyone
      if (saved && (keep || saved.suggestions[index]?.state === 'requested')) keepOnCard(saved, true);
      else await done(true);
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
    ignore: async (id: string, index?: number, keep = false) => {
      // one task, with the new choices on: it stays on the card as «تجاهلتها · رجّعها» for 6 seconds, then leaves (owner,
      // 11 Nov); otherwise (and a whole message) it leaves at once
      const stay = keep && index !== undefined;
      if (stay) markIgnored(id, index);
      else hide(id, index);
      try {
        await call({ action: 'ignore', id, index });
      } finally {
        if (stay) setTimeout(() => void done(), UNDO_MS);
        else await done();
      }
    },
    /** «رجّعها»: an ignored task back in the list */
    restore: async (id: string, index: number) => {
      await call({ action: 'restore', id, index });
      await done();
    },
    /** «خلصتها قبل»: on the record as done, nothing to follow up */
    doneBefore: async (id: string, index: number) => {
      const saved = await call<IncomingItem>({ action: 'done_before', id, index });
      keepOnCard(saved, true);
    },
    /** «رجّعها» after Add / «خلصتها قبل»: only that tap, within 5 minutes, untouched since (else the server says moved_on) */
    /** «اسحب الطلب»: take back a request while the manager hasn't answered */
    withdraw: async (requestId: string) => {
      const { error } = await untyped.rpc('withdraw_task_request', { p_decision: requestId });
      if (error) throw new Error(error.message);
      await done();
    },
    undoFound: async (id: string, index: number) => {
      await call({ action: 'undo_found', id, index });
      await done(true);
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
