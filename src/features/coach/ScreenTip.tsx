// The first time someone opens a main screen, Saree3 teaches it once: one small card at the top with the screen's
// main value in one line and (when there is one) a button that does it. "Got it" or the button and it never comes
// back (coach_moments key screen_<id>). Nothing while onboarding is open or Saree3 is on his coffee break.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';
import { useOnboarding } from '@/features/onboarding/api';
import { Munti } from '@/features/munti/Munti';
import { PAUSED_KEY } from './api';
import { TIPS_NS } from './tipStrings';

const rpc = (fn: string, args?: object) => Promise.resolve((supabase.rpc as (f: string, a?: object) => PromiseLike<unknown>)(fn, args));

/** which screens were already taught (+ whether Saree3 is on a break) */
function useTaught(meId: string | undefined) {
  return useQuery({
    queryKey: ['screenTips', meId],
    enabled: !!meId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.from('coach_moments').select('key').eq('profile_id', meId!);
      return new Set((data ?? []).map((r) => r.key as string));
    },
  });
}

/** `id` = the screen (home, chat, tasks, email, task, team, decisions, more); `action` = the one thing to try */
export function ScreenTip({ id, action }: { id: string; action?: () => void }) {
  const { t } = useScreenT(TIPS_NS);
  const qc = useQueryClient();
  const me = useMyProfile();
  const meId = me.data?.id;
  const taught = useTaught(meId);
  const onboarding = useOnboarding(meId);
  const key = `screen_${id}`;
  const onboardingOpen = !!onboarding.data && !onboarding.data.finished_at && !onboarding.data.dismissed;
  if (!taught.data || taught.data.has(key) || taught.data.has(PAUSED_KEY) || onboardingOpen) return null;

  const done = (acted: boolean) => {
    qc.setQueryData(['screenTips', meId], new Set([...taught.data!, key]));
    rpc('coach_seen', { p_key: key, p_acted: acted }).catch(() => {});
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.tile,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.purple,
      }}
    >
      <Munti size="md" mood="talk" />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <AppText weight="bold">{t(`${id}Title`)}</AppText>
        <AppText variant="small" color="textSoft">
          {t(`${id}Body`)}
        </AppText>
        {!!action && (
          // the shared Button fills its parent (flex 1): a row keeps it one button high
          <View style={{ flexDirection: 'row' }}>
            <Button
              label={t(`${id}Action`)}
              size="md"
              onPress={() => {
                done(true);
                action();
              }}
            />
          </View>
        )}
      </View>
      <Pressable
        onPress={() => done(false)}
        accessibilityRole="button"
        accessibilityLabel={t('gotIt')}
        hitSlop={8}
        style={{ minWidth: sizes.touch - 8, minHeight: sizes.touch - 8, alignItems: 'center', justifyContent: 'center' }}
      >
        <X color={colors.textMuted} size={18} />
      </Pressable>
    </View>
  );
}
