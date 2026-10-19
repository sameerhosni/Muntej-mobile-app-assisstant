// suggest-skills — "✨ Suggest with AI" on the person form (screen 39).
// Input: { person_id, lang: 'en' | 'ar' }. Reads the person's title, years of experience, current skills and the
// titles of their last 30 tasks as the caller (RLS: only people/tasks the caller may see), asks the model for
// up to 8 detailed skills and returns { skills: [{ name, level 1-5, years|null, notes|null }] }.
// Nothing is saved here: the form merges the suggestions and the user saves through upsert_person.
import { z } from 'npm:zod@4.6.7';
import { getCaller, HttpError, json, requireEnv, serve } from '../_shared/http.ts';

const Skill = z.object({
  name: z.string(),
  level: z.number(), // clamped to 1-5 below
  years: z.number().nullable(),
  notes: z.string().nullable(),
});
const Output = z.object({ skills: z.array(Skill) });

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['skills'],
  properties: {
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'level', 'years', 'notes'],
        properties: {
          name: { type: 'string', description: 'Short skill name, 1-4 words' },
          level: { type: 'integer', description: '1 = beginner, 3 = solid, 5 = expert' },
          years: { type: ['number', 'null'], description: 'Years using this skill, or null if unknown' },
          notes: { type: ['string', 'null'], description: 'One short line of evidence, e.g. which tasks show it' },
        },
      },
    },
  },
};

const SYSTEM = `You help a Saudi company keep an accurate skills profile for each employee, so tasks go to the right person.
From the person's job title, years of experience, the skills already listed and the titles of their recent tasks,
suggest at most 8 concrete, work-relevant skills (tools, domains, abilities) — specific, not generic ("Power BI dashboards", not "computers").
- Keep every skill already listed (same name) and give it the level you think fits; add new skills the tasks clearly show.
- level 1-5: base it on years of experience and how often/complex the related tasks are. Don't inflate.
- years: only when it can be reasonably inferred (never more than total experience); otherwise null.
- notes: one short line of evidence (e.g. "Did 6 of the last 30 tasks: monthly sales reports"); null if none.
- Never invent personal facts; no soft-skill fluff unless the tasks clearly show it.
Write every name and note in the requested language ("en" = English, "ar" = Saudi-friendly Modern Standard Arabic),
translating task wording when the tasks are in the other language; keep an existing skill's name exactly as given. Return JSON only.`;

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { db } = await getCaller(req);

  const body = (await req.json().catch(() => ({}))) as { person_id?: string; lang?: string };
  const personId = (body.person_id ?? '').trim();
  const lang = body.lang === 'ar' ? 'ar' : 'en';
  if (!/^[0-9a-f-]{36}$/i.test(personId)) throw new HttpError(400, 'person_id is required');

  const { data: person, error: pErr } = await db
    .from('profiles')
    .select('id, full_name, title, title_ar, years_experience, skills_detail')
    .eq('id', personId)
    .maybeSingle();
  if (pErr) throw new HttpError(500, pErr.message);
  if (!person) throw new HttpError(404, 'Person not found');

  const { data: tasks, error: tErr } = await db
    .from('tasks')
    .select('title')
    .eq('owner_id', personId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (tErr) throw new HttpError(500, tErr.message);

  const context = {
    title: person.title ?? null,
    title_ar: person.title_ar ?? null,
    years_experience: person.years_experience ?? null,
    current_skills: Array.isArray(person.skills_detail) ? person.skills_detail : [],
    recent_task_titles: (tasks ?? []).map((t) => t.title).filter(Boolean),
    lang,
  };

  const model = Deno.env.get('SKILLS_MODEL') ?? 'gpt-4.1';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(context) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'suggest_skills', strict: true, schema: RESPONSE_SCHEMA } },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('OpenAI error', res.status, detail);
    if (res.status === 429) throw new HttpError(429, 'Muntej is busy, try again in a moment');
    if (res.status === 401) throw new HttpError(500, 'AI key is invalid (OPENAI_API_KEY)');
    throw new HttpError(502, `AI error ${res.status}`);
  }
  const out = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
  const msg = out.choices?.[0]?.message;
  if (msg?.refusal) throw new HttpError(422, 'Muntej could not suggest skills for this person');

  let parsed: z.infer<typeof Output>;
  try {
    const r = Output.safeParse(JSON.parse(msg?.content ?? ''));
    if (!r.success) throw new Error('schema');
    parsed = r.data;
  } catch {
    throw new HttpError(502, 'Muntej got confused, try again');
  }

  const maxYears = typeof person.years_experience === 'number' ? person.years_experience : 60;
  const seen = new Set<string>();
  const skills = parsed.skills
    .map((s) => ({
      name: s.name.trim().slice(0, 60),
      level: Math.min(5, Math.max(1, Math.round(s.level))),
      years: s.years === null || !Number.isFinite(s.years) ? null : Math.min(Math.max(0, Math.round(s.years * 10) / 10), maxYears),
      notes: s.notes?.trim().slice(0, 200) || null,
    }))
    .filter((s) => {
      const k = s.name.toLowerCase();
      if (!s.name || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);

  return json({ skills });
});
