import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, radius, shadows, spacing, type ColorToken } from '@/theme/tokens';
import { AppText } from './AppText';
import { IconBadge } from './IconBadge';

type Props = {
  value: string | number;
  label: string;
  icon?: ReactNode;
  /** Icon square background (white tiles) or solid color (glass tiles on a hero). */
  iconBg?: ColorToken;
  /** 'card' = white tile, 'glass' = translucent tile on a gradient hero. */
  variant?: 'card' | 'glass';
};

export function StatTile({ value, label, icon, iconBg = 'primaryTint', variant = 'card' }: Props) {
  const glass = variant === 'glass';
  // values must never ellipsize: step the size down for longer values ("2.5 ريال", "1,280")
  const len = String(value).length;
  const valueSize = len <= 3 ? undefined : len <= 6 ? 15 : 13;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: glass ? colors.glass : colors.surface,
        borderWidth: glass ? 1 : 0,
        borderColor: colors.glassBorder,
        borderRadius: radius.tile,
        paddingVertical: 9,
        paddingHorizontal: spacing.md,
        gap: 4,
        boxShadow: glass ? undefined : shadows.tile,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && (
          <IconBadge size={24} bg={iconBg}>
            {icon}
          </IconBadge>
        )}
        <AppText variant="stat" color={glass ? 'onDark' : 'text'} numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{ flexShrink: 1, fontSize: valueSize, lineHeight: valueSize ? valueSize + 6 : undefined }}
        >
          {value}
        </AppText>
      </View>
      <AppText variant="micro" color={glass ? 'onDarkMuted' : 'textMuted'} numberOfLines={2}>
        {label}
      </AppText>
    </View>
  );
}
