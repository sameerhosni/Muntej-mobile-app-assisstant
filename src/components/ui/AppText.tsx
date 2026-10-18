import { I18nManager, Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fontFamily, fontSize, type ColorToken, type FontWeightName } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';

type Variant = keyof typeof fontSize;

const defaultWeight: Partial<Record<Variant, FontWeightName>> = {
  title: 'extrabold',
  titleLg: 'extrabold',
  cardTitle: 'bold',
  cardTitleLg: 'bold',
  lead: 'bold',
};

export type AppTextProps = TextProps & {
  variant?: Variant;
  weight?: FontWeightName;
  color?: ColorToken;
  /** IBM Plex Mono for numbers and stats. */
  mono?: boolean;
  align?: 'start' | 'center' | 'end';
};

/** Visual 'left'/'right' for start/end, compensating for RN's own swap when native RTL is on. */
function resolveAlign(align: 'start' | 'center' | 'end', isRTL: boolean): TextStyle['textAlign'] {
  if (align === 'center') return 'center';
  const wantRight = (align === 'end') !== isRTL;
  const swapped = !!I18nManager.isRTL; // undefined on web
  return wantRight !== swapped ? 'right' : 'left';
}

export function AppText({
  variant = 'body',
  weight,
  color = 'text',
  mono = false,
  align = 'start',
  style,
  ...rest
}: AppTextProps) {
  const { lang, isRTL } = useDirection();
  const w = weight ?? defaultWeight[variant] ?? 'regular';
  const family = mono
    ? w === 'medium' || w === 'regular'
      ? fontFamily.mono.medium
      : fontFamily.mono.semibold
    : fontFamily[lang][w];

  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: family,
          fontSize: fontSize[variant],
          color: colors[color],
          textAlign: resolveAlign(align, isRTL),
          writingDirection: isRTL ? 'rtl' : 'ltr',
        },
        style,
      ]}
    />
  );
}
