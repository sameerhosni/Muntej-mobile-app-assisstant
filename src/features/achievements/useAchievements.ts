// Live achievements (RLS: the employee + their direct manager) with the evidence count of the task behind each win.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Achievement } from '@/lib/api';

export type AchievementRow = Achievement & { proofs: number };

type Raw = Achievement & { task: { id: string; evidence: { count: number }[] } | null };

export function useAchievements() {
  return useQuery({
    queryKey: ['achievements'],
    queryFn: async (): Promise<AchievementRow[]> => {
      const res = await supabase
        .from('achievements')
        .select('*, task:tasks(id, evidence(count))')
        .order('achieved_at', { ascending: true });
      if (res.error) throw new Error(res.error.message);
      return ((res.data ?? []) as unknown as Raw[]).map(({ task, ...a }) => ({ ...a, proofs: task?.evidence?.[0]?.count ?? 0 }));
    },
  });
}
