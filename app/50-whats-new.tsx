// Screen 50 · New in Muntej — no mockup; v2 light style per design/TOKENS.md
// Every new feature for this person's role, the ones still new first: what it does for you (one line) and "Show me
// how" (Saree3's walkthrough on the real screen). Opened from the Home strip, More and Settings.
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Button, Card, IconButton } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Munti } from '@/features/munti/Munti';
import { showFeature, useWhatsNew, WHATS_NEW_NS } from '@/features/launch/WhatsNew';

export default function WhatsNewScreen() {
  const { t } = useScreenT(WHATS_NEW_NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const { list, isNew, count } = useWhatsNew();
  const ar = lang === 'ar';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.lg }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="title" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
        <Munti size="sm" mood={count ? 'celebrate' : 'idle'} />
      </View>
      <AppText color="textSoft">{count ? t('sub') : t('none')}</AppText>

      {list.map((f) => {
        const fresh = isNew(f);
        return (
          <Card key={f.key} padding={spacing.lg} style={{ gap: spacing.sm, borderWidth: fresh ? 1.5 : 0, borderColor: colors.purpleBorder }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText weight="extrabold" style={{ flex: 1, fontSize: 17 }}>
                {ar ? f.title_ar : f.title}
              </AppText>
              <View
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 3,
                  borderRadius: radius.pill,
                  backgroundColor: fresh ? colors.purpleTint : colors.greenTint,
                }}
              >
                <AppText variant="micro" weight="bold" color={fresh ? 'purple' : 'green'}>
                  {fresh ? t('isNew') : t('tried')}
                </AppText>
              </View>
            </View>
            <AppText color="textSoft">{ar ? f.benefit_ar : f.benefit}</AppText>
            <View style={{ flexDirection: 'row' }}>
              <Button
                label={t('showHow')}
                size="md"
                variant={fresh ? 'primary' : 'outline'}
                onPress={() => showFeature(f, ar, t('myDemo'))}
              />
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
