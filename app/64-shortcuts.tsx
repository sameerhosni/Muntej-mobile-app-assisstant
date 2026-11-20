// Screen 64 · Your shortcuts — no mockup (owner, 20 Nov: "like android user experience … open only selected one"; the
// side panel / Saree3 picture he chose from). Pick up to 6 places and their order: "Your shortcuts" (move up, move
// down, take off: buttons, not dragging) and "You can add". They open from the side panel on Home or from Saree3, as
// chosen in Settings → Saree3. Saved on the server per seat (app_prefs.saree3.shortcuts).
import { Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDown, ArrowUp, ChevronLeft, Minus, Plus } from 'lucide-react-native';
import { AppText, Card, IconBadge, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { MAX_SHORTCUTS, useShortcuts, type ShortcutItem } from '@/features/launcher/shortcuts';
import { LAUNCHER_NS } from '@/features/launcher/strings';
import { featureUsed } from '@/features/launch/launch';

export default function ShortcutsScreen() {
  const { t } = useScreenT(LAUNCHER_NS);
  const { isRTL, lang } = useDirection();
  const sc = useShortcuts();
  const max = formatNumber(MAX_SHORTCUTS, lang);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));
  const keys = sc.keys;
  const full = keys.length >= MAX_SHORTCUTS;
  const set = (next: string[]) => {
    sc.setKeys(next);
    featureUsed('shortcuts');
  };
  const move = (i: number, by: number) => {
    const next = [...keys];
    const [k] = next.splice(i, 1);
    next.splice(i + by, 0, k);
    set(next);
  };
  const rest = sc.catalog.filter((c) => !keys.includes(c.key));

  const small = (label: string, Icon: typeof Plus, onPress: () => void, disabled = false) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: sizes.touch,
        height: sizes.touch,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
      })}
    >
      <Icon color={colors.textSoft} size={18} strokeWidth={2.4} />
    </Pressable>
  );
  const line = (it: ShortcutItem, last: boolean, actions: React.ReactNode) => (
    <View key={it.key} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <IconBadge size={36} bg={it.bg} round>
        <it.Icon color={it.fg} size={18} />
      </IconBadge>
      <AppText weight="bold" numberOfLines={1} style={{ flex: 1 }}>
        {it.label}
      </AppText>
      {actions}
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
        <AppText color="textMuted">{t('sub', { max })}</AppText>

        <AppText variant="section">{t('onList')}</AppText>
        <Card style={{ paddingVertical: 2, gap: 0 }}>
          {sc.items.length ? (
            sc.items.map((it, i) =>
              line(
                it,
                i === sc.items.length - 1,
                <View style={{ flexDirection: 'row' }}>
                  {small(t('up'), ArrowUp, () => move(i, -1), i === 0)}
                  {small(t('down'), ArrowDown, () => move(i, 1), i === sc.items.length - 1)}
                  {small(t('remove'), Minus, () => set(keys.filter((k) => k !== it.key)))}
                </View>,
              ),
            )
          ) : (
            <AppText color="textMuted" style={{ paddingVertical: spacing.lg }}>
              {t('empty')}
            </AppText>
          )}
        </Card>

        {!!rest.length && <AppText variant="section">{t('canAdd')}</AppText>}
        {full && !!rest.length && (
          <AppText variant="caption" color="amberText">
            {t('full', { max })}
          </AppText>
        )}
        {!!rest.length && (
          <Card style={{ paddingVertical: 2, gap: 0 }}>
            {rest.map((it, i) => line(it, i === rest.length - 1, small(t('add'), Plus, () => set([...keys, it.key]), full)))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
