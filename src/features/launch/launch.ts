// Feature launches (see supabase/migrations/20261021170000_feature_launch.sql): the features table holds what's new
// and for whom; feature_events holds each person's state. Here: where each feature lives in the app, the state hooks,
// featureUsed() to call wherever a feature is really used, and the spotlight that points at the right button.
import { useSyncExternalStore } from 'react';
import type { Href } from 'expo-router';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type FeatureState = 'seen' | 'tried' | 'adopted' | 'later' | 'not_interested';
export type Feature = {
  key: string;
  audience: 'all' | 'manager' | 'employee' | 'admin';
  released_at: string;
  title: string;
  title_ar: string;
  benefit: string;
  benefit_ar: string;
  sort: number;
};
export type FeatureEvent = { feature_key: string; state: FeatureState; later_count: number; updated_at: string };

/** where "Show me" takes you, and which spotlight lights up there (none = Saree3 shows it himself) */
export const FEATURE_PLACES: Record<string, { href?: Href; spot?: string }> = {
  today_home: { href: '/01-home', spot: 'home.pulse' },
  confirm_new: { href: '/01-home', spot: 'home.confirm' },
  week_links: { href: '/01-home', spot: 'home.week' },
  sectors: { href: '/12-sources', spot: 'sources.sector' },
  google_chat: { href: '/55-tool?tool=google_chat' as Href, spot: 'sources.google' },
  your_tools: { href: '/42-incoming', spot: 'email.connect' },
  my_profile: { href: '/53-profile' as Href },
  saree3_jobs: { href: '/01-home', spot: 'home.jobs' },
  whatsapp_approve: { href: '/55-tool?tool=whatsapp' as Href, spot: 'sources.whatsapp' },
  tool_pages: { href: '/42-incoming', spot: 'tools.tiles' },
  journey_ladder: { href: '/01-home', spot: 'home.journey' },
  support_chat: { href: '/44-more' as Href },
  my_requests: { href: '/25-employee-home' },
  objective_plan: { href: '/40-objectives' },
  autopilot: { href: '/03-autopilot' },
  incoming: { href: '/42-incoming', spot: 'email.connect' },
  tools: { href: '/42-incoming?add=1' as Href, spot: 'sources.list' },
  saree3: {},
  daily_summary: { href: '/18-alerts', spot: 'alerts.summary' },
  view_as: { href: '/settings', spot: 'settings.viewAs' },
  // opens one of your own open tasks (LaunchCard picks it) with its steps lit up
  steps: { href: '/38-tasks', spot: 'task.steps' },
  // 23 Oct: each one's place is a TourTarget, so "Show me" runs Saree3's walkthrough right on it
  from_saree3: { href: '/', spot: 'home.from' },
  team_risks: { href: '/01-home', spot: 'home.risks' },
  email_tasks: { href: '/55-tool?tool=gmail' as Href },
  whatsapp: { href: '/55-tool?tool=whatsapp' as Href, spot: 'sources.whatsapp' },
  meet: { href: '/55-tool?tool=meet' as Href, spot: 'sources.google' },
  more_tools: { href: '/42-incoming', spot: 'email.tools' },
};

/** "later" asks again after this long, at most twice */
export const LATER_MS = 3 * 86_400_000;
export const MAX_LATER = 2;

// feature tables aren't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export function useFeatures() {
  return useQuery({
    queryKey: ['features'],
    queryFn: async (): Promise<Feature[]> => {
      const { data, error } = await untyped.from('features').select('*').order('sort');
      if (error) throw new Error(error.message);
      return (data ?? []) as Feature[];
    },
    staleTime: 10 * 60_000,
  });
}

/** my state per feature (RLS: own rows; admins see everyone's, so filter by me) */
export function useMyFeatureStates(meId: string | undefined) {
  return useQuery({
    queryKey: ['featureStates', meId],
    enabled: !!meId,
    queryFn: async (): Promise<Map<string, FeatureEvent>> => {
      const { data, error } = await untyped.from('feature_events').select('feature_key, state, later_count, updated_at').eq('profile_id', meId);
      if (error) throw new Error(error.message);
      return new Map(((data ?? []) as FeatureEvent[]).map((e) => [e.feature_key, e]));
    },
  });
}

let qcRef: QueryClient | null = null;
/** call once near the root so featureUsed() can refresh the states */
export function useLaunchClient() {
  qcRef = useQueryClient();
}

/** move my state for a feature (server keeps the order: seen < tried < adopted) */
export async function markFeature(key: string, state: FeatureState) {
  const { error } = await untyped.rpc('mark_feature', { p_key: key, p_state: state });
  if (!error) qcRef?.invalidateQueries({ queryKey: ['featureStates'] });
}

/** the person really used this feature â†’ "using it" (call it from the feature's own success path) */
export function featureUsed(key: string) {
  markFeature(key, 'adopted').catch(() => {});
}

/** is this feature still new to me (not tried / used / turned down)? */
export function isNewFor(states: Map<string, FeatureEvent> | undefined, key: string) {
  const s = states?.get(key)?.state;
  return !s || s === 'seen' || s === 'later';
}

// â”€â”€â”€ is a "New for you" card on screen? (Saree3 keeps his own pop-up quiet meanwhile) â”€â”€â”€â”€â”€

let cardOn = false;
const cardListeners = new Set<() => void>();
export function setLaunchCardOn(on: boolean) {
  if (cardOn === on) return;
  cardOn = on;
  cardListeners.forEach((l) => l());
}
export function useLaunchCardOn(): boolean {
  return useSyncExternalStore(
    (l) => {
      cardListeners.add(l);
      return () => cardListeners.delete(l);
    },
    () => cardOn,
    () => cardOn,
  );
}

// â”€â”€â”€ spotlight: "Show me" lights up one place on the next screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let spot: string | null = null;
let spotTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const spotlight = {
  /** waits up to `ms` for the place to appear (slow screens); once it's on screen it glows ~8 s (Spotlight) */
  show(id: string, ms = 30_000) {
    clearTimeout(spotTimer);
    spot = id;
    emit();
    spotTimer = setTimeout(() => spotlight.clear(), ms);
  },
  clear() {
    clearTimeout(spotTimer);
    spot = null;
    emit();
  },
};

export function useSpotlight(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => spot,
    () => spot,
  );
}
