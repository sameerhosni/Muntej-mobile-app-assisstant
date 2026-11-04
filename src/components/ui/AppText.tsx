import { I18nManager, Platform, Text, type TextProps, type TextStyle } from 'react-native';
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

const RLM = '‏';
const LRM = '‎';
const NBSP = ' ';
const ARABIC_LETTER = /[؀-ۿ]/g;
const LATIN_LETTER = /[A-Za-z]/g;
/** at least this many words make a sentence; shorter (a name, a label) keeps the screen's side */
const SENTENCE_WORDS = 4;

const textOf = (children: TextProps['children']): string =>
  (Array.isArray(children) ? children : [children]).filter((c) => typeof c === 'string' || typeof c === 'number').join('');

/**
 * Arabic reads right to left and English left to right, whatever language the app is in (owner, 5 Nov). A name or a
 * short label in the other script stays on the screen's side, so it doesn't jump away from what it belongs to.
 */
function directionOf(text: string, isRTL: boolean): 'rtl' | 'ltr' {
  const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
  const latin = text.match(LATIN_LETTER)?.length ?? 0;
  if (!arabic && !latin) return isRTL ? 'rtl' : 'ltr';
  const words = text.trim().split(/\s+/).length;
  if (isRTL) return !arabic && words >= SENTENCE_WORDS ? 'ltr' : 'rtl';
  return arabic > latin && words >= SENTENCE_WORDS ? 'rtl' : 'ltr';
}

/**
 * Android ignores writingDirection: it takes a paragraph's direction from its first letter, so Arabic that starts with
 * a name in English, a quote mark or an emoji ("✅ Sameer وافق: «…»") came out left to right and jumbled. So each line
 * starts with a direction mark (strings only; nested elements are left as they are). Arabic also ends with a
 * no-break space: Android measures some Arabic words a little short and cut their last letter ("مدير" showed as "مدي").
 */
function markChildren(children: TextProps['children'], dir: 'rtl' | 'ltr'): TextProps['children'] {
  const mark = dir === 'rtl' ? RLM : LRM;
  const fix = (x: unknown, last: boolean) => {
    if (typeof x !== 'string') return x;
    const marked = x
      .split('\n')
      .map((l) => (l.startsWith(mark) ? l : mark + l))
      .join('\n');
    return dir === 'rtl' && last && !marked.endsWith(' ') ? `${marked} ` : marked;
  };
  if (Array.isArray(children)) {
    // only the first string decides the paragraph's direction; the last one gets the room
    const first = children.findIndex((c) => typeof c === 'string' && c.trim());
    if (first < 0) return children;
    const end = children.length - 1;
    return children.map((c, k) => (k === first ? fix(c, k === end) : k === end && dir === 'rtl' && typeof c === 'string' ? `${c} ` : c)) as TextProps['children'];
  }
  return fix(children, true) as TextProps['children'];
}

/**
 * start needs no side at all: with its direction set, text sits where it begins (right for Arabic, left for English).
 * Asking for a side wrongly is what put Arabic on the left on Android, where 'left' simply means left; iOS still swaps.
 */
function resolveAlign(align: 'start' | 'center' | 'end', dir: 'rtl' | 'ltr'): TextStyle['textAlign'] {
  if (align === 'center') return 'center';
  if (align === 'start') return undefined;
  const wantRight = dir === 'ltr';
  const swapped = Platform.OS === 'ios' && !!I18nManager.isRTL;
  return wantRight !== swapped ? 'right' : 'left';
}

export function AppText({
  variant = 'body',
  weight,
  color = 'text',
  display,
  align = 'start',
  style,
  children,
  ...rest
}: AppTextProps) {
  const { lang, isRTL } = useDirection();
  const useDisplay = display ?? displayVariants.includes(variant);
  const family = useDisplay ? fontFamily.display[lang] : fontFamily[lang][weight ?? defaultWeight[variant] ?? 'regular'];
  const dir = directionOf(textOf(children), isRTL);

  return (
    <Text
      // Android's default "highQuality" line breaking measures Arabic in our fonts a little short: the last word
      // wrapped onto a line the bubble didn't make room for, so it vanished. "simple" measures what it draws.
      textBreakStrategy="simple"
      {...rest}
      children={isRTL || dir === 'rtl' ? markChildren(children, dir) : children}
      style={[
        {
          fontFamily: family,
          fontSize: fontSize[variant],
          color: colors[color],
          textAlign: resolveAlign(align, dir),
          writingDirection: dir,
          // Arabic letters like ر and ي reach a little past the word's edge in our font; Android clipped them ("مدير"
          // showed as "مدي"), so Arabic text gets a hair of room on each side
          ...(dir === 'rtl' ? { paddingHorizontal: 2 } : null),
        },
        style,
      ]}
    />
  );
}
