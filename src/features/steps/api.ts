// Steps (subtasks): add (typed, pasted list, spoken), change, remove, Muntej's suggested breakdown, and "my steps"
// (steps given to me, even on tasks I can't otherwise open). Server: supabase/migrations/20261021180000_steps.sql +
// Edge Function suggest-steps.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toError } from '@/features/capture/api';
import { featureUsed } from '@/features/launch/launch';

export type Step = {
  id: string;
  task_id: string;
  title: string;
  owner_id: string | null;
  done: boolean;
  position: number;
  due_at?: string | null;
};
export type Suggestion = { steps: string[]; source: 'ai' | 'last_time'; like_task_title: string | null };
export type ParsedStep = { title: string; owner_id: string | null; due_at: string | null };
export type MyStep = { id: string; task_id: string; task_title: string; title: string; due_at: string | null; done: boolean };

// new step columns / RPCs aren't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

async function fn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('suggest-steps', { body });
  if (error) throw await toError(error);
  return data as T;
}

/** Muntej's breakdown for a task (asked once, then kept on the server) */
export function useStepSuggestion(taskId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['stepSuggest', taskId],
    enabled: !!taskId && enabled,
    queryFn: () => fn<Suggestion>({ action: 'suggest', task_id: taskId }),
    staleTime: Infinity,
    retry: 1,
  });
}

export function useMySteps() {
  return useQuery({
    queryKey: ['mySteps'],
    queryFn: async (): Promise<MyStep[]> => {
      const { data, error } = await untyped.rpc('my_steps');
      if (error) throw new Error(error.message);
      return (data ?? []) as MyStep[];
    },
  });
}

export function useStepActions() {
  const qc = useQueryClient();
  const refresh = async () => {
    await Promise.all(['task', 'tasks', 'mySteps'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await untyped.rpc(name, args);
    if (error) throw new Error(error.message);
  };
  return {
    add: async (taskId: string, titles: string[], owner: string | null = null, due: string | null = null) => {
      const clean = titles.map((x) => x.replace(/^\s*([-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      if (!clean.length) return;
      await rpc('add_steps', { p_task: taskId, p_titles: clean, p_owner: owner, p_due: due });
      featureUsed('steps');
      await refresh();
    },
    set: async (id: string, patch: { title?: string; owner_id?: string | null; due_at?: string | null }) => {
      const p: Record<string, unknown> = {};
      if (patch.title !== undefined) p.title = patch.title;
      if (patch.owner_id !== undefined) p.owner_id = patch.owner_id ?? '';
      if (patch.due_at !== undefined) p.due_at = patch.due_at ?? '';
      await rpc('set_step', { p_id: id, p });
      await refresh();
    },
    remove: async (id: string) => {
      const { error } = await untyped.from('subtasks').delete().eq('id', id);
      if (error) throw new Error(error.message);
      await refresh();
    },
    tick: async (id: string, done: boolean) => {
      const { error } = await untyped.from('subtasks').update({ done }).eq('id', id);
      if (error) throw new Error(error.message);
      await refresh();
    },
    /** a step given to me on a task I may not be able to open */
    tickMine: async (id: string) => {
      await rpc('tick_my_step', { p_id: id, p_done: true });
      await refresh();
    },
    parse: (taskId: string, text: string) => fn<{ steps: ParsedStep[] }>({ action: 'parse', task_id: taskId, text }),
  };
}

/** 17:00 Riyadh, `days` days from today (Fri/Sat skipped) */
export function dueIn(days: number): string {
  const d = new Date(Date.now() + 3 * 3_600_000);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 5 && d.getUTCDay() !== 6) left--;
  }
  d.setUTCHours(17 - 3, 0, 0, 0);
  return d.toISOString();
}
