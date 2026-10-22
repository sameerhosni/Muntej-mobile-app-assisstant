// More screen's Saree3 card: teaching you as you go, or on a coffee break. One tap calls him back (or sends him off).
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { Munti } from '@/features/munti/Munti';
import { setCoachPaused, useCoachPaused } from './api';
import { COACH_NS } from './strings';

export function CoachSwitch() {
  const { t } = useScreenT(COACH_NS);
  const qc = useQueryClient();
  const me = useMyProfile();
  const paused = useCoachPaused(me.data?.id);
  const [saving, setSaving] = useState(false);
  // what he just said after the tap (a funny line), until you leave the screen
  const [said, setSaid] = useState<string | null>(null);
  if (paused.data === undefined) return null;
  const off = paused.data;

  const toggle = async () => {
    setSaving(true);
    try {
      await setCoachPaused(qc, !off);
      setSaid(off ? t('backLine') : t('pausedBye'));
    } catch {
      // stays as it was; the card shows the real state
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.tile,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: off ? colors.border : colors.purple,
      }}
    >
      <Munti size="md" mood={off ? 'sleep' : 'wave'} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold">{t('switchTitle')}</AppText>
        <AppText variant="small" color="textSoft">
          {said ?? (off ? t('switchOff') : t('switchOn'))}
        </AppText>
      </View>
      <Pressable
        onPress={toggle}
        disabled={saving}
        accessibilityRole="button"
        style={({ pressed }) => ({
          minHeight: sizes.touch,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: off ? colors.purple : colors.surface,
          borderWidth: off ? 0 : 1.5,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {saving ? (
          <ActivityIndicator color={off ? colors.onDark : colors.purple} />
        ) : (
          <AppText variant="small" weight="bold" color={off ? 'onDark' : 'textMuted'}>
            {off ? t('callBack') : t('sendBreak')}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
