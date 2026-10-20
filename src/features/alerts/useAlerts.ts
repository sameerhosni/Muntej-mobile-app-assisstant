// Recent risk & achievement alerts for the signed-in person (table alerts, written by the team-alerts Edge Function).
// RLS: own rows only; the app may only set read_at.
// The alerts table is newer than src/lib/api/database.types.ts, so it is reached through a small local typed cast.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';

/** changed_for_you = someone else (e.g. your manager) changed your task or profile; written by a trigger on activity_log */
export type AlertKind = 'task_late' | 'task_at_risk' | 'overload' | 'task_done_on_time' | 'task_done_early' | 'five_star' | 'changed_for_you';

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

export const RISK_KINDS: AlertKind[] = ['task_late', 'task_at_risk', 'overload'];

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
    onSettled: () => qc.invalidateQueries({ queryKey: key(profileId) }),
  });

  return {
    alerts: query.data,
    isLoading: me.isLoading || query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    markRead: (id: string) => markRead.mutate(id),
  };
}
