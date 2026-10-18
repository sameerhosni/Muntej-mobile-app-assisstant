import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, LayoutGrid, Lightbulb, X } from 'lucide-react-native';
import { AppText, Gradient } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { PROTO_NS } from './strings';
import { filteredScreens, proto, PROTO_SCREENS, useProto } from './store';

/**
 * Floating prototype control (only while the prototype is active).
 * Collapsed: a small bulb button on the screen edge. Expanded: tip + Previous / All screens / Next.
 */
export function ProtoBar() {
  const { t } = useScreenT(PROTO_NS);
  const { t: tg } = useScreenT('screens');
  const { isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const s = useProto();
  const current = PROTO_SCREENS.find((x) => x.route === pathname);
  const [open, setOpen] = useState(true);

  // show the tip each time a new screen opens
  useEffect(() => {
    if (current) setOpen(true);
  }, [current?.num]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.active || !current) return null;

  const list = filteredScreens(s);
  const idx = list.findIndex((x) => x.num === current.num);
  const go = (d: number) => {
    if (!list.length) return;
    const i = idx < 0 ? 0 : (idx + d + list.length) % list.length;
    router.navigate(list[i].route as Href);
  };
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const side = isRTL ? { left: 0 } : { right: 0 };

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('tryThis')}
        style={{
          position: 'absolute',
          top: '46%',
          ...side,
          width: sizes.touch,
          height: sizes.touch + 8,
          borderTopLeftRadius: isRTL ? 0 : radius.md,
          borderBottomLeftRadius: isRTL ? 0 : radius.md,
          borderTopRightRadius: isRTL ? radius.md : 0,
          borderBottomRightRadius: isRTL ? radius.md : 0,
          overflow: 'hidden',
          boxShadow: shadows.primary,
        }}
      >
        <Gradient name="primary" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Lightbulb color={colors.onDark} size={20} strokeWidth={2} />
        </Gradient>
      </Pressable>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 64, alignItems: 'center', paddingHorizontal: spacing.lg }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 360,
          backgroundColor: colors.text,
          borderRadius: radius.card,
          padding: spacing.lg,
          gap: spacing.md,
          boxShadow: shadows.raised,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="caption" weight="extrabold" color="cyan">
            {current.num}
          </AppText>
          <AppText variant="small" weight="bold" color="onDark" style={{ flex: 1 }} numberOfLines={1}>
            {tg(current.num)}
            {idx >= 0 ? `  ·  ${t('position', { i: idx + 1, n: list.length })}` : ''}
          </AppText>
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="—" hitSlop={10}>
            <ChevronRight color={colors.onDarkMuted} size={18} strokeWidth={2} style={{ transform: [{ rotate: '90deg' }] }} />
          </Pressable>
          <Pressable onPress={() => proto.stop()} accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={10}>
            <X color={colors.onDarkMuted} size={18} strokeWidth={2} />
          </Pressable>
        </View>
        <AppText variant="small" color="onDark">
          <AppText variant="small" weight="extrabold" color="gold">
            {t('tryThis')}{' '}
          </AppText>
          {t(`t${current.num}`)}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <BarButton label={t('previous')} onPress={() => go(-1)} icon={<ChevronLeft color={colors.onDark} size={16} strokeWidth={2.2} style={flip} />} />
          <BarButton label={t('hub')} onPress={() => router.navigate('/prototype')} icon={<LayoutGrid color={colors.onDark} size={15} strokeWidth={2} />} />
          <BarButton label={t('next')} primary onPress={() => go(1)} iconEnd={<ChevronRight color={colors.onDark} size={16} strokeWidth={2.2} style={flip} />} />
        </View>
      </View>
    </View>
  );
}

function BarButton({
  label,
  onPress,
  icon,
  iconEnd,
  primary,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  iconEnd?: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: sizes.touch - 4,
        borderRadius: radius.pill,
        backgroundColor: primary ? colors.primary : 'rgba(255,255,255,0.12)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <AppText variant="caption" weight="bold" color="onDark" numberOfLines={1}>
        {label}
      </AppText>
      {iconEnd}
    </Pressable>
  );
}
