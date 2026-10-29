// "How should I reach you?" (owner, 28 Oct: "I get both push and WhatsApp — let each person choose"): one choice on
// Settings that sets the push / WhatsApp channel switches the server already follows (alerts, the three reports,
// nudges). The Alerts screen keeps the per-alert detail. Replies to your own WhatsApp messages and support replies
// aren't affected.
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, MessageCircle, Smartphone } from 'lucide-react-native';
import { AppText, Button, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { featureUsed } from '@/features/launch/launch';
import { Spotlight } from '@/features/launch/Spotlight';
import { useAlertPrefs } from './useAlertPrefs';

const en = {
  title: 'How should I reach you?',
  hint: 'Alerts, your daily reports and reminders come this way: app notifications, WhatsApp, or both.',
  push: 'App',
  whatsapp: 'WhatsApp',
  both: 'Both',
  noWa: 'Your WhatsApp isn’t linked to Muntej yet, so nothing can reach you there.',
  linkWa: 'Link WhatsApp',
  saveError: 'Couldn’t save. Try again.',
};
const ar: typeof en = {
  title: 'كيف أوصل لك؟',
  hint: 'التنبيهات والتقارير اليومية والتذكيرات توصلك بهالطريقة: إشعارات التطبيق، الواتساب، أو الاثنين.',
  push: 'التطبيق',
  whatsapp: 'واتساب',
  both: 'الاثنين',
  noWa: 'واتسابك مو مربوط بمنتج للحين، فما راح يوصلك شي هناك.',
  linkWa: 'اربط الواتساب',
  saveError: 'ما انحفظ. جرّب مرة ثانية.',
};
const NS = registerStrings('reachMe', { en, ar });

type Mode = 'push' | 'whatsapp' | 'both';
const OPTIONS: { mode: Mode; Icon: typeof Bell }[] = [
  { mode: 'push', Icon: Smartphone },
  { mode: 'whatsapp', Icon: MessageCircle },
  { mode: 'both', Icon: Bell },
];

export function ReachMe() {
  const { t } = useScreenT(NS);
  const { prefs, setChannels, saveError } = useAlertPrefs();
  // is my own WhatsApp linked (same check as Your tools)
  const wa = useQuery({
    queryKey: ['whatsappInfo'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke<{ ready: boolean; mine: string | null }>('connect', { body: { action: 'whatsapp' } });
      return data ?? { ready: false, mine: null };
    },
  });
  if (!prefs) return null;
  const { push, whatsapp } = prefs.channels;
  const mode: Mode | null = push && whatsapp ? 'both' : push ? 'push' : whatsapp ? 'whatsapp' : null;
  const waMissing = wa.data && !wa.data.mine && mode !== 'push';

  return (
    <Spotlight id="settings.reachMe">
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: 4 }}>
          <AppText variant="cardTitle">{t('title')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('hint')}
          </AppText>
        </View>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.pill, padding: 4 }}>
          {OPTIONS.map(({ mode: m, Icon }) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  featureUsed('reach_me');
                  setChannels({ push: m !== 'whatsapp', whatsapp: m !== 'push' });
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(m)}
                style={{
                  flex: 1,
                  minHeight: sizes.touch,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 5,
                  paddingHorizontal: 4,
                  backgroundColor: active ? colors.surface : colors.transparent,
                }}
              >
                <Icon color={active ? colors.primary : colors.textMuted} size={15} strokeWidth={2.2} />
                <AppText variant="small" weight="bold" color={active ? 'primary' : 'textMuted'} numberOfLines={1}>
                  {t(m)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {waMissing && (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" color="orangeText">
              {t('noWa')}
            </AppText>
            <Button label={t('linkWa')} variant="outline" size="md" onPress={() => router.push('/12-sources' as Href)} />
          </View>
        )}
        {saveError && (
          <AppText variant="caption" color="red">
            {t('saveError')}
          </AppText>
        )}
      </Card>
    </Spotlight>
  );
}
