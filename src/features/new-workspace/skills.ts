// Screen 20: profile skill slugs (e.g. "arabic-typography") → localized labels.
// Known slugs live in strings.ts under `skill.*` (en + ar); unknown slugs fall back to a humanized slug.
import type { TFunction } from 'i18next';

export const MAX_SKILLS = 3;

/** "arabic-typography" → "Arabic typography". */
export function humanizeSlug(slug: string): string {
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : slug;
}

export function skillLabel(slug: string, t: TFunction): string {
  const key = slug.trim().toLowerCase();
  return String(t(`skill.${key}`, { defaultValue: humanizeSlug(key) }));
}

/** Localized labels for up to MAX_SKILLS skills, de-duplicated. */
export function skillLabels(slugs: string[], t: TFunction): string[] {
  return Array.from(new Set(slugs.map((s) => skillLabel(s, t)))).slice(0, MAX_SKILLS);
}
