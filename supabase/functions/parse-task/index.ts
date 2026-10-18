// parse-task — turns one spoken/typed sentence into a structured task + follow-up plan (OpenAI, model via PARSE_MODEL).
// Input: { text: string, lang?: 'en' | 'ar' }. Output: ParsedTask (see schema below).
// The team list comes from the caller's own RLS view, so Claude can only assign people they can see.
import { z } from 'npm:zod@4.6.7';
import { getCaller, HttpError, json, requireEnv, serve } from '../_shared/http.ts';

const FollowupStep = z.object({
  at: z.string().describe('ISO 8601 datetime with +03:00 offset'),
  kind: z.enum(['brief', 'check', 'risk', 'collect']),
  channel: z.enum(['whatsapp', 'in_app', 'push', 'email']),
  summary: z.string().describe('What Muntej will do, shown to the manager, e.g. "Check where he is at"'),
  message: z.string().describe('The friendly message Muntej sends to the owner'),
});

const ParsedTask = z.object({
  language: z.enum(['en', 'ar']),
  title: z.string(),
  owner_id: z.string().nullable(),
  helper_id: z.string().nullable(),
  helper_reason: z.string().nullable().describe('What the helper helps with, e.g. "numbers"'),
  due_at: z.string().nullable().describe('ISO 8601 datetime with +03:00 offset'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  goal: z.string().nullable(),
  definition_of_done: z.string().nullable(),
  budget: z.string().nullable(),
  workspace_id: z.string().nullable(),
  missing: z.array(z.enum(['owner', 'due', 'definition_of_done', 'budget'])),
  followup_plan: z.array(FollowupStep),
});
export type ParsedTask = z.infer<typeof ParsedTask>;

// OpenAI strict structured output: same schema, minus the $schema marker it doesn't accept.
const { $schema: _ignored, ...RESPONSE_SCHEMA } = z.toJSONSchema(ParsedTask) as Record<string, unknown>;

// Frozen system prompt (no dates or per-request data) so the provider can cache the prefix.
const SYSTEM = `You are Muntej, an AI task assistant for managers in Saudi companies. A manager says one sentence; you turn it into a task so they can "create it and forget it".

Rules:
- Write title, goal, definition_of_done, helper_reason and summaries in the language the manager used ("language"). Saudi conversational Arabic when Arabic.
- owner_id / helper_id / workspace_id must be ids from the provided lists, or null. Match names loosely (first names, Arabic or English spellings, nicknames).
- Resolve relative dates against the provided current time in Asia/Riyadh. The Saudi work week is Sunday–Thursday. "Before Thursday" means Thursday 17:00 unless a time is said. No time said → 17:00. Output ISO 8601 with +03:00.
- priority: urgent only if the manager signals urgency (today, ASAP, ضروري, عاجل); high for client/exec deadlines within a week; else medium; low if they say no rush.
- definition_of_done: one concrete, checkable sentence inferred from the request (e.g. "Deck sent to Ahmed"). goal: the business goal or client in 1–4 words, null if unclear.
- missing: list the clarity items that are NOT known from the sentence (owner, due, definition_of_done, budget). Budget is missing unless money/resources are mentioned or clearly not needed.
- followup_plan, so the manager never chases: 3–5 steps, chronological, inside working hours (Sun–Thu 09:00–17:00 Riyadh, never after 21:00 or on Friday).
  1. kind "brief" now (current time) on whatsapp: brief the owner and ask for a confirm; mention the helper if any.
  2. one or two kind "check" steps spread before the due date: ask for progress.
  3. kind "risk" step around 60–70% of the way to the due date: if progress is under 50%, flag to the manager with a ready fix.
  4. kind "collect" at the due date: collect the deliverable and send it to the manager.
  For due dates under 24h, use brief + one check + collect. With no due date, plan brief + check in 2 working days.
  When there is a due date, the LAST step is always exactly one "collect" step at due_at.
  "message" is what the owner receives: short, warm, respectful; Saudi conversational Arabic if the owner prefers Arabic or the manager spoke Arabic.`;

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { db, profileId } = await getCaller(req);

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const sentence = (text ?? '').trim();
  if (!sentence) throw new HttpError(400, 'Say or type the task first');
  if (sentence.length > 4000) throw new HttpError(413, 'That is too long for one task');

  const [{ data: team }, { data: workspaces }] = await Promise.all([
    db.from('profiles').select('id, full_name, full_name_ar, role, title, skills, locale, manager_id'),
    db.from('workspaces').select('id, name, name_ar, goal'),
  ]);

  const me = team?.find((p) => p.id === profileId);
  const now = new Date();
  const riyadhNow = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const context = {
    current_time_riyadh: `${riyadhNow} (${now.toISOString()} UTC)`,
    manager: me ? { id: me.id, name: me.full_name } : { id: profileId },
    team: (team ?? [])
      .filter((p) => p.id !== profileId)
      .map((p) => ({
        id: p.id,
        name: p.full_name,
        name_ar: p.full_name_ar,
        title: p.title,
        skills: p.skills,
        prefers: p.locale,
      })),
    workspaces: workspaces ?? [],
  };

  const model = Deno.env.get('PARSE_MODEL') ?? 'gpt-5-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      // reasoning models (gpt-5*, o*) accept an effort hint; extraction needs little
      ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: Deno.env.get('PARSE_REASONING') ?? 'minimal' } : {}),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Context:\n${JSON.stringify(context)}\n\nManager said:\n"""${sentence}"""` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'parsed_task', strict: true, schema: RESPONSE_SCHEMA } },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('OpenAI error', res.status, detail);
    if (res.status === 429) throw new HttpError(429, 'Muntej is busy, try again in a moment');
    if (res.status === 401) throw new HttpError(500, 'AI key is invalid (OPENAI_API_KEY)');
    throw new HttpError(502, `AI error ${res.status}: ${detail}`.slice(0, 300));
  }

  const out = (await res.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  };
  const message = out.choices?.[0]?.message;
  if (message?.refusal) throw new HttpError(422, 'Muntej could not process that request');
  let raw: unknown;
  try {
    raw = JSON.parse(message?.content ?? '');
  } catch {
    throw new HttpError(502, 'Could not understand the task, try rephrasing');
  }
  const result = ParsedTask.safeParse(raw);
  if (!result.success) throw new HttpError(502, 'Could not understand the task, try rephrasing');
  const parsed = result.data;

  // Guarantee the plan ends by collecting the deliverable on the due date.
  if (parsed.due_at && parsed.followup_plan.length && parsed.followup_plan.at(-1)!.kind !== 'collect') {
    parsed.followup_plan.push({
      at: parsed.due_at,
      kind: 'collect',
      channel: 'in_app',
      summary: parsed.language === 'ar' ? 'أجمع التسليم وأرسله لك' : 'Collect the deliverable and send it to you',
      message: parsed.language === 'ar' ? 'اليوم موعد التسليم، ارفعه لو سمحت.' : 'It is due today. Please upload it here.',
    });
  }

  // Never trust ids blindly: drop anything not in the caller's visible lists.
  const teamIds = new Set((team ?? []).map((p) => p.id));
  const wsIds = new Set((workspaces ?? []).map((w) => w.id));
  if (parsed.owner_id && !teamIds.has(parsed.owner_id)) parsed.owner_id = null;
  if (parsed.helper_id && !teamIds.has(parsed.helper_id)) parsed.helper_id = null;
  if (parsed.workspace_id && !wsIds.has(parsed.workspace_id)) parsed.workspace_id = null;

  return json({ ...parsed, transcript: sentence });
});
