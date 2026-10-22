// Onboarding (supabase/migrations/20261022170000_self_signup_onboarding.sql): the few things only the onboarding chat
// knows (named the company, watched the demo, skipped / finished); everything else is read from real data.
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, TaskWithPeople } from '@/lib/api';

export type OnboardingRow = { profile_id: string; account_named: boolean; demo_seen: boolean; dismissed: boolean; started_at: string; finished_at: string | null };

/** The onboarding chat's steps, in order. "value" is the moment right after the first task (not stored). */
export type Step = 'name' | 'company' | 'demo' | 'try' | 'value' | 'team' | 'handoff' | 'done';

export const ONBOARDING_KEY = ['onboarding'] as const;
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: object) => Promise<{ error: { message: string } | null }>;

/** null = this person has no onboarding (invited people, everyone from before self sign-up) */
export function useOnboarding(meId: string | undefined) {
  return useQuery({
    queryKey: [...ONBOARDING_KEY, meId],
    enabled: !!meId,
    queryFn: async (): Promise<OnboardingRow | null> => {
      const { data, error } = await supabase.from('onboarding').select('*').eq('profile_id', meId!).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as OnboardingRow | null) ?? null;
    },
  });
}

export async function markOnboarding(qc: QueryClient, p: { account_named?: boolean; demo_seen?: boolean; dismissed?: boolean; finished?: boolean }) {
  const { error } = await rpc('onboarding_mark', { p });
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
}

export async function setMyName(qc: QueryClient, meId: string, name: string) {
  const arabic = /[؀-ۿ]/.test(name);
  // the name they gave replaces the guess from their email (an Arabic one fills the Arabic name); profiles are
  // changed through upsert_person (it checks who may change what)
  const { error } = await rpc('upsert_person', { p: arabic ? { id: meId, full_name_ar: name.trim() } : { id: meId, full_name: name.trim() } });
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ['me'] });
}

export async function setAccountName(qc: QueryClient, name: string) {
  const { error } = await rpc('set_account_name', { p_name: name.trim() });
  if (error) throw new Error(error.message);
  await Promise.all([qc.invalidateQueries({ queryKey: ONBOARDING_KEY }), qc.invalidateQueries({ queryKey: ['myAccounts'] })]);
}

/** where the person is, from the stored flags + the real data */
export function stepFrom(row: OnboardingRow, me: Profile, tasks: TaskWithPeople[], team: Profile[]): Step {
  tasks = tasks.filter((t) => t.status !== 'cancelled');
  if (!row.account_named) return 'name';
  if (!row.demo_seen) return 'demo';
  if (!tasks.some((t) => t.assigner_id === me.id)) return 'try';
  if (!team.some((p) => p.id !== me.id)) return 'team';
  if (!tasks.some((t) => t.assigner_id === me.id && t.owner_id && t.owner_id !== me.id)) return 'handoff';
  return 'done';
}

/** the 4 things "Getting started" counts */
export function progressOf(row: OnboardingRow, me: Profile, tasks: TaskWithPeople[], team: Profile[]) {
  tasks = tasks.filter((t) => t.status !== 'cancelled');
  const done = [
    row.account_named,
    tasks.some((t) => t.assigner_id === me.id),
    team.some((p) => p.id !== me.id),
    tasks.some((t) => t.assigner_id === me.id && t.owner_id && t.owner_id !== me.id),
  ];
  return { done: done.filter(Boolean).length, total: done.length };
}
