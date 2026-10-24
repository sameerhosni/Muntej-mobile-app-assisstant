// Alerts for the signed-in person (table alerts: team-alerts, muntej-chat and DB triggers write them; the server
// pushes each one once — see supabase/functions/_shared/notify.ts). Also the unread count (bell + app icon badge).
// RLS: own rows only; the app may only set read_at.
// The alerts table is newer than src/lib/api/database.types.ts, so it is reached through a small local typed cast.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';

/** changed_for_you = someone else (e.g. your manager) changed your task or profile; task_assigned = given a task;
 *  new_submission = a task waits for your review; decision_waiting = a decision waits for you;
 *  no_reply / escalated = a follow-up got no answer (you / your report). */
export type AlertKind =
  | 'task_late'
  | 'task_at_risk'
  | 'overload'
  | 'task_done_on_time'
  | 'task_done_early'
  | 'five_star'
  | 'objective_achieved'
  | 'objective_at_risk'
  | 'objective_missed'
  | 'changed_for_you'
  | 'task_assigned'
  | 'new_submission'
  | 'decision_waiting'
  | 'no_reply'
  | 'escalated'
  | 'tool_sync'
  | 'new_feature'
  | 'request_answered';

export type AlertItem = {
  id: string;
  kind: AlertKind;
  task_id: string | null;
  title: string;
  body: string;
  title_ar: string | null;
  body_ar: string | null;
  read_at: string | null;
  created_at: string;
};

export const RISK_KINDS: AlertKind[] = ['task_late', 'task_at_risk', 'overload', 'objective_at_risk', 'objective_missed', 'no_reply', 'escalated'];

type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
/** Minimal shape of the query builder calls used here. */
type AlertsTable = {
  select: (cols: string) => {
    eq: (col: string, v: string) => {
      order: (col: string, o: { ascending: boolean }) => { limit: (n: number) => Res<AlertItem[]> };
    };
  };
  update: (v: { read_at: string }) => { eq: (col: string, v: string) => Res<null> };
};
const alertsTable = () => (supabase as unknown as { from: (t: 'alerts') => AlertsTable }).from('alerts');

const COLS = 'id, kind, task_id, title, body, title_ar, body_ar, read_at, created_at';
const key = (profileId: string | undefined) => ['alerts', profileId ?? ''] as const;
const unreadKey = (profileId: string | undefined) => ['alerts', 'unread', profileId ?? ''] as const;

/** How many alerts the signed-in person hasn't opened yet (bell + app icon badge). Live via Realtime. */
export function useUnreadAlerts() {
  const me = useMyProfile();
  const profileId = me.data?.id;
  return useQuery({
    queryKey: unreadKey(profileId),
    enabled: !!profileId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('alerts' as never)
        .select('id', { count: 'exact', head: true })
        .eq('profile_id' as never, profileId! as never)
        .is('read_at' as never, null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

export function useRecentAlerts() {
  const me = useMyProfile();
  const profileId = me.data?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: key(profileId),
    enabled: !!profileId,
    queryFn: async (): Promise<AlertItem[]> => {
      const { data, error } = await alertsTable()
        .select(COLS)
        .eq('profile_id', profileId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await alertsTable().update({ read_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onMutate: (id) => {
      const at = new Date().toISOString();
      qc.setQueryData<AlertItem[]>(key(profileId), (old) => old?.map((a) => (a.id === id && !a.read_at ? { ...a, read_at: at } : a)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  // "Mark all read" (RPC mark_alerts_read: own unread rows only)
  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ error: { message: string } | null }>)('mark_alerts_read');
      if (error) throw new Error(error.message);
    },
    onMutate: () => {
      const at = new Date().toISOString();
      qc.setQueryData<AlertItem[]>(key(profileId), (old) => old?.map((a) => (a.read_at ? a : { ...a, read_at: at })));
      qc.setQueryData<number>(unreadKey(profileId), 0);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  return {
    alerts: query.data,
    isLoading: me.isLoading || query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAll.mutate(),
    markingAll: markAll.isPending,
  };
}

/** Value tiles on the Alerts screen (last 7 days): pings a day (pushed alerts + follow-ups to you), chases Muntej sent
 *  to others on tasks you can see, and the time those chases saved you (~5 min each). */
export function useAlertStats() {
  const me = useMyProfile();
  const profileId = me.data?.id;
  return useQuery({
    queryKey: ['alerts', 'stats', profileId ?? ''],
    enabled: !!profileId,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
        const r = await q;
        if (r.error) throw new Error(r.error.message);
        return r.count ?? 0;
      };
      const loose = supabase as unknown as {
        from: (t: string) => { select: (c: string, o: { count: 'exact'; head: true }) => LooseFilter };
      };
      const [pushed, toMe, chases] = await Promise.all([
        count(loose.from('alerts').select('id', { count: 'exact', head: true }).eq('profile_id', profileId!).eq('sent_push', true).gte('created_at', since)),
        count(loose.from('followups').select('id', { count: 'exact', head: true }).eq('recipient_id', profileId!).eq('status', 'sent').gte('sent_at', since)),
        count(loose.from('followups').select('id', { count: 'exact', head: true }).neq('recipient_id', profileId!).eq('status', 'sent').gte('sent_at', since)),
      ]);
      return { perDay: Math.round(((pushed + toMe) / 7) * 10) / 10, chases, focusHours: Math.round(((chases * 5) / 60) * 10) / 10 };
    },
  });
}

type LooseFilter = PromiseLike<{ count: number | null; error: { message: string } | null }> & {
  eq: (c: string, v: unknown) => LooseFilter;
  neq: (c: string, v: unknown) => LooseFilter;
  gte: (c: string, v: string) => LooseFilter;
};
