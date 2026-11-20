// Settings → Saree3: how your shortcuts open (owner, 20 Nov: "Both options in saree3 settings"): the side panel on Home
// or from Saree3, each with one line on how it works, and the row that opens the list (screen 64).
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Munti } from '@/features/munti/Munti';
import { useMunti } from '@/features/munti/store';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { useShortcuts, type LauncherStyle } from './shortcuts';
import { LAUNCHER_NS } from './strings';

export function ShortcutsSetting() {
  const { t } = useScreenT(LAUNCHER_NS);
  const { isRTL } = useDirection();
  const sc = useShortcuts();
  const ms = useMunti();
  if (!sc.ready) return null;
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const option = (style: LauncherStyle) => {
    const on = sc.style === style;
    // "From Saree3" needs him on (while he's off, Home shows the side tab anyway)
    const off = style === 'saree3' && !ms.enabled;
    return (
      <Pressable
        key={style}
        onPress={() => sc.setStyle(style)}
        disabled={off}
        accessibilityRole="radio"
        accessibilityState={{ checked: on, disabled: off }}
        accessibilityLabel={t(style === 'panel' ? 'stylePanel' : 'styleSaree3')}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 96,
          padding: spacing.md,
          gap: spacing.xs,
          borderRadius: radius.tile,
          borderWidth: on ? 2 : 1,
          borderColor: on ? colors.primary : colors.border,
          backgroundColor: on ? colors.primaryTint : colors.surface,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <View style={{ height: 32, justifyContent: 'center' }}>
          {style === 'panel' ? <PanelLeft color={on ? colors.primary : colors.textSoft} size={24} /> : <Munti size="sm" />}
        </View>
        <AppText weight="bold" color={on ? 'primary' : 'text'}>
          {t(style === 'panel' ? 'stylePanel' : 'styleSaree3')}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {off ? t('saree3Off') : t(style === 'panel' ? 'stylePanelSub' : 'styleSaree3Sub')}
        </AppText>
      </Pressable>
    );
  };
  return (
    <TourTarget id="settings.shortcuts">
      <Card>
        <View style={{ gap: 2 }}>
          <AppText variant="cardTitle">{t('settingTitle')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('settingHint')}
          </AppText>
        </View>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: spacing.sm }}>
          {option('panel')}
          {option('saree3')}
        </View>
        <Pressable
          onPress={() => router.push('/64-shortcuts' as Href)}
          accessibilityRole="link"
          style={({ pressed }) => ({ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, opacity: pressed ? 0.7 : 1 })}
        >
          <AppText weight="bold" color="primary" style={{ flex: 1 }}>
            {t('editRow')}
          </AppText>
          <Chevron color={colors.primary} size={18} />
        </Pressable>
      </Card>
    </TourTarget>
  );
}
