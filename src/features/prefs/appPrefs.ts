// Per-person app preferences kept on the server (table app_prefs, own row only), so they survive a reinstall or a new
// phone: which Home sections show, when What's new was last seen, and how used to Saree3 the person is (he gets
// smaller over the days). Owner's requests of 26 Oct.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';

// app_prefs is not in the generated database types yet; the untyped client stays inside this file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type HomeSection = 'glance' | 'journey' | 'needs' | 'saree3' | 'wins' | 'shortcuts' | 'whatsnew';
/** Home's sections in the order they appear (the customize screen lists them like this) */
export const HOME_SECTIONS: HomeSection[] = ['glance', 'journey', 'needs', 'saree3', 'wins', 'whatsnew', 'shortcuts'];

export type AppPrefs = {
  home: Partial<Record<HomeSection, boolean>>;
  whats_new_seen_at: string | null;
  saree3: { days?: string[]; used?: string[] };
};
const EMPTY: AppPrefs = { home: {}, whats_new_seen_at: null, saree3: {} };

export const appPrefsKey = ['appPrefs'] as const;

export function useAppPrefs() {
  const me = useMyProfile();
  const id = me.data?.id;
  return useQuery({
    queryKey: [...appPrefsKey, id],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AppPrefs> => {
      const { data, error } = await untyped.from('app_prefs').select('home, whats_new_seen_at, saree3').eq('profile_id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return { ...EMPTY, ...(data ?? {}) };
    },
  });
}

/** save some fields (creates the row the first time); the screen updates at once */
export function useSaveAppPrefs() {
  const qc = useQueryClient();
  const me = useMyProfile();
  const id = me.data?.id;
  return useMutation({
    mutationFn: async (patch: Partial<AppPrefs>) => {
      if (!id) return;
      const { error } = await untyped.from('app_prefs').upsert({ profile_id: id, ...patch, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    onMutate: (patch) => {
      qc.setQueryData<AppPrefs>([...appPrefsKey, id], (old) => ({ ...(old ?? EMPTY), ...patch }));
    },
    onError: () => qc.invalidateQueries({ queryKey: appPrefsKey }),
  });
}

/** is this Home section on (default: yes) */
export function useHomeSection() {
  const prefs = useAppPrefs();
  return (s: HomeSection) => prefs.data?.home?.[s] !== false;
}
