// Design tokens — source of truth: design/TOKENS.md (v2 light theme, design/v2/html).
// Every color in the app must come from here.

export const colors = {
  // surfaces
  bg: '#F3F6FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F8FC',
  chip: '#E9EEF6',
  track: '#E9EEF6',
  border: '#E6EBF3',
  borderBlue: '#D6E2F5',
  borderDashed: '#B9D0F7',

  // text
  text: '#0B1A33',
  textSoft: '#3B475E',
  textMuted: '#66728A',
  textFaint: '#97A1B5',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.80)',
  glass: 'rgba(255,255,255,0.16)',
  glassBorder: 'rgba(255,255,255,0.28)',

  // brand (manager = blue)
  primary: '#1F6FEB',
  primaryDark: '#1557C0',
  primaryLight: '#2E9BF0',
  primaryTint: '#E8F0FE',
  navy: '#0B2A5B',
  cyan: '#2EC4D6',

  // employee = purple
  purple: '#6D4AFF',
  purpleDark: '#3B1E8F',
  purpleText: '#5B3BE0',
  purpleLight: '#A78BFA',
  purpleTint: '#EFEBFF',
  purpleBorder: '#D9D0FF',

  // status
  green: '#16A37A',
  greenText: '#0E7A5A',
  greenLight: '#34D399',
  greenTint: '#E3F7EF',
  mint: '#5BF0B5',
  amber: '#F59E0B',
  amberText: '#E8900C',
  amberStrong: '#8A5A00',
  amberTint: '#FFF4E0',
  gold: '#FFB547',
  goldLight: '#FFC24D',
  red: '#E5484D',
  redTint: '#FDECEC',

  // points
  // brand (logo only: the indigo dot of the wordmark)
  brandIndigo: '#5048E5',
  orange: '#F26A1B',
  orangeText: '#E2580B',
  orangeTint: '#FFF1E8',

  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;

/** Gradient stops (use with expo-linear-gradient, start {0,0} → end {1,1}). */
export const gradients = {
  heroManager: ['#0B2A5B', '#1F6FEB', '#2EC4D6'],
  heroEmployee: ['#3B1E8F', '#6D4AFF', '#2EC4D6'],
  primary: ['#1F6FEB', '#2E9BF0'],
  purple: ['#6D4AFF', '#1F6FEB'],
  points: ['#FFB547', '#F26A1B'],
  success: ['#16A37A', '#34D399'],
  warning: ['#FFC24D', '#F59E0B'],
  avatarBlue: ['#1F6FEB', '#2EC4D6'],
  avatarPurple: ['#6D4AFF', '#A78BFA'],
  avatarGreen: ['#0EA5A4', '#34D399'],
  avatarOrange: ['#F26A1B', '#FFB547'],
  // the logo's arrow, purple → yellow (brand accents only, not for screens)
  brand: ['#5B3BFF', '#C13BF0', '#FF4FA0', '#FF9F1C', '#FFD60A'],
} as const satisfies Record<string, readonly [string, string, ...string[]]>;

export type GradientToken = keyof typeof gradients;

/** Soft blue-tinted shadows from the mockups (RN boxShadow syntax). */
export const shadows = {
  card: '0px 4px 18px rgba(11,42,91,0.07)',
  tile: '0px 4px 14px rgba(11,42,91,0.06)',
  raised: '0px 8px 24px rgba(11,42,91,0.10)',
  nav: '0px -6px 24px rgba(11,42,91,0.08)',
  primary: '0px 8px 20px rgba(31,111,235,0.30)',
  purple: '0px 8px 20px rgba(109,74,255,0.30)',
  mic: '0px 10px 24px rgba(31,111,235,0.40)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  screen: 22,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  tile: 16,
  button: 18,
  card: 20,
  cardLg: 22,
  hero: 28,
  pill: 999,
} as const;

// English: Karla body + Playfair Display headings. Arabic: Tajawal for both.
export const fontFamily = {
  en: {
    regular: 'Karla_400Regular',
    medium: 'Karla_500Medium',
    semibold: 'Karla_600SemiBold',
    bold: 'Karla_700Bold',
    extrabold: 'Karla_800ExtraBold',
  },
  ar: {
    regular: 'Tajawal_400Regular',
    medium: 'Tajawal_500Medium',
    semibold: 'Tajawal_700Bold',
    bold: 'Tajawal_700Bold',
    extrabold: 'Tajawal_800ExtraBold',
  },
  display: {
    en: 'PlayfairDisplay_600SemiBold',
    ar: 'Tajawal_800ExtraBold',
  },
} as const;

export type FontWeightName = keyof typeof fontFamily.en;

export const fontSize = {
  micro: 11,
  caption: 12,
  small: 13,
  body: 14,
  cardTitle: 15,
  lead: 16,
  section: 17,
  stat: 18,
  title: 20,
  titleLg: 26,
  big: 24,
  hero: 60,
} as const;

export const sizes = {
  touch: 44,
  buttonHeight: 52,
  tabBarHeight: 84,
  micButton: 64,
} as const;
