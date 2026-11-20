// Your shortcuts from Saree3 (owner, 20 Nov: "Both options in saree3 settings"): with "From Saree3" chosen in Settings,
// a tap on Saree3 opens your places in a column above him (below him when he sits high), Android's speed dial: icon
// over him, its name toward the middle of the screen. Then "Ask Saree3" (his usual quick asks), Everything, Edit.
// A tap outside, Back, or picking a place closes it. Hold him to talk, as before.
// Placed by where Saree3 really is on screen (measured), inside a left-to-right box, so it lines up in Arabic too.
import { useEffect, type ReactNode } from 'react';
import { BackHandler, Pressable, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import { MessageCircle, Pencil } from 'lucide-react-native';
import { AppText, IconBadge } from '@/components/ui';
import { colors, radius, shadows, spacing, type ColorToken } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { featureUsed } from '@/features/launch/launch';
import { shortcutsOpen, useShortcuts } from './shortcuts';
import { LAUNCHER_NS } from './strings';

/** where Saree3 is, in screen pixels */
export type Anchor = { x: number; y: number; size: number };
const ICON = 48;

export function SpeedDial({ anchor, onAsk }: { anchor: Anchor; onAsk: () => void }) {
  const { t } = useScreenT(LAUNCHER_NS);
  const sc = useShortcuts();
  const { width: screenW, height: screenH } = useWindowDimensions();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (shortcutsOpen.set(false), true));
    return () => sub.remove();
  }, []);
  const go = (href: Href) => {
    shortcutsOpen.set(false);
    featureUsed('shortcuts');
    router.push(href);
  };
  const rows: { key: string; label: string; icon: ReactNode; bg: ColorToken; link: boolean; run: () => void }[] = [
    ...sc.items.map((it) => ({ key: it.key, label: it.label, icon: <it.Icon color={it.fg} size={20} strokeWidth={2.2} />, bg: it.bg, link: true, run: () => go(it.href) })),
    { key: 'more', label: sc.more.label, icon: <sc.more.Icon color={sc.more.fg} size={20} />, bg: sc.more.bg, link: true, run: () => go(sc.more.href) },
    {
      key: 'ask',
      label: t('ask'),
      icon: <MessageCircle color={colors.purple} size={20} strokeWidth={2.2} />,
      bg: 'purpleTint',
      link: false,
      run: () => {
        shortcutsOpen.set(false);
        onAsk();
      },
    },
    { key: 'edit', label: t('edit'), icon: <Pencil color={colors.textSoft} size={18} />, bg: 'chip', link: false, run: () => go('/64-shortcuts' as Href) },
  ];
  const onLeft = anchor.x + anchor.size / 2 < screenW / 2;
  const above = anchor.y + anchor.size / 2 > screenH / 2;
  const inset = (anchor.size - ICON) / 2;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, direction: 'ltr' }}>
      <Pressable
        onPress={() => shortcutsOpen.set(false)}
        accessibilityRole="button"
        accessibilityLabel={t('close')}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.scrim }}
      />
      <View
        style={{
          position: 'absolute',
          ...(onLeft ? { left: anchor.x + inset } : { right: screenW - anchor.x - anchor.size + inset }),
          ...(above ? { bottom: screenH - anchor.y + spacing.sm } : { top: anchor.y + anchor.size + spacing.sm }),
          flexDirection: above ? 'column-reverse' : 'column',
          alignItems: onLeft ? 'flex-start' : 'flex-end',
          gap: spacing.sm,
        }}
      >
        {rows.map((r) => (
          <Pressable
            key={r.key}
            onPress={r.run}
            accessibilityRole={r.link ? 'link' : 'button'}
            accessibilityLabel={r.label}
            style={({ pressed }) => ({ flexDirection: onLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: spacing.sm, minHeight: ICON, opacity: pressed ? 0.8 : 1 })}
          >
            <View style={{ width: ICON, height: ICON, borderRadius: ICON / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', boxShadow: shadows.tile }}>
              <IconBadge size={38} bg={r.bg} round>
                {r.icon}
              </IconBadge>
            </View>
            <View style={{ paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, boxShadow: shadows.tile }}>
              <AppText variant="caption" weight="bold" numberOfLines={1}>
                {r.label}
              </AppText>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
