// Screen 58 · Customize Home — no mockup. Each Home section with an on/off switch (owner, 26 Oct: "let me choose which
// sections I need to show in home page"). Saved on the server (app_prefs.home), so it's the same on every phone.
// Reached from the bottom of Home and from Settings.
import { ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Card, IconButton, Toggle } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { HOME_SECTIONS, useAppPrefs, useSaveAppPrefs, type HomeSection } from '@/features/prefs/appPrefs';
import { PREFS_NS } from '@/features/prefs/strings';

export default function HomeSectionsScreen() {
  const { t } = useScreenT(PREFS_NS);
  const { isRTL } = useDirection();
  const prefs = useAppPrefs();
  const save = useSaveAppPrefs();
  const home = prefs.data?.home ?? {};
  const on = (s: HomeSection) => home[s] !== false;
  const toggle = (s: HomeSection) => save.mutate({ home: { ...home, [s]: !on(s) } });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.screen, gap: spacing.lg, paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </IconButton>
          <AppText variant="titleLg" numberOfLines={1} style={{ flex: 1 }}>
            {t('title')}
          </AppText>
        </View>
        <AppText color="textMuted">{t('sub')}</AppText>
        <Card style={{ paddingVertical: 2, gap: 0 }}>
          {HOME_SECTIONS.map((s, i) => (
            <View
              key={s}
              style={{
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.lg,
                borderBottomWidth: i === HOME_SECTIONS.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.sm }}>
                <AppText weight="bold">{t(`s_${s}`)}</AppText>
                <AppText variant="caption" color="textMuted">
                  {t(`s_${s}_sub`)}
                </AppText>
              </View>
              <Toggle value={on(s)} onValueChange={() => toggle(s)} accessibilityLabel={t(`s_${s}`)} />
            </View>
          ))}
        </Card>
        {!on('needs') && (
          <AppText variant="caption" color="textMuted">
            {t('needsNote')}
          </AppText>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
