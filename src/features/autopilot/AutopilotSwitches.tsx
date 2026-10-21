// "What Muntej does by itself": one switch per autopilot behaviour (autopilot_prefs, own row; missing = on).
// A manager's switches govern their team. The work itself happens in supabase/functions/autopilot.
import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Card, Toggle } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';
import { NS } from './strings';
import { featureUsed } from '@/features/launch/launch';

// auto_approve has no switch: finished work is always approved by Muntej after 2 working days (3 at most)
export const AUTOPILOT_RULES = ['chase_late', 'help_blocked', 'rebalance', 'find_owner', 'incoming_auto'] as const;
export type AutopilotRule = (typeof AUTOPILOT_RULES)[number];

// autopilot_prefs isn't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;
const KEY = ['autopilotPrefs'] as const;

export function AutopilotSwitches() {
  const { t } = useScreenT(NS);
  const me = useMyProfile();
  const qc = useQueryClient();
  const [error, setError] = useState(false);
  const meId = me.data?.id;

  const prefs = useQuery({
    queryKey: KEY,
    enabled: !!meId,
    queryFn: async (): Promise<Partial<Record<AutopilotRule, boolean>>> => {
      const { data, error } = await untyped.from('autopilot_prefs').select('rules').eq('profile_id', meId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.rules ?? {}) as Partial<Record<AutopilotRule, boolean>>;
    },
  });

  const save = useMutation({
    mutationFn: async (rules: Partial<Record<AutopilotRule, boolean>>) => {
      const { error } = await untyped.from('autopilot_prefs').upsert({ profile_id: meId, rules, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      featureUsed('autopilot');
    },
    onMutate: async (rules) => {
      setError(false);
      const before = qc.getQueryData(KEY);
      qc.setQueryData(KEY, rules);
      return { before };
    },
    onError: (_e, _v, ctx) => {
      setError(true);
      qc.setQueryData(KEY, ctx?.before);
    },
  });

  const rules = prefs.data ?? {};
  const isOn = (r: AutopilotRule) => rules[r] !== false;

  return (
    <Card style={{ gap: 0 }}>
      <AppText variant="cardTitle">{t('sw_title')}</AppText>
      <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>
        {t('sw_hint')}
      </AppText>
      {AUTOPILOT_RULES.map((r, i) => (
        <View
          key={r}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.lg,
            minHeight: 56,
            paddingVertical: spacing.sm,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText weight="bold">{t(`sw_${r}`)}</AppText>
            <AppText variant="caption" color="textMuted">
              {t(`sw_${r}_hint`)}
            </AppText>
          </View>
          <Toggle
            value={isOn(r)}
            disabled={!prefs.isSuccess}
            onValueChange={(v) => save.mutate({ ...rules, [r]: v })}
            accessibilityLabel={t(`sw_${r}`)}
          />
        </View>
      ))}
      {error && (
        <AppText variant="small" color="red">
          {t('sw_error')}
        </AppText>
      )}
    </Card>
  );
}
