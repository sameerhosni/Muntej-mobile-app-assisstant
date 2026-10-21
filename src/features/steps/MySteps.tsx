// "Your steps" on Home: steps someone gave you (even on tasks that aren't yours), with a tick. Hidden when none.
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { colors, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatDue } from '@/features/capture/format';
import { contentDirection } from '@/features/chat/Bubbles';
import { munti } from '@/features/munti/store';
import { useMySteps, useStepActions } from './api';
import { STEPS_NS } from './strings';

export function MySteps() {
  const { t } = useScreenT(STEPS_NS);
  const { lang } = useDirection();
  const steps = useMySteps();
  const actions = useStepActions();
  const [busy, setBusy] = useState<string | null>(null);
  const list = (steps.data ?? []).slice(0, 3);
  if (!list.length) return null;

  const tick = async (id: string) => {
    setBusy(id);
    try {
      await actions.tickMine(id);
      munti.flash('green');
      munti.say(t('cheerLast'), 'celebrate', { ms: 3000 });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="section">{t('mySteps')}</AppText>
      <Card padding={spacing.sm} style={{ gap: 0 }}>
        {list.map((s, i) => {
          const late = !!s.due_at && Date.parse(s.due_at) < Date.now();
          return (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
              <Pressable
                onPress={() => tick(s.id)}
                disabled={busy === s.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: false }}
                accessibilityLabel={s.title}
                style={{ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' }}
              >
                {busy === s.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: late ? colors.red : colors.borderBlue }} />
                )}
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
                <AppText weight="bold" numberOfLines={1} style={{ writingDirection: contentDirection(s.title) }}>
                  {s.title}
                </AppText>
                <AppText variant="caption" color={late ? 'red' : 'textMuted'} numberOfLines={1}>
                  {[t('stepOf', { task: s.task_title }), s.due_at ? formatDue(s.due_at, lang) : null].filter(Boolean).join(' · ')}
                </AppText>
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}
