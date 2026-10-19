// Objectives data: list/detail queries (RLS-scoped) and mutations through the objective RPCs.
// Every mutation invalidates ['objectives'] and ['tasks'] (re-timing and linking change tasks too).
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTasks, type Profile, type Row, type TaskWithPeople } from '@/lib/api';
import type { Json } from '@/lib/api/database.types';

export type Objective = Row<'objectives'>;
export type ObjectiveStatus = Objective['status'];
export type ObjectiveWithOwner = Objective & {
  owner: Pick<Profile, 'id' | 'full_name' | 'full_name_ar' | 'avatar_color'> | null;
};

const OBJECTIVE_SELECT = '*, owner:profiles!objectives_owner_id_fkey(id, full_name, full_name_ar, avatar_color)';

export const objectiveKeys = {
  all: ['objectives'] as const,
  list: ['objectives', 'list'] as const,
  one: (id: string) => ['objectives', 'one', id] as const,
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Every objective the user may see, soonest due first. */
export function useObjectives() {
  return useQuery({
    queryKey: objectiveKeys.list,
    queryFn: async (): Promise<ObjectiveWithOwner[]> =>
      unwrap(await supabase.from('objectives').select(OBJECTIVE_SELECT).order('due_at', { ascending: true })) as unknown as ObjectiveWithOwner[],
  });
}

/** One objective plus its linked tasks (taken from the shared tasks query so rows stay in sync everywhere). */
export function useObjective(id: string | undefined) {
  const objective = useQuery({
    queryKey: objectiveKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<ObjectiveWithOwner | null> =>
      unwrap(await supabase.from('objectives').select(OBJECTIVE_SELECT).eq('id', id!).maybeSingle()) as unknown as ObjectiveWithOwner | null,
  });
  const tasks = useTasks();
  const linked = useMemo<TaskWithPeople[]>(() => (tasks.data ?? []).filter((t) => t.objective_id === id), [tasks.data, id]);
  return {
    objective,
    tasks,
    data: objective.data ?? null,
    linked,
    isLoading: objective.isLoading || tasks.isLoading,
  };
}

/** id → objective, for the small chip on task rows (shares the list query, so it's one request app-wide). */
export function useObjectiveIndex() {
  const q = useObjectives();
  return useMemo(() => new Map((q.data ?? []).map((o) => [o.id, o])), [q.data]);
}

export function objectiveTitle(o: Pick<Objective, 'title' | 'title_ar'>, lang: string) {
  return lang === 'ar' && o.title_ar ? o.title_ar : o.title;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: objectiveKeys.all }), qc.invalidateQueries({ queryKey: ['tasks'] })]);
}

/** Create (no id) or update (id) — only the keys present change. Changing dates re-times open tasks server-side. */
export type ObjectivePayload = {
  id?: string;
  title?: string;
  title_ar?: string | null;
  description?: string | null;
  owner_id?: string | null;
  start_at?: string;
  due_at?: string;
};

export function useUpsertObjective() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: ObjectivePayload): Promise<string> =>
      unwrap(await supabase.rpc('upsert_objective', { p: p as unknown as Json })),
    onSuccess: invalidate,
  });
}

/** Link a task to an objective, or unlink it (objectiveId null). */
export function useLinkTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ taskId, objectiveId }: { taskId: string; objectiveId: string | null }) => {
      // the generated Args type says string, but the RPC takes null to unlink
      const { error } = await supabase.rpc('link_task', { p_task: taskId, p_objective: objectiveId as string });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Spread the objective's open tasks evenly inside its window; returns how many moved. */
export function useDistributeTasks() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (objectiveId: string): Promise<number> =>
      unwrap(await supabase.rpc('distribute_tasks', { p_objective: objectiveId })),
    onSuccess: invalidate,
  });
}

export function useCancelObjective() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (objectiveId: string) => {
      const { error } = await supabase.rpc('cancel_objective', { p_objective: objectiveId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
