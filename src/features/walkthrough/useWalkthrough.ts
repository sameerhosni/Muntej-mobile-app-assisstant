// A screen's walkthrough: the first time someone opens it (coach_moments key tour_<screen>), a moment after it
// settles, Saree3 dims everything but the steps' elements. Never while the setup guide is open or Saree3 is on his
// coffee break. Every visit also offers the steps to "Teach me this page" (replay).
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';
import { useOnboarding } from '@/features/onboarding/api';
import { walkthrough, type WalkStep } from './store';

const rpc = (fn: string, args?: object) => Promise.resolve((supabase.rpc as (f: string, a?: object) => PromiseLike<unknown>)(fn, args));
const START_AFTER_MS = 900;

export function useWalkthrough(screen: string, steps: WalkStep[], ready = true) {
  const qc = useQueryClient();
  const me = useMyProfile();
  const meId = me.data?.id;
  const onboarding = useOnboarding(meId);
  const seen = useQuery({
    queryKey: ['walkSeen', meId],
    enabled: !!meId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.from('coach_moments').select('key').eq('profile_id', meId!);
      return new Set((data ?? []).map((r) => r.key as string));
    },
  });
  const key = `tour_${screen}`;
  const setupOpen = !!onboarding.data && !onboarding.data.finished_at && !onboarding.data.dismissed;
  const due = ready && !!seen.data && !seen.data.has(key) && !seen.data.has('_paused') && !setupOpen;

  useFocusEffect(
    useCallback(() => {
      walkthrough.offer(screen, steps);
      if (!due) return;
      const id = setTimeout(() => {
        const started = walkthrough.start(screen, steps, () => {
          // shown (finished or skipped): never again on its own; "Teach me this page" replays it
          qc.setQueryData(['walkSeen', meId], new Set([...(seen.data ?? []), key]));
          rpc('coach_seen', { p_key: key }).catch(() => {});
        });
        if (!started) return;
      }, START_AFTER_MS);
      return () => clearTimeout(id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [due, screen]),
  );
}
