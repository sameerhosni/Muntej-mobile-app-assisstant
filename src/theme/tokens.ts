// Design tokens — source of truth: design/TOKENS.md (dark theme from the mockups).
// Every color in the app must come from here.

export const colors = {
  bg: '#0B1426',
  surface: '#121E36',
  surfaceAlt: '#1C2C4A',
  navBg: '#0E1930',
  navBorder: '#1C2A47',
  border: '#23324F',
  track: '#1A2846',
  text: '#EAF2FF',
  textMuted: '#8FA3C4',
  textSoft: '#C9D6EC',
  textDim: '#3B4D70',
  teal: '#2DD4BF',
  tealDeep: '#10302F',
  onTeal: '#062420',
  amber: '#F5B547',
  amberDeep: '#2A2312',
  amberSoft: '#D9C9A3',
  red: '#FF9B93',
  redDeep: '#2A1A1C',
  blue: '#5EB3E4',
  purple: '#C79BF2',
  toggleOff: '#2A3A5C',
  knob: '#EAF2FF',
  ringOuter: '#1E3B4A',
  ringInner: '#23546A',
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;

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
  sm: 12,
  md: 14,
  button: 16,
  card: 18,
  cardLg: 24,
  pill: 999,
} as const;

export const fontFamily = {
  en: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  ar: {
    regular: 'Tajawal_400Regular',
    medium: 'Tajawal_500Medium',
    semibold: 'Tajawal_700Bold',
    bold: 'Tajawal_700Bold',
    extrabold: 'Tajawal_800ExtraBold',
  },
  mono: {
    medium: 'IBMPlexMono_500Medium',
    semibold: 'IBMPlexMono_600SemiBold',
  },
} as const;

export type FontWeightName = keyof typeof fontFamily.en;

export const fontSize = {
  micro: 11,
  caption: 12,
  small: 13,
  body: 14,
  cardTitle: 15,
  cardTitleLg: 17,
  lead: 18,
  title: 22,
  titleLg: 24,
  stat: 20,
  hero: 56,
} as const;

export const sizes = {
  touch: 44,
  buttonHeight: 52,
  tabBarHeight: 80,
} as const;
