// Small helpers for showing people and reading decision `details` json.
import type { Json } from '@/lib/api/database.types';
import type { Profile } from '@/lib/api';

type Named = Pick<Profile, 'full_name' | 'full_name_ar'>;

/** Full name in the current language. */
export function displayName(p: Named | null | undefined, lang: string): string {
  if (!p) return '';
  return lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name;
}

/** First name only, as the designs show ("Faisal", "نورة"). */
export function shortName(p: Named | null | undefined, lang: string): string {
  return displayName(p, lang).split(' ')[0] ?? '';
}

function obj(details: Json | null | undefined): Record<string, Json | undefined> {
  return details && typeof details === 'object' && !Array.isArray(details) ? details : {};
}

export function jsonNum(details: Json | null | undefined, key: string): number | null {
  const v = obj(details)[key];
  return typeof v === 'number' ? v : null;
}

export function jsonStr(details: Json | null | undefined, key: string): string | null {
  const v = obj(details)[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** "12m" style relative age, using the screen's string keys agoNow/agoM/agoH/agoD. */
export function ageParts(iso: string): { key: 'agoNow' | 'agoM' | 'agoH' | 'agoD'; n: number } {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return { key: 'agoNow', n: 0 };
  if (mins < 60) return { key: 'agoM', n: mins };
  const h = Math.round(mins / 60);
  if (h < 24) return { key: 'agoH', n: h };
  return { key: 'agoD', n: Math.round(h / 24) };
}
