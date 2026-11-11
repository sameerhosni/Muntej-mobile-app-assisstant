// Is a feature on for the signed-in person (testers first, R69)? feature_on(key) on the server, cached a few minutes.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useFeatureOn(key: string) {
  return (
    useQuery({
      queryKey: ['featureOn', key],
      queryFn: async () => (await supabase.rpc('feature_on' as never, { p_key: key } as never)).data === true,
      staleTime: 5 * 60_000,
    }).data === true
  );
}
