import { useTranslation } from 'react-i18next';
import i18n from './index';

type Dict = { [key: string]: string | Dict };

/**
 * Per-screen strings: each screen owns `strings.ts` that calls registerStrings('s14', { en, ar })
 * at import time, so screens never edit the shared en.ts / ar.ts files.
 */
export function registerStrings<T extends Dict>(ns: string, bundle: { en: T; ar: T }) {
  i18n.addResourceBundle('en', 'translation', { [ns]: bundle.en }, true, true);
  i18n.addResourceBundle('ar', 'translation', { [ns]: bundle.ar }, true, true);
  return ns;
}

/** t() scoped to a screen namespace: useScreenT('s14')('title') → 's14.title'. */
export function useScreenT(ns: string) {
  return useTranslation('translation', { keyPrefix: ns });
}
