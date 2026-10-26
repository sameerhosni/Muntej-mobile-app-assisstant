// daily-summary — each working morning, every person's day in one message (push · email · WhatsApp).
//   Manager:  team pulse (in progress · late · done yesterday), what needs them (decisions, reviews, late work),
//             who needs support, their own tasks due.
//   Employee: what's late / due today / sent back, what's waiting for review, the week's wins.
// Time and channels come from the person's Alerts settings ("Daily summary" rule; default 08:00, push + email).
// No summary on Friday/Saturday (Saudi weekend) and none when there's nothing to say.
//
// Called every 15 minutes by pg_cron (x-cron-secret), or by a signed-in user with {"test": true} to get theirs now.
// Email goes through Resend (RESEND_API_KEY, RESEND_FROM). WhatsApp needs WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and an
// approved template WHATSAPP_SUMMARY_TEMPLATE (one body parameter) — until then it is skipped.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError, getCaller, json, serve } from '../_shared/http.ts';
import { adminClient, sendPush } from '../_shared/push.ts';
import { loadPrefs, type Prefs } from '../_shared/notify.ts';

type Lang = 'en' | 'ar';
type Person = {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  role: string;
  manager_id: string | null;
  status: string;
  locale: string;
  email: string | null;
  phone: string | null;
  whatsapp_connected: boolean | null;
  weekly_capacity_hours: number | null;
};
type Task = {
  id: string;
  title: string;
  owner_id: string | null;
  assigner_id: string | null;
  status: string;
  due_at: string | null;
  closed_at: string | null;
  estimate_hours: number | null;
};
type Rule = { enabled?: boolean; channels?: string[]; time?: string };
type Summary = { subject: string; headline: string; sections: { title: string; items: string[] }[]; short: string };

const PERSON_COLS = 'id, full_name, full_name_ar, role, manager_id, status, locale, email, phone, whatsapp_connected, weekly_capacity_hours';
const OPEN = ['assigned', 'in_progress', 'blocked', 'returned'];
const RIYADH_MS = 3 * 3_600_000;
const DAY = 86_400_000;
/** a missed run still sends within this window after the chosen time, never later */
const WINDOW_MS = 2 * 3_600_000;
const DEFAULT_RULE: Required<Rule> = { enabled: true, channels: ['push', 'email'], time: '08:00' };

// ─── words ────────────────────────────────────────────────────────────────────

const W = {
  en: {
    subjectMgr: 'Your team today · {date}',
    subjectEmp: 'Your day · {date}',
    hello: 'Good morning {name}',
    pulse: '{working} in progress · {late} late · {done} done yesterday',
    empHead: '{today} due today · {late} late · {back} sent back',
    needsYou: 'Needs you',
    handled: 'I handled it for you',
    handledMoved: 'moved {n} of your late tasks to the next working day',
    handledNudged: 'sent {n} follow-ups to your team',
    decision: 'Decision: {title}',
    review: '{name} finished "{title}" · waiting for your review',
    late: '"{title}" · {name} · was due {when}',
    support: 'Needs your support',
    yours: 'Your tasks',
    due: '"{title}" · due {when}',
    lateMine: '"{title}" · late since {when}',
    back: '"{title}" · sent back for changes',
    waiting: 'Waiting for review',
    waitingN: '{n} finished, waiting for review',
    wins: 'This week',
    winsN: '{n} done this week. Keep going!',
    supLate: '{n} late',
    supBlocked: '{n} blocked',
    supBack: '{n} sent back',
    supOver: 'booked {n}% this week',
    more: '+{n} more in the app',
    open: 'Open the Muntej app to act on these.',
    footer: 'Sent by Muntej at the time you chose in Alerts.',
    pushMgr: '{late} late · {reviews} to review · {decisions} decisions',
    pushEmp: '{today} due today · {late} late',
    logSummary: 'Sent your morning summary ({via})',
    logReason: 'Daily summary at {time}, as set in Alerts',
    newFor: 'New for you ✨',
    allClear: 'All {n} tasks are moving. Nothing needs you today, enjoy your coffee ☕',
    allClearPush: "Nothing needs you today. I've got the rest ☕",
    since: 'Since yesterday',
    sinceN: '{n} small updates in the app, whenever you like',
  },
  ar: {
    subjectMgr: 'صباحك مع فريقك · {date}',
    subjectEmp: 'يومك · {date}',
    hello: 'صباح الخير يا {name} ☀️',
    pulse: '{working} شغالين عليها · {late} متأخرة · {done} خلصت أمس',
    empHead: '{today} مطلوبة اليوم · {late} متأخرة · {back} راجعة للتعديل',
    needsYou: 'يحتاجك',
    handled: 'تكفّلت فيها عنك',
    handledMoved: 'أجّلت {n} من مهامك المتأخرة ليوم العمل الجاي',
    handledNudged: 'تابعت فريقك {n} مرات',
    decision: 'قرار: {title}',
    review: '{name} خلّص «{title}» · تنتظر مراجعتك',
    late: '«{title}» · {name} · كانت {when}',
    support: 'يحتاجون دعمك',
    yours: 'مهامك',
    due: '«{title}» · مطلوبة {when}',
    lateMine: '«{title}» · متأخرة من {when}',
    back: '«{title}» · راجعة للتعديل',
    waiting: 'تنتظر المراجعة',
    waitingN: '{n} خلصتها وتنتظر المراجعة',
    wins: 'هالأسبوع',
    winsN: 'خلّصت {n} هالأسبوع. يا حلوك 💪',
    supLate: '{n} متأخرة',
    supBlocked: '{n} واقفة',
    supBack: '{n} راجعة للتعديل',
    supOver: 'محجوز {n}٪ هالأسبوع',
    more: '+{n} زيادة في التطبيق',
    open: 'افتح منتج وخلّصها بضغطة.',
    footer: 'أرسلتها لك بالوقت اللي اخترته. تقدر تغيّره من التنبيهات.',
    pushMgr: '{late} متأخرة · {reviews} للمراجعة · {decisions} قرارات',
    pushEmp: '{today} مطلوبة اليوم · {late} متأخرة',
    logSummary: 'أرسل ملخّص الصباح ({via})',
    logReason: 'الملخّص اليومي الساعة {time} حسب إعدادات التنبيهات',
    newFor: 'جديد لك ✨',
    allClear: 'كل المهام ماشية ({n}). ما فيه شي يحتاجك اليوم، روح اشرب قهوتك ☕',
    allClearPush: 'ما فيه شي يحتاجك اليوم، والباقي عليّ ☕',
    since: 'من أمس',
    sinceN: '{n} تحديثات صغيرة في التطبيق، على راحتك',
  },
} as const;

type Key = keyof (typeof W)['en'];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const say = (lang: Lang, key: Key, v: Record<string, string | number> = {}) => fill(W[lang][key], v);

const num = (n: number, lang: Lang) => n.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US');
const firstName = (p: Person | undefined, lang: Lang) => ((lang === 'ar' && p?.full_name_ar) || p?.full_name || '').split(' ')[0];
const when = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short' });

// ─── time (Riyadh, UTC+3, no DST) ─────────────────────────────────────────────

const riyadh = (d: Date) => new Date(d.getTime() + RIYADH_MS); // read with getUTC*
const riyadhDay = (d: Date) => riyadh(d).toISOString().slice(0, 10);
const riyadhMidnightUtc = (d: Date) => Date.parse(`${riyadhDay(d)}T00:00:00Z`) - RIYADH_MS;
function chosenTimeUtc(d: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0);
  return riyadhMidnightUtc(d) + (h * 60 + m) * 60_000;
}

// ─── building the summary ─────────────────────────────────────────────────────

type World = {
  people: Map<string, Person>;
  tasks: Task[];
  decisions: { manager_id: string; title: string; title_ar: string | null }[];
  reviews: { task_id: string; reviewer_id: string | null }[];
  /** what Saree3 did quietly in the last day (quiet Saree3: it shows here instead of as pushes) */
  quiet: { movedFor: Map<string, number>; nudgedFor: Map<string, number> };
};

const top = (items: string[], lang: Lang, max = 3) =>
  items.length > max ? [...items.slice(0, max), say(lang, 'more', { n: num(items.length - max, lang) })] : items;

function managerSummary(me: Person, w: World, now: Date, lang: Lang): Summary | null {
  const reports = [...w.people.values()].filter((p) => p.manager_id === me.id && p.status === 'active');
  const reportIds = new Set(reports.map((p) => p.id));
  const name = (id: string | null) => firstName(id ? w.people.get(id) : undefined, lang);
  const t = now.getTime();
  const isLate = (x: Task) => OPEN.includes(x.status) && !!x.due_at && Date.parse(x.due_at) < t;
  const team = w.tasks.filter((x) => x.owner_id !== me.id && ((x.owner_id && reportIds.has(x.owner_id)) || x.assigner_id === me.id));
  const late = team.filter(isLate).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const working = team.filter((x) => OPEN.includes(x.status) && !isLate(x));
  const startYesterday = riyadhMidnightUtc(now) - DAY;
  const doneYesterday = team.filter(
    (x) => x.status === 'done' && x.closed_at && Date.parse(x.closed_at) >= startYesterday && Date.parse(x.closed_at) < startYesterday + DAY,
  );

  const decisions = w.decisions.filter((d) => d.manager_id === me.id);
  const reviewTaskIds = new Set(w.reviews.filter((r) => r.reviewer_id === me.id).map((r) => r.task_id));
  const reviews = w.tasks.filter((x) => x.status === 'submitted' && (reviewTaskIds.has(x.id) || x.assigner_id === me.id) && x.owner_id !== me.id);

  const needs = [
    ...decisions.map((d) => say(lang, 'decision', { title: (lang === 'ar' && d.title_ar) || d.title })),
    ...reviews.map((x) => say(lang, 'review', { name: name(x.owner_id) || '…', title: x.title })),
    ...late.map((x) => say(lang, 'late', { title: x.title, name: name(x.owner_id) || '…', when: when(x.due_at!, lang) })),
  ];

  // people who look stuck (same signals as the Home "Needs your support" block)
  const weekEnd = riyadhMidnightUtc(now) + 7 * DAY;
  const support = reports
    .map((p) => {
      const open = w.tasks.filter((x) => x.owner_id === p.id && OPEN.includes(x.status));
      const l = open.filter(isLate).length;
      const b = open.filter((x) => x.status === 'blocked').length;
      const r = open.filter((x) => x.status === 'returned').length;
      const hours = open.filter((x) => x.due_at && Date.parse(x.due_at) < weekEnd).reduce((s, x) => s + (x.estimate_hours ?? 0), 0);
      const pct = Math.round((hours / (p.weekly_capacity_hours && p.weekly_capacity_hours > 0 ? p.weekly_capacity_hours : 40)) * 100);
      const score = l * 3 + b * 2 + r + (pct > 100 ? 2 : 0);
      const why = [
        l && say(lang, 'supLate', { n: num(l, lang) }),
        b && say(lang, 'supBlocked', { n: num(b, lang) }),
        r && say(lang, 'supBack', { n: num(r, lang) }),
        pct > 100 && say(lang, 'supOver', { n: num(pct, lang) }),
      ].filter(Boolean);
      return { score, line: `${firstName(p, lang)}: ${why.join(' · ')}` };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.line);

  const mine = ownWork(me, w, now, lang);
  // what Saree3 handled quietly since yesterday (no pushes for it)
  const moved = w.quiet.movedFor.get(me.id) ?? 0;
  const nudged = w.quiet.nudgedFor.get(me.id) ?? 0;
  const handled = [
    moved && say(lang, 'handledMoved', { n: num(moved, lang) }),
    nudged && say(lang, 'handledNudged', { n: num(nudged, lang) }),
  ].filter(Boolean) as string[];
  if (!needs.length && !support.length && !mine.length && !working.length) return null;

  const date = when(now.toISOString(), lang);
  // nothing needs them: one line, counted not listed (BRD v1.2 FR-BRF-04)
  if (!needs.length && !support.length && !mine.length)
    return {
      subject: say(lang, 'subjectMgr', { date }),
      headline: say(lang, 'allClear', { n: num(working.length, lang) }),
      sections: handled.length ? [{ title: say(lang, 'handled'), items: handled }] : [],
      short: say(lang, 'allClearPush'),
    };
  return {
    subject: say(lang, 'subjectMgr', { date }),
    headline: say(lang, 'pulse', { working: num(working.length, lang), late: num(late.length, lang), done: num(doneYesterday.length, lang) }),
    sections: [
      { title: say(lang, 'needsYou'), items: top(needs, lang) },
      { title: say(lang, 'support'), items: top(support, lang) },
      { title: say(lang, 'yours'), items: top(mine, lang) },
      { title: say(lang, 'handled'), items: handled },
    ].filter((s) => s.items.length),
    short: say(lang, 'pushMgr', { late: num(late.length, lang), reviews: num(reviews.length, lang), decisions: num(decisions.length, lang) }),
  };
}

/** The person's own open work worth a mention today: late, due today, sent back. */
function ownWork(me: Person, w: World, now: Date, lang: Lang): string[] {
  const t = now.getTime();
  const endToday = riyadhMidnightUtc(now) + DAY;
  const mine = w.tasks.filter((x) => x.owner_id === me.id && OPEN.includes(x.status));
  const late = mine.filter((x) => x.due_at && Date.parse(x.due_at) < t).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const today = mine.filter((x) => x.due_at && Date.parse(x.due_at) >= t && Date.parse(x.due_at) < endToday);
  const back = mine.filter((x) => x.status === 'returned' && !late.includes(x) && !today.includes(x));
  return [
    ...late.map((x) => say(lang, 'lateMine', { title: x.title, when: when(x.due_at!, lang) })),
    ...today.map((x) => say(lang, 'due', { title: x.title, when: when(x.due_at!, lang) })),
    ...back.map((x) => say(lang, 'back', { title: x.title })),
  ];
}

function employeeSummary(me: Person, w: World, now: Date, lang: Lang): Summary | null {
  const t = now.getTime();
  const endToday = riyadhMidnightUtc(now) + DAY;
  const mine = w.tasks.filter((x) => x.owner_id === me.id);
  const open = mine.filter((x) => OPEN.includes(x.status));
  const late = open.filter((x) => x.due_at && Date.parse(x.due_at) < t).length;
  const today = open.filter((x) => x.due_at && Date.parse(x.due_at) >= t && Date.parse(x.due_at) < endToday).length;
  const back = open.filter((x) => x.status === 'returned').length;
  const waiting = mine.filter((x) => x.status === 'submitted').length;
  const weekStart = riyadhMidnightUtc(now) - riyadh(now).getUTCDay() * DAY; // Sunday
  const wins = mine.filter((x) => x.status === 'done' && x.closed_at && Date.parse(x.closed_at) >= weekStart).length + waiting;

  const work = ownWork(me, w, now, lang);
  if (!work.length && !waiting) return null;

  return {
    subject: say(lang, 'subjectEmp', { date: when(now.toISOString(), lang) }),
    headline: say(lang, 'empHead', { today: num(today, lang), late: num(late, lang), back: num(back, lang) }),
    sections: [
      { title: say(lang, 'yours'), items: top(work, lang, 5) },
      { title: say(lang, 'waiting'), items: waiting ? [say(lang, 'waitingN', { n: num(waiting, lang) })] : [] },
      { title: say(lang, 'wins'), items: wins ? [say(lang, 'winsN', { n: num(wins, lang) })] : [] },
    ].filter((s) => s.items.length),
    short: say(lang, 'pushEmp', { today: num(today, lang), late: num(late, lang) }),
  };
}

function isManager(p: Person, w: World) {
  return p.role !== 'employee' || [...w.people.values()].some((x) => x.manager_id === p.id && x.status === 'active');
}

// ─── channels ─────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** the white wordmark, served by the public `brand` function (mail apps need an https image) */
const LOGO_URL = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/brand?f=wordmark-white`;
/** thin purple → yellow line under the header, like the logo's arrow (solid purple where gradients aren't supported) */
const BRAND_LINE =
  '<tr><td style="height:4px;line-height:4px;font-size:0;background-color:#C13BF0;background-image:linear-gradient(90deg,#5B3BFF,#C13BF0,#FF4FA0,#FF9F1C,#FFD60A)">&nbsp;</td></tr>';

function emailHtml(s: Summary, hello: string, lang: Lang) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const sections = s.sections
    .map(
      (sec) => `
      <tr><td style="padding:18px 24px 4px;font:700 15px Arial,sans-serif;color:#0B1A33;text-align:${align}">${esc(sec.title)}</td></tr>
      <tr><td style="padding:0 24px 4px;text-align:${align}">
        ${sec.items.map((i) => `<div style="font:14px/1.5 Arial,sans-serif;color:#33415C;padding:6px 0;border-bottom:1px solid #EEF2F8">${esc(i)}</div>`).join('')}
      </td></tr>`,
    )
    .join('');
  return `<!doctype html><html dir="${dir}" lang="${lang}"><body style="margin:0;background:#F3F6FB">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F6FB;padding:24px 0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden" dir="${dir}">
      <tr><td style="background:#1F6FEB;padding:22px 24px;text-align:${align}">
        <img src="${LOGO_URL}" width="110" height="37" alt="Muntej · منتج" style="display:block;border:0;width:110px;height:auto;font:700 13px Arial,sans-serif;color:#CFE0FF${lang === 'ar' ? ';margin-left:auto' : ''}">
        <div style="font:700 22px Arial,sans-serif;color:#FFFFFF;padding-top:4px">${esc(hello)}</div>
        <div style="font:14px Arial,sans-serif;color:#E6EEFF;padding-top:6px">${esc(s.headline)}</div>
      </td></tr>
      ${BRAND_LINE}
      ${sections}
      <tr><td style="padding:18px 24px 6px;font:700 14px Arial,sans-serif;color:#1F6FEB;text-align:${align}">${esc(say(lang, 'open'))}</td></tr>
      <tr><td style="padding:4px 24px 22px;font:12px Arial,sans-serif;color:#8A97AD;text-align:${align}">${esc(say(lang, 'footer'))}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function plainText(s: Summary, hello: string, lang: Lang) {
  return [hello, s.headline, '', ...s.sections.flatMap((sec) => [sec.title, ...sec.items.map((i) => `• ${i}`), '']), say(lang, 'open')].join('\n');
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('RESEND_FROM') ?? 'Muntej <onboarding@resend.dev>', to: [to], subject, html, text }),
  });
  if (!res.ok) console.error('Resend error', res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

/** Business-initiated WhatsApp needs an approved template; the whole summary goes in its one body parameter. */
async function sendWhatsAppSummary(phone: string, lang: Lang, s: Summary): Promise<boolean> {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
  const template = Deno.env.get('WHATSAPP_SUMMARY_TEMPLATE');
  if (!token || !phoneId || !template) return false;
  // template parameters can't hold new lines or long runs of spaces
  const body = [s.headline, ...s.sections.map((sec) => `${sec.title}: ${sec.items.join(' · ')}`)].join(' | ').slice(0, 1000);
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'template',
      template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }] },
    }),
  });
  if (!res.ok) console.error('WhatsApp template error', res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

// ─── run ──────────────────────────────────────────────────────────────────────

async function loadWorld(admin: SupabaseClient): Promise<World> {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const dayAgo = new Date(Date.now() - DAY).toISOString();
  const [peopleRes, tasksRes, decRes, revRes, movedRes, nudgedRes] = await Promise.all([
    // hidden = the super admin's viewing seat in an account: never part of the work
    admin.from('profiles').select(PERSON_COLS).neq('status', 'deleted').eq('hidden', false),
    admin
      .from('tasks')
      .select('id, title, owner_id, assigner_id, status, due_at, closed_at, estimate_hours')
      .or(`status.in.(${[...OPEN, 'submitted'].join(',')}),closed_at.gte.${since}`),
    admin.from('decisions').select('manager_id, title, title_ar').eq('status', 'pending'),
    admin.from('reviews').select('task_id, reviewer_id').is('decision', null),
    admin.from('activity_log').select('subject_id').eq('action', 'due_moved').gte('created_at', dayAgo),
    admin.from('followups').select('task:tasks(assigner_id, owner_id)').in('status', ['sent', 'replied']).gte('sent_at', dayAgo),
  ]);
  for (const r of [peopleRes, tasksRes, decRes, revRes]) if (r.error) throw r.error;
  return {
    people: new Map(((peopleRes.data ?? []) as Person[]).map((p) => [p.id, p])),
    tasks: ((tasksRes.data ?? []) as Task[]).filter((x) => x.status !== 'cancelled'),
    decisions: decRes.data ?? [],
    reviews: revRes.data ?? [],
    quiet: {
      movedFor: count(((movedRes.data ?? []) as { subject_id: string | null }[]).map((r) => r.subject_id)),
      // reminders Saree3 sent on a manager's behalf (to the people they gave work to)
      nudgedFor: count(
        ((nudgedRes.data ?? []) as unknown as { task: { assigner_id: string | null; owner_id: string | null } | null }[])
          .filter((r) => r.task && r.task.assigner_id && r.task.assigner_id !== r.task.owner_id)
          .map((r) => r.task!.assigner_id),
      ),
    },
  };
}

function count(ids: (string | null)[]) {
  const m = new Map<string, number>();
  for (const id of ids) if (id) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

function ruleOf(p: Prefs | undefined): Required<Rule> {
  const r = (p?.rules?.daily_summary ?? {}) as Rule;
  return { enabled: r.enabled ?? DEFAULT_RULE.enabled, channels: r.channels ?? DEFAULT_RULE.channels, time: r.time ?? DEFAULT_RULE.time };
}

async function sendOne(admin: SupabaseClient, me: Person, w: World, prefs: Prefs | undefined, now: Date, test: boolean) {
  const lang: Lang = me.locale === 'ar' ? 'ar' : 'en';
  const rule = ruleOf(prefs);
  const s = isManager(me, w) ? managerSummary(me, w, now, lang) : employeeSummary(me, w, now, lang);
  if (!s) return { profile: me.id, sent: [] as string[], skipped: 'nothing to say' };

  // "New for you": up to two features from the last 2 weeks this person hasn't tried (or turned down) yet
  const { data: feats } = await admin.from('features').select('key, audience, released_at, title, title_ar, benefit, benefit_ar').order('sort');
  const { data: mine } = await admin.from('feature_events').select('feature_key, state').eq('profile_id', me.id);
  const done = new Set(
    (mine ?? []).filter((e) => ['tried', 'adopted', 'not_interested'].includes(e.state as string)).map((e) => e.feature_key as string),
  );
  const mgr = isManager(me, w);
  const fresh = (feats ?? []).filter(
    (f) =>
      Date.now() - Date.parse(f.released_at as string) <= 14 * DAY &&
      !done.has(f.key as string) &&
      (f.audience === 'all' ||
        (f.audience === 'manager' && mgr) ||
        (f.audience === 'employee' && !mgr) ||
        (f.audience === 'admin' && (me.role === 'admin' || me.role === 'super_admin'))),
  );
  if (fresh.length)
    s.sections.push({
      title: say(lang, 'newFor'),
      items: fresh.slice(0, 2).map((f) => (lang === 'ar' ? `${f.title_ar}: ${f.benefit_ar}` : `${f.title}: ${f.benefit}`)),
    });

  // the everyday updates the notification budget kept quiet since yesterday (whatsapp_status 'batched'): counted here
  const { data: quiet } = await admin
    .from('alerts')
    .select('title, title_ar')
    .eq('profile_id', me.id)
    .eq('whatsapp_status', 'batched')
    .is('read_at', null)
    .gte('created_at', new Date(now.getTime() - DAY).toISOString())
    .order('created_at', { ascending: false });
  if (quiet?.length)
    s.sections.push({
      title: say(lang, 'since'),
      items: [
        say(lang, 'sinceN', { n: num(quiet.length, lang) }),
        ...quiet.slice(0, 3).map((a) => ((lang === 'ar' && a.title_ar) || a.title) as string),
      ],
    });

  const hello = say(lang, 'hello', { name: firstName(me, lang) });
  const allowed = (c: string) => rule.channels.includes(c) && prefs?.channels?.[c] !== false;
  const channels = test
    ? [...new Set([...rule.channels, 'push', 'email'])].filter((c) => prefs?.channels?.[c] !== false)
    : rule.channels.filter(allowed);
  const sent: string[] = [];

  if (channels.includes('push') && (await sendPush(
      [me.id],
      // Thursday (end of the Saudi week): the summary opens the week's receipt
      riyadh(now).getUTCDay() === 4
        ? { title: s.subject, body: `${hello} · ${s.short} · ${lang === 'ar' ? '🧾 إيصال أسبوعك جاهز' : '🧾 Your week’s receipt is ready'}`, data: { screen: '/32-receipt' } }
        : { title: s.subject, body: `${hello} · ${s.short}`, data: { screen: '/' } },
      admin,
    )) > 0)
    sent.push('push');
  if (channels.includes('email') && me.email && (await sendEmail(me.email, s.subject, emailHtml(s, hello, lang), plainText(s, hello, lang))))
    sent.push('email');
  if (channels.includes('whatsapp') && me.phone && me.whatsapp_connected && (await sendWhatsAppSummary(me.phone, lang, s))) sent.push('whatsapp');

  if (!test) {
    await admin.from('daily_summaries').upsert({ profile_id: me.id, day: riyadhDay(now), kind: 'daily', channels: sent });
  }
  if (sent.length) {
    const via = sent.join(', ');
    await admin.from('activity_log').insert({
      actor_type: 'muntej',
      subject_id: me.id,
      action: 'daily_summary_sent',
      summary: say('en', 'logSummary', { via }),
      summary_ar: say('ar', 'logSummary', { via }),
      reason: say(lang, 'logReason', { time: rule.time }),
      undoable: false,
    });
  }
  return { profile: me.id, sent, preview: test ? plainText(s, hello, lang) : undefined };
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as { test?: boolean };
  const admin = adminClient();
  const now = new Date();

  // ── "Send me today's summary" from the Alerts screen ──
  if (body.test) {
    const { profileId } = await getCaller(req);
    const w = await loadWorld(admin);
    const me = w.people.get(profileId);
    if (!me) throw new HttpError(404, 'No profile');
    const prefs = (await loadPrefs(admin, [me.id])).get(me.id);
    return json(await sendOne(admin, me, w, prefs, now, true));
  }

  // ── cron run ──
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');

  const weekday = riyadh(now).getUTCDay(); // 5 Friday, 6 Saturday
  if (weekday === 5 || weekday === 6) return json({ skipped: 'weekend' });
  const nudged = await setupNudges(admin, now);

  const w = await loadWorld(admin);
  const active = [...w.people.values()].filter((p) => p.status === 'active');
  const prefs = await loadPrefs(
    admin,
    active.map((p) => p.id),
  );
  const { data: done, error } = await admin.from('daily_summaries').select('profile_id').eq('day', riyadhDay(now)).eq('kind', 'daily');
  if (error) throw error;
  const already = new Set((done ?? []).map((r) => r.profile_id as string));

  const due = active.filter((p) => {
    const rule = ruleOf(prefs.get(p.id));
    const at = chosenTimeUtc(now, rule.time);
    return rule.enabled && !already.has(p.id) && now.getTime() >= at && now.getTime() < at + WINDOW_MS;
  });
  const results = [];
  for (const p of due) results.push(await sendOne(admin, p, w, prefs.get(p.id), now, false));
  return json({ due: due.length, results, nudged });
});

// Setup left halfway (owner's request: "if the user missed anything, Saree3 helps them continue"): once a day at 10:00
// Riyadh, for at most 3 days, a friendly push that opens Saree3's setup guide at the next missing item. Only for people
// whose setup isn't finished, started 20+ hours ago, not on a coffee break; each day's nudge is remembered in
// coach_moments (setup_nudge_<day>) so it never repeats.
async function setupNudges(admin: SupabaseClient, now: Date): Promise<number> {
  const r = riyadh(now);
  if (r.getUTCHours() !== 10 || r.getUTCMinutes() >= 15) return 0;
  const day = riyadhDay(now);
  const { data: rows } = await admin
    .from('onboarding')
    .select('profile_id, started_at, profile:profiles!inner(locale, status, full_name, full_name_ar)')
    .is('finished_at', null)
    .lt('started_at', new Date(now.getTime() - 20 * 3_600_000).toISOString());
  let sent = 0;
  for (const row of rows ?? []) {
    const p = row.profile as unknown as { locale: string; status: string; full_name: string; full_name_ar: string | null };
    if (p.status !== 'active') continue;
    const { data: seen } = await admin.from('coach_moments').select('key').eq('profile_id', row.profile_id).like('key', 'setup_nudge_%');
    const keys = new Set((seen ?? []).map((x) => x.key as string));
    if (keys.size >= 3 || keys.has(`setup_nudge_${day}`)) continue;
    const { data: paused } = await admin.from('coach_moments').select('key').eq('profile_id', row.profile_id).eq('key', '_paused').maybeSingle();
    if (paused) continue;
    const ar = p.locale === 'ar';
    const name = ((ar && p.full_name_ar) || p.full_name).split(' ')[0];
    await sendPush(
      [row.profile_id as string],
      {
        title: ar ? '⚡ باقي شوي على تجهيز حسابك' : '⚡ Your account is almost set up',
        body: ar
          ? `هلا ${name}! باقي كم خطوة وتصير جاهز. ضغطة وأكمّلها عنك 😉`
          : `Hi ${name}! A few steps left and you're all set. One tap and I'll finish them for you 😉`,
        data: { screen: '/47-welcome' },
      },
      admin,
    ).catch(() => 0);
    await admin.from('coach_moments').insert({ profile_id: row.profile_id, key: `setup_nudge_${day}` });
    sent++;
  }
  return sent;
}
