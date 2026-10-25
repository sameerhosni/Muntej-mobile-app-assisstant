// Value Ladder (supabase/migrations/20261025160000_value_ladder.sql): the moments a person must reach to feel
// "create it and forget it". The server records them every 5 minutes; here: read mine, mark one celebrated, and the
// two signals the app sends (the owner opened their task · the brief was opened today).
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';

// the ladder isn't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type Rung = { rung_id: string; reached_at: string | null; celebrated_at: string | null };

export function useLadder() {
  const me = useMyProfile();
  return useQuery({
    queryKey: ['ladder', me.data?.id],
    enabled: !!me.data?.id,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<Rung[]> => {
      const { data, error } = await untyped.from('value_ladder').select('rung_id, reached_at, celebrated_at').eq('profile_id', me.data!.id);
      if (error) throw new Error(error.message);
      return (data ?? []) as Rung[];
    },
  });
}

export function useMarkCelebrated() {
  const qc = useQueryClient();
  return async (rung: string) => {
    await untyped.rpc('ladder_celebrated', { p_rung: rung });
    qc.invalidateQueries({ queryKey: ['ladder'] });
  };
}

/** the owner opened their task: it counts as seen (hand-off reached them) */
export function useTaskSeen(taskId: string | undefined, isOwner: boolean, alreadySeen: boolean) {
  useEffect(() => {
    if (taskId && isOwner && !alreadySeen) untyped.rpc('mark_task_seen', { p_task: taskId }).then(() => {}, () => {});
  }, [taskId, isOwner, alreadySeen]);
}

/** the brief was looked at today (once a day is enough) */
export function useBriefOpened() {
  useEffect(() => {
    untyped.rpc('mark_brief_open').then(() => {}, () => {});
  }, []);
}
export const markBriefOpen = () => untyped.rpc('mark_brief_open').then(() => {}, () => {});
