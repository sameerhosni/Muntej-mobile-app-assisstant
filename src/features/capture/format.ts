import type { Language } from '@/lib/i18n';

// Gregorian calendar + Latin digits in Arabic too, matching the mockups.
function locale(lang: Language) {
  return lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US';
}

function fmt(date: Date, lang: Language, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale(lang), opts).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function time(date: Date, lang: Language) {
  const opts: Intl.DateTimeFormatOptions =
    date.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' };
  return fmt(date, lang, opts);
}

/** "Thu, Oct 22 · 5 PM" */
export function formatDue(iso: string, lang: Language) {
  const d = new Date(iso);
  return `${fmt(d, lang, { weekday: 'short', month: 'short', day: 'numeric' })} · ${time(d, lang)}`;
}

/** Plan step label: "Now" or "Tue 9 AM". */
export function formatStep(iso: string, lang: Language, nowLabel: string) {
  const d = new Date(iso);
  if (Math.abs(d.getTime() - Date.now()) < 15 * 60_000) return nowLabel;
  return `${fmt(d, lang, { weekday: 'short' })} ${time(d, lang)}`;
}

/** Short day chip label for the edit form: "Today", "Thu 22". */
export function dayChip(date: Date, lang: Language) {
  return fmt(date, lang, { weekday: 'short', day: 'numeric' });
}

export function timeChip(hour: number, lang: Language) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return time(d, lang);
}
