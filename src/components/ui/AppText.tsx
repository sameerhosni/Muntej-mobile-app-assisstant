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
      // Android's default "highQuality" line breaking measures Arabic in our fonts a little short: the last word
      // wrapped onto a line the bubble didn't make room for, so it vanished. "simple" measures what it draws.
      textBreakStrategy="simple"
      {...rest}
      style={[
        {
          fontFamily: family,
          fontSize: fontSize[variant],
          color: colors[color],
          textAlign: resolveAlign(align, isRTL),
          writingDirection: isRTL ? 'rtl' : 'ltr',
          // Arabic letters like ر and ي reach a little past the word's edge in our font; Android clipped them ("مدير"
          // showed as "مدي"), so Arabic text gets a hair of room on each side
          ...(isRTL ? { paddingHorizontal: 2 } : null),
        },
        style,
      ]}
    />
  );
}
