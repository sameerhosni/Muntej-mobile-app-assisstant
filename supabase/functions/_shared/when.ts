// Reading a date from what someone typed or said ("بكرة", "الخميس الساعة 3", "آخر الأسبوع", "next Sunday 10am"), in
// Saudi time (owner, 10 Nov: "Muntej must understand whatever you type or say … and any other phrases like this").
// OpenAI, so only for people who allowed AI; when it can't tell, the caller offers quick buttons instead.
import { requireEnv } from './http.ts';

const RIYADH_MS = 3 * 3_600_000;
/** the working day ends at 17:00 Riyadh: a date with no time means that */
const END_OF_DAY_H = 17;

/** ISO date-time in Riyadh time for the given text, or null when it isn't clearly a date */
export async function readWhen(text: string, now = new Date()): Promise<string | null> {
  const model = Deno.env.get('PARSE_MODEL') ?? 'gpt-5-mini';
  const today = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: 'low' } : {}),
      messages: [
        {
          role: 'system',
          content: `Turn the user's words into one due date and time in Saudi Arabia (Asia/Riyadh, UTC+03:00). Now: ${today}. The Saudi week is Sunday–Thursday; Friday and Saturday are the weekend. Arabic (Saudi, Egyptian, Gulf), English or Hindi. "بكرة" = tomorrow, "بعد بكرة" = the day after, "الخميس" = the coming Thursday, "آخر الأسبوع" = this Thursday, "الأسبوع الجاي" = next Sunday, "الساعة 3" in working context = 15:00, "الصبح" ≈ 09:00, "الظهر" ≈ 12:00, "العصر" ≈ 15:30, "المغرب" ≈ 18:00, "بالليل" ≈ 21:00. No time given → ${END_OF_DAY_H}:00. A date in the past means the next one. clear = false when the words are not a date at all, or could mean very different dates.`,
        },
        { role: 'user', content: text.slice(0, 300) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'when',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { clear: { type: 'boolean' }, due_at: { type: ['string', 'null'], description: 'ISO 8601 with +03:00' } },
            required: ['clear', 'due_at'],
          },
        },
      },
    }),
  });
  if (!res.ok) return null;
  const out = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  try {
    const r = JSON.parse(out.choices?.[0]?.message?.content ?? '{}') as { clear?: boolean; due_at?: string | null };
    if (!r.clear || !r.due_at || Number.isNaN(Date.parse(r.due_at))) return null;
    // never in the past
    return Date.parse(r.due_at) > now.getTime() - 60_000 ? new Date(Date.parse(r.due_at)).toISOString() : null;
  } catch {
    return null;
  }
}

/** quick choices when the words weren't clear (or AI is off): tomorrow, in 3 days, next Sunday — at 17:00 Riyadh,
 *  skipping the weekend */
export function quickDates(now = new Date()): { key: 'tomorrow' | 'in3' | 'sunday'; at: string }[] {
  const dayStart = (d: Date) => {
    const r = new Date(d.getTime() + RIYADH_MS);
    return Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate()) - RIYADH_MS;
  };
  const at = (days: number) => {
    let t = dayStart(now) + days * 86_400_000;
    // Friday 5 / Saturday 6 in Riyadh → Sunday
    for (let i = 0; i < 2; i++) {
      const wd = new Date(t + RIYADH_MS).getUTCDay();
      if (wd === 5 || wd === 6) t += 86_400_000;
    }
    return new Date(t + END_OF_DAY_H * 3_600_000).toISOString();
  };
  const wd = new Date(now.getTime() + RIYADH_MS).getUTCDay();
  return [
    { key: 'tomorrow', at: at(1) },
    { key: 'in3', at: at(3) },
    { key: 'sunday', at: at(((7 - wd) % 7) || 7) },
  ];
}
