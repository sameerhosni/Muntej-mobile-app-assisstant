// Saree3 the teacher: on (a lesson or first-time tip on Home, one per app open) or on a coffee break (paused until
// you call him back from More). The pause is a coach_moments row with key '_paused', set/cleared by coach_pause().
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const PAUSED_KEY = '_paused';

export function useCoachPaused(profileId: string | undefined) {
  return useQuery({
    queryKey: ['coachPaused', profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase.from('coach_moments').select('key').eq('profile_id', profileId!).eq('key', PAUSED_KEY);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}

export async function setCoachPaused(qc: QueryClient, paused: boolean) {
  const { error } = await (supabase.rpc as (f: string, a?: object) => PromiseLike<{ error: { message: string } | null }>)('coach_pause', {
    p_paused: paused,
  });
  if (error) throw new Error(error.message);
  await Promise.all([qc.invalidateQueries({ queryKey: ['coachPaused'] }), qc.invalidateQueries({ queryKey: ['coachSeen'] })]);
}
