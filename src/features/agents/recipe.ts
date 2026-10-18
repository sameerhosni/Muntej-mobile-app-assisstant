// Agent recipes: the structured form of a routine the manager wrote as a prompt.
// Shape (stored in agents.recipe, compatible with supabase/seed.sql):
//   { trigger: {type:'schedule', cron} | {type:'event', event}, find: {...}, do: [{action, ...}], notify: {channel, when?} | null }
// For now recipes are built LOCALLY with simple keyword rules (EN + Saudi Arabic). No AI call yet.
import { z } from 'zod';
import { ACTIVE_STATUSES, type TaskWithPeople } from '@/lib/api';

export const ACTIONS = ['nudge_owner', 'escalate', 'summarize', 'suggest_kudos', 'create_task'] as const;
export const CHANNELS = ['push', 'email', 'whatsapp'] as const;
export const EVENTS = ['task_overdue', 'task_submitted', 'email_received', 'task_blocked'] as const;

export type Action = (typeof ACTIONS)[number];
export type Channel = (typeof CHANNELS)[number];
export type AgentEvent = (typeof EVENTS)[number];

export const RecipeSchema = z.object({
  template: z.string().optional(),
  trigger: z.discriminatedUnion('type', [
    z.object({ type: z.literal('schedule'), cron: z.string().regex(/^\S+ \S+ \S+ \S+ \S+$/) }),
    z.object({ type: z.literal('event'), event: z.enum(EVENTS) }),
  ]),
  find: z.object({
    status: z.array(z.string()).optional(),
    overdue: z.boolean().optional(),
    at_risk: z.boolean().optional(),
    due_within_days: z.number().int().positive().optional(),
    closed_within_days: z.number().int().positive().optional(),
  }),
  do: z
    .array(
      z.object({
        action: z.enum(ACTIONS),
        tone: z.string().optional(),
        channel: z.enum(CHANNELS).optional(),
      }),
    )
    .min(1),
  notify: z
    .object({
      channel: z.enum(CHANNELS),
      when: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export type Recipe = z.infer<typeof RecipeSchema>;

/** Safe read of a stored recipe (jsonb) — null when it doesn't match the shape. */
export function parseRecipe(json: unknown): Recipe | null {
  const r = RecipeSchema.safeParse(json);
  return r.success ? r.data : null;
}

// ─── Keyword rules ───────────────────────────────────────────────────────────

/** Lowercase, Western digits, and Arabic letter folding (أإآ→ا, ة→ه, ى→ي, no diacritics/tatweel). */
export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[“”«»"]/g, '"')
    .replace(/[‘’]/g, "'");
}

const hasAny = (s: string, words: string[]) => words.some((w) => s.includes(w));

const DAY_RULES: { dow: number; en: RegExp; ar: string[] }[] = [
  { dow: 0, en: /\b(sun|sunday|sundays)\b/, ar: ['الاحد', 'كل احد', 'يوم احد'] },
  { dow: 1, en: /\b(mon|monday|mondays)\b/, ar: ['الاثنين', 'كل اثنين'] },
  { dow: 2, en: /\b(tue|tues|tuesday|tuesdays)\b/, ar: ['الثلاثاء', 'كل ثلاثاء'] },
  { dow: 3, en: /\b(wed|wednesday|wednesdays)\b/, ar: ['الاربعاء', 'كل اربعاء'] },
  { dow: 4, en: /\b(thu|thur|thurs|thursday|thursdays)\b/, ar: ['الخميس', 'كل خميس'] },
  { dow: 5, en: /\b(fri|friday|fridays)\b/, ar: ['الجمعه', 'كل جمعه'] },
  { dow: 6, en: /\b(sat|saturday|saturdays)\b/, ar: ['السبت', 'كل سبت'] },
];

const EVENT_EN = /\b(when|whenever|as soon as|once a|if a|each time|every time)\b/;
const EVENT_AR = ['لما', 'اذا ', 'اول ما', 'كل ما', 'كلما', 'عند ما', 'عندما'];

const OVERDUE_EN = /\b(overdue|late|behind|past due|missed)\b/;
const OVERDUE_AR = ['متاخر', 'تتاخر', 'تاخر', 'فات موعد'];
const RISK_EN = /\b(at risk|risky|might slip|slipping)\b/;
const RISK_AR = ['في خطر', 'خطر تاخير', 'ممكن تتاخر'];
const BLOCKED_EN = /\b(blocked|stuck)\b/;
const BLOCKED_AR = ['معطل', 'متعطل', 'عالق', 'واقف'];
const DONE_EN = /\b(done|completed|finished|closed|wins|got done)\b/;
const DONE_AR = ['خلص', 'منجز', 'انتهت', 'انجز'];
const SOON_EN = /\b(due (this|next) week|due soon|this week|due tomorrow)\b/;
const SOON_AR = ['هالاسبوع', 'هذا الاسبوع', 'قرب موعد', 'بكره'];

const NUDGE_EN = /\b(nudge|nudges|remind|reminder|chase|ping them|follow up|follow-up|check in)\b/;
const NUDGE_AR = ['ذكر', 'تذكير', 'يذكر', 'تابع', 'لاحق'];
const ESCALATE_EN = /\b(escalate|escalation)\b/;
const ESCALATE_AR = ['صعد', 'تصعيد'];
const SUMMARY_EN = /\b(summary|summarize|summarise|recap|digest|report|roundup)\b/;
const SUMMARY_AR = ['ملخص', 'لخص', 'تقرير', 'خلاصه'];
const KUDOS_EN = /\b(kudos|thank|thanks|shout ?out|recogni[sz]e|praise)\b/;
const KUDOS_AR = ['شكر', 'يستاهل', 'تقدير'];
const CREATE_EN = /\b(create a task|make a task|new task|into a task|add a task)\b/;
const CREATE_AR = ['سو مهمه', 'سوي مهمه', 'حوله مهمه', 'مهمه جديده', 'اضف مهمه'];

const NOTIFY_EN = /\b(tell me|email me|notify me|let me know|send me|alert me|ping me|message me|update me|to me|cc me)\b/;
const NOTIFY_AR = ['بلغني', 'ابلغني', 'قل لي', 'قولي', 'ارسل لي', 'علمني', 'عطني', 'خبرني', 'يبلغني', 'لي ايميل'];
const EMAIL_EN = /\b(email|e-mail|mail|inbox)\b/;
const EMAIL_AR = ['ايميل', 'بريد'];
const WHATSAPP_EN = /\bwhats ?app\b/;
const WHATSAPP_AR = ['واتساب', 'واتس'];
const QUOTE_EN = /\b(quote|incoming email|email (comes|arrives)|emails? with)\b/;
const QUOTE_AR = ['عرض سعر', 'يوصل ايميل', 'يجي ايميل', 'وصل ايميل'];
const SUBMIT_EN = /\b(submit|submits|submitted|hands in)\b/;
const SUBMIT_AR = ['سلم', 'يسلم'];

const TIME_RE =
  /(at|الساعه)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.m\.|p\.m\.|am|pm|الصبح|الصباح|صباحا|الظهر|العصر|المغرب|المساء|مساء|بالليل|الليل)?/g;

function findTime(s: string): { h: number; m: number } | null {
  for (const match of s.matchAll(TIME_RE)) {
    const [, at, hRaw, mRaw, mer] = match;
    if (!at && !mRaw && !mer) continue; // a bare number ("3 days") is not a time
    let h = Number(hRaw);
    const m = mRaw ? Number(mRaw) : 0;
    if (h > 23 || m > 59) continue;
    const pm = mer && /p\.?m|العصر|المغرب|المساء|مساء|الليل/.test(mer);
    const noon = mer === 'الظهر';
    const am = mer && /a\.?m|الصبح|الصباح|صباحا/.test(mer);
    if ((pm && h < 12) || (noon && h < 11)) h += 12;
    if (am && h === 12) h = 0;
    return { h, m };
  }
  return null;
}

/** Turn a prompt into a recipe with keyword rules. Always returns a recipe; validate with RecipeSchema. */
export function buildRecipe(prompt: string, template?: string): Recipe {
  const s = normalize(prompt);
  const en = (re: RegExp) => re.test(s);

  // When
  const days = DAY_RULES.filter((d) => d.en.test(s) || hasAny(s, d.ar)).map((d) => d.dow);
  const daily = en(/\b(daily|every day|each day|every morning|each morning)\b/) || hasAny(s, ['كل يوم', 'يوميا', 'كل صباح']);
  const weekdays = en(/\b(weekdays?|workdays?)\b/) || hasAny(s, ['ايام الدوام', 'ايام العمل']);
  const time = findTime(s);
  const isEvent = en(EVENT_EN) || hasAny(s, EVENT_AR);
  const scheduled = days.length > 0 || daily || weekdays || !!time;

  let trigger: Recipe['trigger'];
  if (!scheduled && isEvent) {
    let event: AgentEvent = 'task_overdue';
    if (en(QUOTE_EN) || hasAny(s, QUOTE_AR)) event = 'email_received';
    else if (en(SUBMIT_EN) || hasAny(s, SUBMIT_AR)) event = 'task_submitted';
    else if (en(BLOCKED_EN) || hasAny(s, BLOCKED_AR)) event = 'task_blocked';
    trigger = { type: 'event', event };
  } else {
    const t = time ?? { h: 8, m: 0 };
    const dow = weekdays ? '0-4' : days.length && !daily ? days.join(',') : '*';
    trigger = { type: 'schedule', cron: `${t.m} ${t.h} * * ${dow}` };
  }
  const weekly = trigger.type === 'schedule' && trigger.cron.split(' ')[4] !== '*' && !weekdays;

  // Find
  let find: Recipe['find'] = { status: [...ACTIVE_STATUSES] };
  if (en(OVERDUE_EN) || hasAny(s, OVERDUE_AR)) find = { status: [...ACTIVE_STATUSES], overdue: true };
  else if (en(RISK_EN) || hasAny(s, RISK_AR)) find = { status: [...ACTIVE_STATUSES], at_risk: true };
  else if (en(BLOCKED_EN) || hasAny(s, BLOCKED_AR)) find = { status: ['blocked'] };
  else if (en(DONE_EN) || hasAny(s, DONE_AR)) find = { status: ['done'], closed_within_days: weekly ? 7 : 1 };
  else if (en(SOON_EN) || hasAny(s, SOON_AR))
    find = { status: [...ACTIVE_STATUSES], due_within_days: en(/\btomorrow\b/) || s.includes('بكره') ? 1 : 7 };

  // Do
  const steps: Recipe['do'] = [];
  const nudge = en(NUDGE_EN) || hasAny(s, NUDGE_AR);
  if (nudge) steps.push({ action: 'nudge_owner', tone: 'polite', channel: 'whatsapp' });
  if (en(ESCALATE_EN) || hasAny(s, ESCALATE_AR)) steps.push({ action: 'escalate' });
  if (en(CREATE_EN) || hasAny(s, CREATE_AR)) steps.push({ action: 'create_task' });
  if (en(KUDOS_EN) || hasAny(s, KUDOS_AR)) steps.push({ action: 'suggest_kudos' });
  const summary = en(SUMMARY_EN) || hasAny(s, SUMMARY_AR);
  if (summary || steps.length === 0) steps.push({ action: 'summarize' });

  // Notify (report back to the manager)
  const email = en(EMAIL_EN) || hasAny(s, EMAIL_AR);
  const whatsapp = en(WHATSAPP_EN) || hasAny(s, WHATSAPP_AR);
  const tellMe = en(NOTIFY_EN) || hasAny(s, NOTIFY_AR);
  const reports = steps.some((d) => d.action === 'summarize' || d.action === 'suggest_kudos');
  let notify: Recipe['notify'] = null;
  if (tellMe || reports) {
    const quoteEvent = trigger.type === 'event' && trigger.event === 'email_received';
    const channel: Channel = email && !quoteEvent ? 'email' : whatsapp && !nudge ? 'whatsapp' : 'push';
    notify = { channel };
    const late = s.match(/(?:more than|over|اكثر من)\s*(\d+)\s*(?:days?|ايام|يوم)/);
    if (late) notify.when = `overdue_days > ${late[1]}`;
  }

  return { ...(template ? { template } : {}), trigger, find, do: steps, notify };
}

/** Next-run cron for the `schedule` column (null for event agents). */
export function scheduleOf(r: Recipe): string | null {
  return r.trigger.type === 'schedule' ? r.trigger.cron : null;
}

// ─── Readable text ───────────────────────────────────────────────────────────

/** Translator bound to the s22 namespace (agents/strings.ts). */
export type Tr = (key: string, opts?: Record<string, unknown>) => string;

function fmtTime(h: number, m: number, t: Tr, long: boolean) {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (long) return t(h < 12 ? 'time.longAm' : 'time.longPm', { h: h12, m: String(m).padStart(2, '0') });
  const slot = h < 12 ? 'morning' : h < 15 ? 'noon' : h < 18 ? 'afternoon' : 'night';
  return t(`time.${slot}`, { h: m ? `${h12}:${String(m).padStart(2, '0')}` : h12 });
}

const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** "Daily 8 AM" / "Thu 2 PM" (short) or "Every Sun · 9:00 AM" (long). */
export function describeCron(cron: string | null | undefined, t: Tr, long = false): string | null {
  if (!cron) return null;
  const [mRaw, hRaw, , , dow] = cron.split(' ');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m) || dow === undefined) return null;
  const time = fmtTime(h, m, t, long);
  const style = long ? 'cronLong' : 'cron';
  if (dow === '*') return t(`${style}.daily`, { time });
  if (dow === '0-4') return t(`${style}.weekdays`, { time });
  const dayNames = dow
    .split(',')
    .map((d) => DOW_KEYS[Number(d)])
    .filter(Boolean)
    .map((k) => t(`days.${k}`));
  if (!dayNames.length) return null;
  return t(`${style}.weekly`, { day: dayNames.join(t('listSep')), time });
}

export function describeWhen(r: Recipe, t: Tr, long = false): string {
  if (r.trigger.type === 'event') return long ? t(`event.${r.trigger.event}`) : t('eventShort');
  return describeCron(r.trigger.cron, t, long) ?? t('eventShort');
}

export function describeFind(r: Recipe, t: Tr): string {
  const f = r.find;
  if (r.trigger.type === 'event' && r.trigger.event === 'email_received') return t('find.email');
  if (f.overdue) return t('find.overdue');
  if (f.at_risk) return t('find.atRisk');
  if (f.closed_within_days) return t('find.done', { n: f.closed_within_days });
  if (f.due_within_days) return t('find.dueSoon', { n: f.due_within_days });
  if (f.status?.length === 1 && f.status[0] === 'blocked') return t('find.blocked');
  return t('find.open');
}

export function describeDo(r: Recipe, t: Tr, withChannel = true): string {
  return r.do
    .map((d) => {
      const label = t(`do.${d.action}`);
      return withChannel && d.channel ? `${label} · ${t(`via.${d.channel}`)}` : label;
    })
    .join(' + ');
}

export function describeNotify(r: Recipe, t: Tr): string {
  if (!r.notify) return t('notify.none');
  const base = t(`notify.${r.notify.channel}`);
  const late = r.notify.when?.match(/overdue_days\s*>\s*(\d+)/);
  return late ? `${base} · ${t('notify.ifLate', { n: Number(late[1]) })}` : base;
}

/** Short auto-name, e.g. "Overdue tasks → Nudge owners". */
export function autoName(r: Recipe, t: Tr): string {
  return `${describeFind(r, t)} → ${describeDo(r, t, false)}`;
}

/** Icon family for a recipe (matches the five icon styles in the Agents design). */
export type AgentKind = 'nudge' | 'report' | 'escalate' | 'email' | 'kudos';
export function kindOf(r: Recipe | null): AgentKind {
  if (!r) return 'nudge';
  if (r.trigger.type === 'event' && r.trigger.event === 'email_received') return 'email';
  const acts = r.do.map((d) => d.action);
  if (acts.includes('escalate')) return 'escalate';
  if (acts.includes('suggest_kudos')) return 'kudos';
  if (acts.includes('nudge_owner')) return 'nudge';
  return 'report';
}

// ─── Dry run ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Tasks a recipe would act on right now. */
export function matchTasks(r: Recipe, tasks: TaskWithPeople[], now = Date.now()): TaskWithPeople[] {
  if (r.trigger.type === 'event' && r.trigger.event === 'email_received') return [];
  const f = r.find;
  return tasks.filter((task) => {
    const statusOk = f.status?.length ? f.status.includes(task.status) : ACTIVE_STATUSES.includes(task.status);
    if (!statusOk) return false;
    const due = task.due_at ? new Date(task.due_at).getTime() : null;
    if (f.overdue && !(due !== null && due < now)) return false;
    if (f.at_risk && !(due !== null && due - now < 3 * DAY_MS && task.progress < 60)) return false;
    if (f.due_within_days && !(due !== null && due >= now && due - now <= f.due_within_days * DAY_MS)) return false;
    if (f.closed_within_days) {
      const closed = task.closed_at ? new Date(task.closed_at).getTime() : null;
      if (!(closed !== null && now - closed <= f.closed_within_days * DAY_MS)) return false;
    }
    return true;
  });
}

export function daysLate(task: TaskWithPeople, now = Date.now()) {
  if (!task.due_at) return 0;
  return Math.max(1, Math.ceil((now - new Date(task.due_at).getTime()) / DAY_MS));
}
