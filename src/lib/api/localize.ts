// Muntej's own words read from the database (alerts, decisions, chat…) are written in English and Arabic; for someone who
// chose Hindi they go through the localize-text function, which remembers each line. Other languages pass through untouched.
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const CHUNK = 60;
const seen = new Map<string, string>();

async function localizeTexts(texts: string[]): Promise<void> {
  const left = [...new Set(texts.filter((t) => t?.trim() && !seen.has(t)))];
  await Promise.all(
    Array.from({ length: Math.ceil(left.length / CHUNK) }, (_, i) => left.slice(i * CHUNK, (i + 1) * CHUNK)).map(async (chunk) => {
      const { data } = await supabase.functions.invoke<{ texts: string[] }>('localize-text', { body: { lang: 'hi', texts: chunk } });
      data?.texts?.forEach((t, k) => seen.set(chunk[k], t));
    }),
  ).catch(() => {}); // the words as written stay
}

/** The rows with these fields in Hindi when that's the app's language. */
export async function localizeRows<T>(rows: T[], fields: (keyof T)[]): Promise<T[]> {
  if (i18n.language !== 'hi' || !rows.length) return rows;
  const value = (r: T, f: keyof T) => r[f] as unknown as string | null | undefined;
  await localizeTexts(rows.flatMap((r) => fields.map((f) => value(r, f) ?? '')));
  return rows.map((r) => {
    const copy = { ...r };
    for (const f of fields) {
      const v = value(r, f);
      if (v && seen.has(v)) copy[f] = seen.get(v) as T[keyof T];
    }
    return copy;
  });
}
