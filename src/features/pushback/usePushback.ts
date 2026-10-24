// Polite Pushback data: my week's load from live tasks (fallback = design demo) and the LIVE priority question
// insert into `decisions` (RLS allows requested_by = me) so it lands in my manager's Decisions screen.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ACTIVE_STATUSES, useMyProfile, useTasks, useTeam, type Profile, type TaskPriority, type TaskWithPeople } from '@/lib/api';
import type { Json } from '@/lib/api/database.types';

const DAY_MS = 86_400_000;
/** Hours assumed for a task with no estimate. */
const DEFAULT_ESTIMATE = 4;

export type LoadItem = { key: string; label: string | null; hours: number };

export type PushbackModel = {
  live: boolean;
  meName: string | null;
  managerName: string | null;
  managerId: string | null;
  newTask: { id: string | null; title: string | null; dueAt: string | null; priority: TaskPriority; hours: number };
  /** Top task, second task, remainder (label null = "Other"). */
  items: LoadItem[];
  loadHours: number;
  total: number;
  capacity: number;
  topTitle: string | null;
  slipDays: number;
};

const remaining = (t: TaskWithPeople) =>
  Math.round((t.estimate_hours ?? DEFAULT_ESTIMATE) * (1 - Math.min(100, Math.max(0, t.progress)) / 100));

const nameOf = (p: Pick<Profile, 'full_name' | 'full_name_ar'> | null | undefined, lang: string) => {
  if (!p) return null;
  const full = lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name;
  return full.split(' ')[0];
};

/** Demo from the Pushback design: 22 + 10 + 6 + new 8 = 46 / 40 h, SPL slips 2 days. */
const DEMO: PushbackModel = {
  live: false,
  meName: null,
  managerName: null,
  managerId: null,
  newTask: { id: null, title: null, dueAt: null, priority: 'medium', hours: 8 },
  items: [
    { key: 'top', label: null, hours: 22 },
    { key: 'second', label: null, hours: 10 },
    { key: 'rest', label: null, hours: 6 },
  ],
  loadHours: 38,
  total: 46,
  capacity: 40,
  topTitle: null,
  slipDays: 2,
};

/** taskId: the task opened from its own page ("Too busy?"); otherwise the newest one */
export function usePushbackModel(lang: string, taskId?: string) {
  const me = useMyProfile();
  const team = useTeam();
  const tasks = useTasks({ ownerId: me.data?.id });
  // what I already asked my manager about: a task is never offered twice (sending again made duplicate requests)
  const asked = useQuery({
    queryKey: ['pushbackAsked', me.data?.id],
    enabled: !!me.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decisions')
        .select('id, task_id, status')
        .eq('requested_by', me.data!.id)
        .eq('type', 'priority_question')
        .neq('status', 'expired')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const m = new Map<string, string>();
      for (const d of data ?? []) if (d.task_id && !m.has(d.task_id)) m.set(d.task_id, d.id);
      return m;
    },
  });

  const model = useMemo((): PushbackModel => {
    const profile = me.data;
    const managerProfile = team.data?.find((p) => p.id === profile?.manager_id) ?? null;
    const base = {
      meName: nameOf(profile, lang),
      managerId: profile?.manager_id ?? null,
      managerName: nameOf(managerProfile, lang),
    };
    const now = Date.now();
    const active = (tasks.data ?? []).filter((t) => t.owner_id === profile?.id && ACTIVE_STATUSES.includes(t.status));
    if (!profile || active.length === 0) return { ...DEMO, ...base };

    // the task opened from its page; else the newest one I haven't asked about yet (all asked → the newest, shown as sent)
    const byNewest = [...active].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const newest = active.find((t) => t.id === taskId) ?? byNewest.find((t) => !asked.data?.has(t.id)) ?? byNewest[0];
    const thisWeek = active
      .filter((t) => t.id !== newest.id)
      .filter((t) => !t.due_at || new Date(t.due_at).getTime() <= now + 7 * DAY_MS)
      .map((t) => ({ task: t, hours: remaining(t) }))
      .filter((x) => x.hours > 0)
      .sort((a, b) => b.hours - a.hours);

    const [top, second, ...rest] = thisWeek;
    const items: LoadItem[] = [];
    if (top) items.push({ key: top.task.id, label: top.task.title, hours: top.hours });
    if (second && rest.length === 0) items.push({ key: second.task.id, label: second.task.title, hours: second.hours });
    else if (second) items.push({ key: 'rest', label: null, hours: [second, ...rest].reduce((s, x) => s + x.hours, 0) });

    const loadHours = thisWeek.reduce((s, x) => s + x.hours, 0);
    const newHours = newest.estimate_hours ?? DEFAULT_ESTIMATE;
    const capacity = profile.weekly_capacity_hours || 40;
    const perDay = capacity / 5;
    return {
      ...base,
      live: true,
      managerName: base.managerName ?? nameOf(team.data?.find((p) => p.id === newest.assigner_id), lang),
      newTask: { id: newest.id, title: newest.title, dueAt: newest.due_at, priority: newest.priority, hours: Math.round(newHours) },
      items,
      loadHours,
      total: loadHours + Math.round(newHours),
      capacity,
      topTitle: top?.task.title ?? null,
      slipDays: Math.max(1, Math.ceil(newHours / perDay)),
    };
  }, [me.data, team.data, tasks.data, asked.data, lang, taskId]);

  return {
    model,
    profileId: me.data?.id ?? null,
    /** the request already sent about the task on screen (then the screen shows its answer, not the question) */
    askedId: (model.newTask.id && asked.data?.get(model.newTask.id)) || null,
    isLoading: me.isLoading || tasks.isLoading || asked.isLoading,
  };
}

export type SendInput = {
  managerId: string | null;
  requestedBy: string | null;
  taskId: string | null;
  title: string;
  titleAr: string;
  recommendation: string;
  recommendationAr: string;
  reason: string;
  details: Record<string, unknown>;
};

export function useSendPushback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendInput): Promise<string> => {
      if (!input.requestedBy) throw new Error('no-profile');
      if (!input.managerId) throw new Error('no-manager');
      const { data, error } = await supabase
        .from('decisions')
        .insert({
          manager_id: input.managerId,
          requested_by: input.requestedBy,
          task_id: input.taskId,
          type: 'priority_question',
          status: 'pending',
          title: input.title,
          title_ar: input.titleAr,
          recommendation: input.recommendation,
          recommendation_ar: input.recommendationAr,
          recommendation_reason: input.reason,
          details: input.details as Json,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decisions'] });
      qc.invalidateQueries({ queryKey: ['pushbackAsked'] });
    },
  });
}

/** Poll my sent question until the manager answers. */
export function useDecisionStatus(id: string | null) {
  return useQuery({
    queryKey: ['decision', id ?? ''],
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'pending' ? false : 15_000),
    queryFn: async () => {
      const { data, error } = await supabase.from('decisions').select('id, status, resolved_at').eq('id', id!).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
