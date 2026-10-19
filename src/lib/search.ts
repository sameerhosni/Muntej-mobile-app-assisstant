// Forgiving text matching for search boxes: ignores case, Arabic diacritics/tatweel and the usual spelling
// variants (أ/إ/آ → ا, ة → ه, ى → ي), so "عرض علم" finds "عَرض لِعلم" and "SAAD" finds "Saad".

export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '') // harakat, superscript alef, tatweel
    .replace(/[̀-ͯ]/g, '') // latin accents
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of the query appears in at least one of the fields (empty query matches all). */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const hay = normalizeForSearch(fields.filter(Boolean).join(' '));
  return q.split(' ').every((w) => hay.includes(w));
}
