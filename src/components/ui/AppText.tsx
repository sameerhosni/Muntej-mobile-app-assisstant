import { I18nManager, Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fontFamily, fontSize, type ColorToken, type FontWeightName } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';

type Variant = keyof typeof fontSize;

const defaultWeight: Partial<Record<Variant, FontWeightName>> = {
  cardTitle: 'bold',
  stat: 'extrabold',
  big: 'extrabold',
  hero: 'extrabold',
};

// Headings use the display face (Playfair Display EN / Tajawal AR) unless told otherwise.
const displayVariants: Variant[] = ['title', 'titleLg', 'section'];

export type AppTextProps = TextProps & {
  variant?: Variant;
  weight?: FontWeightName;
  color?: ColorToken;
  /** Force the display (heading) face on/off. Defaults to on for title/titleLg/section. */
  display?: boolean;
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
  display,
  align = 'start',
  style,
  ...rest
}: AppTextProps) {
  const { lang, isRTL } = useDirection();
  const useDisplay = display ?? displayVariants.includes(variant);
  const family = useDisplay ? fontFamily.display[lang] : fontFamily[lang][weight ?? defaultWeight[variant] ?? 'regular'];

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
