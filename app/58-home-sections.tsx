// Screen 58 · Customize Home — no mockup. Owner, 26 Oct: every feature can be on Home; the person chooses what shows
// and sees how it looks first. Two groups: "On your Home" and "You can add" (Home's own sections + a card for each
// feature from More), each with a switch; tapping an item opens a preview of the real card with live data and an
// Add / Take off button. Saved on the server (app_prefs.home), the same on every phone. Reached from the bottom of
// Home and from Settings.
import { useState, type ComponentType } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  CloudSun,
  Inbox,
  LayoutGrid,
  LayoutList,
  Sparkles,
  Sun,
  Trophy,
  Waypoints,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Button, Card, IconBadge, IconButton, Toggle } from '@/components/ui';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { HOME_SECTIONS, isOn, useAppPrefs, useSaveAppPrefs, type HomeSection } from '@/features/prefs/appPrefs';
import { FeaturePreview, useMyFeatures, type FeatureKey } from '@/features/prefs/featureCards';
import { CorePreview } from '@/features/prefs/CorePreview';
import { PREFS_NS } from '@/features/prefs/strings';
import { MORE_NS } from '@/features/more/strings';
import { track } from '@/lib/analytics';

type Item = {
  key: string;
  title: string;
  sub: string;
  Icon: ComponentType<LucideProps>;
  bg: ColorToken;
  fg: string;
  core?: HomeSection;
  feature?: FeatureKey;
};

const CORE_LOOK: Record<HomeSection, { Icon: ComponentType<LucideProps>; bg: ColorToken; fg: string }> = {
  glance: { Icon: Sun, bg: 'primaryTint', fg: colors.primary },
  journey: { Icon: Waypoints, bg: 'purpleTint', fg: colors.purple },
  needs: { Icon: Inbox, bg: 'redTint', fg: colors.red },
  saree3: { Icon: CloudSun, bg: 'amberTint', fg: colors.amberText },
  wins: { Icon: Trophy, bg: 'greenTint', fg: colors.green },
  whatsnew: { Icon: Sparkles, bg: 'purpleTint', fg: colors.purple },
  shortcuts: { Icon: LayoutGrid, bg: 'chip', fg: colors.textSoft },
};

export default function HomeSectionsScreen() {
  const { t } = useScreenT(PREFS_NS);
  const { t: tm } = useScreenT(MORE_NS);
  const { isRTL } = useDirection();
  const prefs = useAppPrefs();
  const save = useSaveAppPrefs();
  const features = useMyFeatures();
  const [preview, setPreview] = useState<Item | null>(null);
  const home = prefs.data?.home ?? {};
  const on = (key: string) => isOn(home, key);
  const set = (key: string, value: boolean) => {
    track('home_section', { section: key, on: value });
    save.mutate({ home: { ...home, [key]: value } });
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));

  const items: Item[] = [
    ...HOME_SECTIONS.map((s) => ({ key: s, title: t(`s_${s}`), sub: t(`s_${s}_sub`), core: s, ...CORE_LOOK[s] })),
    ...features.map((f) => ({ key: `f_${f.key}`, title: tm(f.key), sub: tm(`${f.key}Sub`), feature: f.key, Icon: f.Icon, bg: f.bg, fg: f.fg })),
  ];
  const shown = items.filter((i) => on(i.key));
  const available = items.filter((i) => !on(i.key));

  const row = (i: Item, last: boolean) => (
    <View
      key={i.key}
      style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}
    >
      {/* tap the item: see how it looks first */}
      <Pressable
        onPress={() => {
          track('home_section_preview', { section: i.key });
          setPreview(i);
        }}
        accessibilityRole="button"
        accessibilityLabel={i.title}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 })}
      >
        <IconBadge size={36} bg={i.bg} round>
          <i.Icon color={i.fg} size={18} />
        </IconBadge>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText weight="bold" numberOfLines={1}>
            {i.title}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {i.sub}
          </AppText>
        </View>
      </Pressable>
      <Toggle value={on(i.key)} onValueChange={(v) => set(i.key, v)} accessibilityLabel={i.title} />
    </View>
  );

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

        <AppText variant="section">{t('onHome')}</AppText>
        <Card style={{ paddingVertical: 2, gap: 0 }}>{shown.map((i, n) => row(i, n === shown.length - 1))}</Card>
        {!on('needs') && (
          <AppText variant="caption" color="textMuted">
            {t('needsNote')}
          </AppText>
        )}

        {!!available.length && (
          <View style={{ gap: 2 }}>
            <AppText variant="section">{t('canAdd')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('canAddSub')}
            </AppText>
          </View>
        )}
        {!!available.length && <Card style={{ paddingVertical: 2, gap: 0 }}>{available.map((i, n) => row(i, n === available.length - 1))}</Card>}
      </ScrollView>

      {/* preview: the real card with live data, then Add / Take off */}
      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <Pressable onPress={() => setPreview(null)} style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.45)' }} accessibilityLabel={t('close')} />
        {preview && (
          <View
            style={{
              maxHeight: '85%',
              backgroundColor: colors.bg,
              borderTopLeftRadius: radius.cardLg,
              borderTopRightRadius: radius.cardLg,
              padding: spacing.screen,
              gap: spacing.lg,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge size={36} bg={preview.bg} round>
                <preview.Icon color={preview.fg} size={18} />
              </IconBadge>
              <AppText variant="section" style={{ flex: 1 }} numberOfLines={1}>
                {preview.title}
              </AppText>
            </View>
            <AppText variant="caption" color="textMuted">
              {t('preview')}
            </AppText>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: spacing.sm }}>
              {preview.feature ? (
                <FeaturePreview featureKey={preview.feature} />
              ) : preview.core === 'shortcuts' ? (
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <LayoutList color={colors.textSoft} size={20} />
                  <AppText color="textSoft" style={{ flex: 1 }}>
                    {preview.sub}
                  </AppText>
                </Card>
              ) : (
                <CorePreview section={preview.core!} />
              )}
              {preview.core && preview.core !== 'glance' && preview.core !== 'shortcuts' && (
                <AppText variant="caption" color="textFaint">
                  {t('noPreview')}
                </AppText>
              )}
            </ScrollView>
            <Button
              label={on(preview.key) ? t('remove') : t('add')}
              variant={on(preview.key) ? 'outline' : 'primary'}
              onPress={() => {
                set(preview.key, !on(preview.key));
                setPreview(null);
              }}
            />
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}
