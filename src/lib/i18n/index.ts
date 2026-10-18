import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import en from './en';
import ar from './ar';

export type Language = 'en' | 'ar';

const STORAGE_KEY = 'muntej.language';

function deviceLanguage(): Language {
  return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Restore the language the user picked last time (falls back to device language). */
export async function loadSavedLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') await i18n.changeLanguage(saved);
  } catch {
    // keep device language
  }
}

/**
 * Switch language. Layout direction flips immediately via the root `direction` style
 * (see useDirection). forceRTL is also set so native builds start in the right direction;
 * Expo Go resets it, which is why we don't rely on it alone.
 */
export async function setLanguage(lang: Language): Promise<void> {
  await i18n.changeLanguage(lang);
  const rtl = lang === 'ar';
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // non-fatal
  }
}

export function useDirection() {
  const { i18n: inst } = useTranslation();
  const lang: Language = inst.language === 'ar' ? 'ar' : 'en';
  const isRTL = lang === 'ar';
  return { lang, isRTL, direction: isRTL ? ('rtl' as const) : ('ltr' as const) };
}

export default i18n;
