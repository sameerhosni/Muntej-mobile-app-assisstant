// Live notification preferences (table notification_prefs, one row per profile, RLS = own row only).
// Reads the row, creates it with design defaults when missing, saves toggles optimistically.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';
import type { Json } from '@/lib/api/database.types';

export type Channel = 'push' | 'email' | 'whatsapp' | 'teams';
export const CHANNELS: Channel[] = ['push', 'email', 'whatsapp', 'teams'];

export type RuleKey =
  | 'task_at_risk'
  | 'task_overdue'
  | 'decision_waiting'
  | 'new_submission'
  | 'kudos'
  | 'daily_summary'
  | 'weekly_report';
export const RULE_KEYS: RuleKey[] = [
  'task_at_risk',
  'task_overdue',
  'decision_waiting',
  'new_submission',
  'kudos',
  'daily_summary',
  'weekly_report',
];

export type Rule = {
  enabled: boolean;
  channels: Channel[];
  timing?: 'instant' | 'batched';
  /** HH:mm for scheduled rules (daily/weekly). */
  time?: string;
  /** sun..sat for the weekly report. */
  day?: string;
};

export type QuietHours = { enabled: boolean; prayer_times: boolean; after: string; friday: boolean; ramadan: boolean };
export type Escalation = { no_reply_hours: number; reminders: number; alert_manager: boolean };

export type AlertPrefs = {
  channels: Record<Channel, boolean>;
  rules: Record<RuleKey, Rule>;
  quiet_hours: QuietHours;
  escalation: Escalation;
};

/** Defaults match the Alerts design (and supabase/seed.sql). */
export const DEFAULT_PREFS: AlertPrefs = {
  channels: { push: true, email: true, whatsapp: true, teams: false },
  rules: {
    task_at_risk: { enabled: true, channels: ['push', 'whatsapp'], timing: 'instant' },
    task_overdue: { enabled: true, channels: ['push'], timing: 'instant' },
    decision_waiting: { enabled: true, channels: ['push'], timing: 'instant' },
    new_submission: { enabled: true, channels: ['push'] },
    kudos: { enabled: true, channels: ['push'], timing: 'instant' },
    daily_summary: { enabled: true, channels: ['push', 'email'], time: '08:00' },
    weekly_report: { enabled: false, channels: ['email'], day: 'thu', time: '16:00' },
  },
  quiet_hours: { enabled: true, prayer_times: true, after: '21:00', friday: true, ramadan: true },
  escalation: { no_reply_hours: 24, reminders: 2, alert_manager: true },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Merge a stored row over the defaults so missing keys (e.g. an older row without `kudos`) still render. */
function normalize(row: { channels: Json; rules: Json; quiet_hours: Json; escalation: Json }): AlertPrefs {
  const ch = isObj(row.channels) ? row.channels : {};
  const ru = isObj(row.rules) ? row.rules : {};
  const rules = {} as Record<RuleKey, Rule>;
  for (const k of RULE_KEYS) {
    const stored = isObj(ru[k]) ? (ru[k] as Partial<Rule>) : {};
    rules[k] = { ...DEFAULT_PREFS.rules[k], ...stored };
  }
  return {
    channels: { ...DEFAULT_PREFS.channels, ...(ch as Partial<Record<Channel, boolean>>) },
    rules,
    quiet_hours: { ...DEFAULT_PREFS.quiet_hours, ...(isObj(row.quiet_hours) ? (row.quiet_hours as Partial<QuietHours>) : {}) },
    escalation: { ...DEFAULT_PREFS.escalation, ...(isObj(row.escalation) ? (row.escalation as Partial<Escalation>) : {}) },
  };
}

const toJson = (v: unknown) => v as Json;
const key = (profileId: string | undefined) => ['notification_prefs', profileId ?? ''] as const;
const MUTATION_KEY = ['notification_prefs', 'save'] as const;

export function useAlertPrefs() {
  const me = useMyProfile();
  const profileId = me.data?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: key(profileId),
    enabled: !!profileId,
    queryFn: async (): Promise<AlertPrefs> => {
      const sel = () => supabase.from('notification_prefs').select('*').eq('profile_id', profileId!).maybeSingle();
      const first = await sel();
      if (first.error) throw new Error(first.error.message);
      if (first.data) return normalize(first.data);
      // First visit: create my row with the design defaults (ignore if another device just created it).
      const ins = await supabase.from('notification_prefs').upsert(
        {
          profile_id: profileId!,
          channels: toJson(DEFAULT_PREFS.channels),
          rules: toJson(DEFAULT_PREFS.rules),
          quiet_hours: toJson(DEFAULT_PREFS.quiet_hours),
          escalation: toJson(DEFAULT_PREFS.escalation),
        },
        { onConflict: 'profile_id', ignoreDuplicates: true },
      );
      if (ins.error) throw new Error(ins.error.message);
      const again = await sel();
      if (again.error) throw new Error(again.error.message);
      return again.data ? normalize(again.data) : DEFAULT_PREFS;
    },
  });

  const mutation = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: async (patch: Partial<AlertPrefs>) => {
      const { error } = await supabase.from('notification_prefs').upsert(
        {
          profile_id: profileId!,
          ...(patch.channels && { channels: toJson(patch.channels) }),
          ...(patch.rules && { rules: toJson(patch.rules) }),
          ...(patch.quiet_hours && { quiet_hours: toJson(patch.quiet_hours) }),
          ...(patch.escalation && { escalation: toJson(patch.escalation) }),
        },
        { onConflict: 'profile_id' },
      );
      if (error) throw new Error(error.message);
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key(profileId) });
      const previous = qc.getQueryData<AlertPrefs>(key(profileId));
      if (previous) qc.setQueryData<AlertPrefs>(key(profileId), { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(key(profileId), ctx.previous);
    },
    onSettled: () => {
      // Refetch only once the last queued toggle has landed, so quick taps don't flicker.
      if (qc.isMutating({ mutationKey: MUTATION_KEY }) <= 1) qc.invalidateQueries({ queryKey: key(profileId) });
    },
  });

  /** Latest prefs including optimistic changes (so rapid toggles build on each other). */
  const current = () => qc.getQueryData<AlertPrefs>(key(profileId)) ?? query.data ?? DEFAULT_PREFS;

  const toggleChannel = (c: Channel) => {
    const p = current();
    mutation.mutate({ channels: { ...p.channels, [c]: !p.channels[c] } });
  };
  const toggleRule = (r: RuleKey) => {
    const p = current();
    mutation.mutate({ rules: { ...p.rules, [r]: { ...p.rules[r], enabled: !p.rules[r].enabled } } });
  };
  const toggleQuietHours = () => {
    const p = current();
    mutation.mutate({ quiet_hours: { ...p.quiet_hours, enabled: !p.quiet_hours.enabled } });
  };

  return {
    prefs: query.data,
    isLoading: me.isLoading || query.isLoading,
    isError: me.isError || query.isError,
    isRefetching: query.isRefetching,
    refetch: () => {
      me.refetch();
      query.refetch();
    },
    saveError: mutation.isError,
    toggleChannel,
    toggleRule,
    toggleQuietHours,
  };
}
