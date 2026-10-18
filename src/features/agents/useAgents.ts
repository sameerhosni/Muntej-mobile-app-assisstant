// Live agents (table `agents`, RLS = own rows) + their recent runs (table `agent_runs`, select via agent ownership).
// Toggling `enabled` is optimistic. createAgent inserts the agent and a dry-run row from screen 23.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile, type Agent } from '@/lib/api';
import type { Json, Database } from '@/lib/api/database.types';
import { RecipeSchema, scheduleOf, type Recipe } from './recipe';

type Autonomy = Database['public']['Enums']['agent_autonomy'];
export type AgentRun = Pick<Database['public']['Tables']['agent_runs']['Row'], 'id' | 'agent_id' | 'status' | 'dry_run' | 'started_at'>;

/** Ready-made agents from the Agents design (names/prompts live in agents/strings.ts → tpl.<key>). */
export const TEMPLATE_KEYS = ['daily_recap', 'weekly_report', 'late_nudge', 'quote_email', 'kudos'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const isTemplateKey = (k: unknown): k is TemplateKey => TEMPLATE_KEYS.includes(k as TemplateKey);

/** Rough value per agent (design: 5 agents ≈ 10 h ≈ SAR 2,000 a month). */
export const HOURS_PER_AGENT_MONTH = 2;

const agentsKey = (profileId: string | undefined) => ['agents', profileId ?? ''] as const;
const runsKey = (profileId: string | undefined) => ['agent_runs', profileId ?? ''] as const;
const TOGGLE_KEY = ['agents', 'toggle'] as const;

export function useAgents() {
  const me = useMyProfile();
  const profileId = me.data?.id;
  const qc = useQueryClient();

  const agents = useQuery({
    queryKey: agentsKey(profileId),
    enabled: !!profileId,
    queryFn: async (): Promise<Agent[]> => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('owner_id', profileId!)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const ids = (agents.data ?? []).map((a) => a.id);
  const runs = useQuery({
    queryKey: [...runsKey(profileId), ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<AgentRun[]> => {
      const { data, error } = await supabase
        .from('agent_runs')
        .select('id, agent_id, status, dry_run, started_at')
        .in('agent_id', ids)
        .order('started_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const toggle = useMutation({
    mutationKey: TOGGLE_KEY,
    mutationFn: async (v: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('agents').update({ enabled: v.enabled }).eq('id', v.id);
      if (error) throw new Error(error.message);
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: agentsKey(profileId) });
      const previous = qc.getQueryData<Agent[]>(agentsKey(profileId));
      if (previous) {
        qc.setQueryData<Agent[]>(
          agentsKey(profileId),
          previous.map((a) => (a.id === v.id ? { ...a, enabled: v.enabled } : a)),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(agentsKey(profileId), ctx.previous);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: TOGGLE_KEY }) <= 1) qc.invalidateQueries({ queryKey: agentsKey(profileId) });
    },
  });

  return {
    agents: agents.data ?? [],
    runs: runs.data ?? [],
    ready: !!profileId && agents.isSuccess,
    isLoading: me.isLoading || agents.isLoading,
    isError: me.isError || agents.isError,
    isRefetching: agents.isRefetching || runs.isRefetching,
    refetch: () => {
      me.refetch();
      agents.refetch();
      runs.refetch();
    },
    saveError: toggle.isError,
    setEnabled: (id: string, enabled: boolean) => toggle.mutate({ id, enabled }),
  };
}

export type NewAgentInput = {
  name: string;
  prompt: string;
  recipe: Recipe;
  autonomy: Autonomy;
  dryRunOutput: Record<string, unknown>;
};

/** Insert an agent (enabled) plus its first dry-run row. Returns whether the run row could be saved. */
export function useCreateAgent() {
  const me = useMyProfile();
  const profileId = me.data?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAgentInput): Promise<{ agentId: string; runSaved: boolean }> => {
      if (!profileId) throw new Error('no-profile');
      const recipe = RecipeSchema.parse(input.recipe);
      const { data, error } = await supabase
        .from('agents')
        .insert({
          owner_id: profileId,
          name: input.name,
          prompt: input.prompt,
          recipe: recipe as unknown as Json,
          schedule: scheduleOf(recipe),
          autonomy: input.autonomy,
          enabled: true,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      const now = new Date().toISOString();
      const run = await supabase.from('agent_runs').insert({
        agent_id: data.id,
        status: 'dry_run',
        dry_run: true,
        started_at: now,
        finished_at: now,
        output: input.dryRunOutput as Json,
      });
      return { agentId: data.id, runSaved: !run.error };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentsKey(profileId) });
      qc.invalidateQueries({ queryKey: runsKey(profileId) });
    },
  });
}
