// daily-summary — three reports a day for every person (push · email · WhatsApp), owner's request (26 Oct):
//   ☀️ morning (08:00)   the day ahead: risks, what needs you, your tasks, what I handled since yesterday, wins yesterday
//   🌤️ midday (13:00)    what's done so far today, new risks, what still needs you
//   🌙 end of day (17:30) today's wins, what's still open or late, what still needs you before tomorrow
// Each has its own rule in Alerts (daily_summary / midday_report / evening_report: on/off, time, channels). No report
// on Friday/Saturday (Saudi weekend), and midday / end of day are skipped when there's nothing worth saying.
// WhatsApp: inside the 24 h window the whole report, then each decision / review with its buttons; outside it the
// approved "report" template (counts + a "Show me" button that brings the full report).
//
// Called every 15 minutes by pg_cron (x-cron-secret), or by a signed-in user with {"test": true, kind?, only?} to get
// theirs now ("Send me today's summary", or "report" on WhatsApp with only: 'whatsapp').
// Email goes through Resend (RESEND_API_KEY, RESEND_FROM).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError, getCaller, json, serve } from '../_shared/http.ts';
import { adminClient, sendPush } from '../_shared/push.ts';
import { loadPrefs, type Prefs } from '../_shared/notify.ts';
import { inWindow, REPORT_TEMPLATE, rtl, waConfigured, waTemplate, waText } from '../_shared/wa.ts';
import { needsYouCards, sendCards } from '../_shared/wa-actions.ts';
import { phCapture } from '../_shared/posthog.ts';

type Lang = 'en' | 'ar';
type Kind = 'daily' | 'midday' | 'evening';
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
  wa_last_inbound_at: string | null;
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
type Section = { key: 'risks' | 'wins' | 'needs' | 'support' | 'yours' | 'handled' | 'waiting' | 'new' | 'since'; title: string; items: string[] };
type Summary = {
  subject: string;
  hello: string;
  headline: string;
  sections: Section[];
  short: string;
  /** for the WhatsApp template: "3 risks · 2 decisions · 5 wins" */
  counts: string;
};

const PERSON_COLS =
  'id, full_name, full_name_ar, role, manager_id, status, locale, email, phone, whatsapp_connected, wa_last_inbound_at, weekly_capacity_hours';
const OPEN = ['assigned', 'in_progress', 'blocked', 'returned'];
const RIYADH_MS = 3 * 3_600_000;
const DAY = 86_400_000;
const KINDS: Kind[] = ['daily', 'midday', 'evening'];
const RULE_KEY: Record<Kind, string> = { daily: 'daily_summary', midday: 'midday_report', evening: 'evening_report' };
const DEFAULT_RULE: Record<Kind, Required<Rule>> = {
  daily: { enabled: true, channels: ['push', 'email'], time: '08:00' },
  midday: { enabled: true, channels: ['push', 'whatsapp'], time: '13:00' },
  evening: { enabled: true, channels: ['push', 'whatsapp'], time: '17:30' },
};
/** a missed run still sends within this window after the chosen time, never later */
const WINDOW_MS: Record<Kind, number> = { daily: 2 * 3_600_000, midday: 3_600_000, evening: 3_600_000 };

// ─── words ────────────────────────────────────────────────────────────────────

const W = {
  en: {
    subject_daily: 'Your morning · {date}',
    subject_midday: 'Your midday check · {date}',
    subject_evening: 'Your day’s wrap-up · {date}',
    hello_daily: 'Good morning {name} ☀️',
    hello_midday: 'Hi {name} 🌤️ halfway through the day',
    hello_evening: 'Good evening {name} 🌙',
    pulse_daily: '{working} in progress · {late} late · {done} done yesterday',
    pulse_midday: '{done} done so far today · {late} late · {needs} need you',
    pulse_evening: '{done} done today · {open} still open · {late} late',
    emp_daily: '{today} due today · {late} late · {back} sent back',
    emp_midday: '{done} done so far · {today} still due today · {late} late',
    emp_evening: '{done} done today · {late} late · {tomorrow} due tomorrow',
    risks: '⚠️ Risks',
    wins: '✅ Achievements',
    needs: '📌 Needs you',
    support: '🤝 Needs your support',
    yours: '📝 Your tasks',
    handled: '🤖 I handled it for you',
    waiting: '⏳ Waiting for review',
    handledMoved: 'moved {n} of your late tasks to the next working day',
    handledNudged: 'sent {n} follow-ups to your team',
    decision: 'Decision: {title}',
    review: '{name} finished "{title}" · waiting for your review',
    tools: '{n} tasks from your tools waiting for your OK',
    late: '"{title}" · {name} · was due {when}',
    blocked: '"{title}" · {name} · stuck, needs help',
    dueToday: '"{title}" · {name} · due today, not started',
    won: '"{title}" · {name}',
    wonMine: '"{title}"',
    due: '"{title}" · due {when}',
    lateMine: '"{title}" · late since {when}',
    back: '"{title}" · sent back for changes',
    waitingN: '{n} finished, waiting for review',
    winsWeek: '{n} done this week. Keep going! 💪',
    supLate: '{n} late',
    supBlocked: '{n} blocked',
    supBack: '{n} sent back',
    supOver: 'booked {n}% this week',
    more: '+{n} more in the app',
    open: 'Open the Muntej app to act on these.',
    footer: 'Sent by Muntej at the time you chose in Alerts.',
    push_daily: '{late} late · {reviews} to review · {decisions} decisions',
    push_midday: '{done} done so far · {late} late · {needs} need you',
    push_evening: '{done} done today · {late} late · {needs} need you',
    pushEmp: '{today} due today · {late} late',
    counts: '{label}: {risks} risks · {needs} need you · {wins} wins',
    label_daily: '☀️ Morning report',
    label_midday: '🌤️ Midday report',
    label_evening: '🌙 End-of-day report',
    logSummary: 'Sent your {label} ({via})',
    logReason: '{label} at {time}, as set in Alerts',
    newFor: '✨ New for you',
    allClear: 'All {n} tasks are moving. Nothing needs you today, enjoy your coffee ☕',
    allClearPush: "Nothing needs you today. I've got the rest ☕",
    since: '🔔 Since yesterday',
    sinceN: '{n} small updates in the app, whenever you like',
    below: 'What needs you, with buttons 👇',
  },
  ar: {
    subject_daily: 'صباحك · {date}',
    subject_midday: 'نص يومك · {date}',
    subject_evening: 'حصيلة يومك · {date}',
    hello_daily: 'صباح الخير يا {name} ☀️',
    hello_midday: 'هلا {name} 🌤️ وصلنا نص اليوم',
    hello_evening: 'مساء الخير يا {name} 🌙',
    pulse_daily: '{working} شغالين عليها · {late} متأخرة · {done} خلصت أمس',
    pulse_midday: '{done} خلصت لين الحين · {late} متأخرة · {needs} تحتاجك',
    pulse_evening: '{done} خلصت اليوم · {open} باقية · {late} متأخرة',
    emp_daily: '{today} مطلوبة اليوم · {late} متأخرة · {back} راجعة للتعديل',
    emp_midday: '{done} خلصتها لين الحين · {today} باقية اليوم · {late} متأخرة',
    emp_evening: '{done} خلصتها اليوم · {late} متأخرة · {tomorrow} مطلوبة بكرة',
    risks: '⚠️ المخاطر',
    wins: '✅ الإنجازات',
    needs: '📌 يحتاجك',
    support: '🤝 يحتاجون دعمك',
    yours: '📝 مهامك',
    handled: '🤖 تكفّلت فيها عنك',
    waiting: '⏳ تنتظر المراجعة',
    handledMoved: 'أجّلت {n} من مهامك المتأخرة ليوم العمل الجاي',
    handledNudged: 'تابعت فريقك {n} مرات',
    decision: 'قرار: {title}',
    review: '{name} خلّص «{title}» · تنتظر مراجعتك',
    tools: '{n} مهام من أدواتك تنتظر موافقتك',
    late: '«{title}» · {name} · كانت {when}',
    blocked: '«{title}» · {name} · واقفة ويحتاج مساعدة',
    dueToday: '«{title}» · {name} · مطلوبة اليوم وما بدأ فيها',
    won: '«{title}» · {name}',
    wonMine: '«{title}»',
    due: '«{title}» · مطلوبة {when}',
    lateMine: '«{title}» · متأخرة من {when}',
    back: '«{title}» · راجعة للتعديل',
    waitingN: '{n} خلصتها وتنتظر المراجعة',
    winsWeek: 'خلّصت {n} هالأسبوع. يا حلوك 💪',
    supLate: '{n} متأخرة',
    supBlocked: '{n} واقفة',
    supBack: '{n} راجعة للتعديل',
    supOver: 'محجوز {n}٪ هالأسبوع',
    more: '+{n} زيادة في التطبيق',
    open: 'افتح منتج وخلّصها بضغطة.',
    footer: 'أرسلتها لك بالوقت اللي اخترته. تقدر تغيّره من التنبيهات.',
    push_daily: '{late} متأخرة · {reviews} للمراجعة · {decisions} قرارات',
    push_midday: '{done} خلصت لين الحين · {late} متأخرة · {needs} تحتاجك',
    push_evening: '{done} خلصت اليوم · {late} متأخرة · {needs} تحتاجك',
    pushEmp: '{today} مطلوبة اليوم · {late} متأخرة',
    counts: '{label}: {risks} مخاطر · {needs} تحتاجك · {wins} إنجازات',
    label_daily: '☀️ تقرير الصباح',
    label_midday: '🌤️ تقرير الظهر',
    label_evening: '🌙 تقرير آخر اليوم',
    logSummary: 'أرسل {label} ({via})',
    logReason: '{label} الساعة {time} حسب إعدادات التنبيهات',
    newFor: '✨ جديد لك',
    allClear: 'كل المهام ماشية ({n}). ما فيه شي يحتاجك اليوم، روح اشرب قهوتك ☕',
    allClearPush: 'ما فيه شي يحتاجك اليوم، والباقي عليّ ☕',
    since: '🔔 من أمس',
    sinceN: '{n} تحديثات صغيرة في التطبيق، على راحتك',
    below: 'اللي يحتاجك، وتحت كل وحدة أزرارها 👇',
  },
} as const;

type Key = keyof (typeof W)['en'];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const say = (lang: Lang, key: Key, v: Record<string, string | number> = {}) => fill(W[lang][key], v);

/** the push's numbers on their own line, clearly apart: "10 done today  |  0 late  |  4 need you" */
const pushLine = (short: string) => short.replace(/ · /g, '  |  ');
// 0-9 in both languages (owner, 26 Oct: Arabic-Indic digits next to the · separators were unclear, ٠ looked like a dot)
const num = (n: number, _lang: Lang) => n.toLocaleString('en-US');
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
/** the report that fits the time of day ("report" on WhatsApp) */
function kindNow(d: Date): Kind {
  const h = riyadh(d).getUTCHours();
  return h < 11 ? 'daily' : h < 15 ? 'midday' : 'evening';
}

// ─── building the reports ─────────────────────────────────────────────────────

type World = {
  people: Map<string, Person>;
  tasks: Task[];
  decisions: { manager_id: string; title: string; title_ar: string | null }[];
  reviews: { task_id: string; reviewer_id: string | null }[];
  /** suggestions found in each person's tools still waiting for their OK */
  toolsWaiting: Map<string, number>;
  /** what Saree3 did quietly in the last day (quiet Saree3: it shows here instead of as pushes) */
  quiet: { movedFor: Map<string, number>; nudgedFor: Map<string, number> };
};

const top = (items: string[], lang: Lang, max = 3) =>
  items.length > max ? [...items.slice(0, max), say(lang, 'more', { n: num(items.length - max, lang) })] : items;

/** the time span whose finished work counts as "achievements" */
function winsSpan(kind: Kind, now: Date): [number, number] {
  const today = riyadhMidnightUtc(now);
  return kind === 'daily' ? [today - DAY, today] : [today, now.getTime() + 1];
}

function managerReport(me: Person, w: World, now: Date, lang: Lang, kind: Kind): Summary | null {
  const reports = [...w.people.values()].filter((p) => p.manager_id === me.id && p.status === 'active');
  const reportIds = new Set(reports.map((p) => p.id));
  const name = (id: string | null) => firstName(id ? w.people.get(id) : undefined, lang) || '…';
  const t = now.getTime();
  const endToday = riyadhMidnightUtc(now) + DAY;
  const isLate = (x: Task) => OPEN.includes(x.status) && !!x.due_at && Date.parse(x.due_at) < t;
  const team = w.tasks.filter((x) => x.owner_id !== me.id && ((x.owner_id && reportIds.has(x.owner_id)) || x.assigner_id === me.id));
  const late = team.filter(isLate).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const blocked = team.filter((x) => x.status === 'blocked' && !isLate(x));
  const notStarted = team.filter((x) => (x.status === 'assigned' || x.status === 'returned') && x.due_at && Date.parse(x.due_at) >= t && Date.parse(x.due_at) < endToday);
  const working = team.filter((x) => OPEN.includes(x.status) && !isLate(x));
  const [from, to] = winsSpan(kind, now);
  const won = [...team, ...w.tasks.filter((x) => x.owner_id === me.id)].filter(
    (x) => x.status === 'done' && x.closed_at && Date.parse(x.closed_at) >= from && Date.parse(x.closed_at) < to,
  );

  const decisions = w.decisions.filter((d) => d.manager_id === me.id);
  const reviewTaskIds = new Set(w.reviews.filter((r) => r.reviewer_id === me.id).map((r) => r.task_id));
  const reviews = w.tasks.filter((x) => x.status === 'submitted' && (reviewTaskIds.has(x.id) || x.assigner_id === me.id) && x.owner_id !== me.id);
  const tools = w.toolsWaiting.get(me.id) ?? 0;

  const risks = [
    ...late.map((x) => say(lang, 'late', { title: x.title, name: name(x.owner_id), when: when(x.due_at!, lang) })),
    ...blocked.map((x) => say(lang, 'blocked', { title: x.title, name: name(x.owner_id) })),
    ...notStarted.map((x) => say(lang, 'dueToday', { title: x.title, name: name(x.owner_id) })),
  ];
  const needs = [
    ...decisions.map((d) => say(lang, 'decision', { title: (lang === 'ar' && d.title_ar) || d.title })),
    ...reviews.map((x) => say(lang, 'review', { name: name(x.owner_id), title: x.title })),
    ...(tools ? [say(lang, 'tools', { n: num(tools, lang) })] : []),
  ];
  const wins = won.map((x) => (x.owner_id === me.id ? say(lang, 'wonMine', { title: x.title }) : say(lang, 'won', { title: x.title, name: name(x.owner_id) })));

  // people who look stuck (same signals as the Home "Needs your support" block): the morning only
  const weekEnd = riyadhMidnightUtc(now) + 7 * DAY;
  const support =
    kind !== 'daily'
      ? []
      : reports
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

  const mine = ownWork(me, w, now, lang, kind);
  const moved = kind === 'daily' ? (w.quiet.movedFor.get(me.id) ?? 0) : 0;
  const nudged = kind === 'daily' ? (w.quiet.nudgedFor.get(me.id) ?? 0) : 0;
  const handled = [
    moved && say(lang, 'handledMoved', { n: num(moved, lang) }),
    nudged && say(lang, 'handledNudged', { n: num(nudged, lang) }),
  ].filter(Boolean) as string[];

  // quiet Saree3: midday / end of day only when there's something worth saying
  if (kind !== 'daily' && !risks.length && !needs.length && !wins.length && !mine.length) return null;
  if (kind === 'daily' && !risks.length && !needs.length && !support.length && !mine.length && !working.length && !wins.length) return null;

  const date = when(now.toISOString(), lang);
  const label = say(lang, `label_${kind}`);
  const counts = say(lang, 'counts', { label, risks: num(risks.length, lang), needs: num(needs.length, lang), wins: num(wins.length, lang) });
  const base = { subject: say(lang, `subject_${kind}`, { date }), hello: say(lang, `hello_${kind}`, { name: firstName(me, lang) }), counts };
  // nothing needs them in the morning: one line, counted not listed (BRD v1.2 FR-BRF-04)
  if (kind === 'daily' && !risks.length && !needs.length && !support.length && !mine.length)
    return {
      ...base,
      headline: say(lang, 'allClear', { n: num(working.length, lang) }),
      sections: [
        { key: 'wins' as const, title: say(lang, 'wins'), items: top(wins, lang) },
        { key: 'handled' as const, title: say(lang, 'handled'), items: handled },
      ].filter((s) => s.items.length),
      short: say(lang, 'allClearPush'),
    };
  const v = {
    working: num(working.length, lang),
    late: num(late.length, lang),
    done: num(kind === 'daily' ? wins.length : won.length, lang),
    needs: num(needs.length, lang),
    open: num(working.length + late.length, lang),
    reviews: num(reviews.length, lang),
    decisions: num(decisions.length, lang),
  };
  return {
    ...base,
    headline: say(lang, `pulse_${kind}`, v),
    sections: (
      [
        { key: 'needs', title: say(lang, 'needs'), items: top(needs, lang, 5) },
        { key: 'risks', title: say(lang, 'risks'), items: top(risks, lang, 5) },
        { key: 'wins', title: say(lang, 'wins'), items: top(wins, lang, kind === 'evening' ? 6 : 3) },
        { key: 'support', title: say(lang, 'support'), items: top(support, lang) },
        { key: 'yours', title: say(lang, 'yours'), items: top(mine, lang) },
        { key: 'handled', title: say(lang, 'handled'), items: handled },
      ] as Section[]
    ).filter((s) => s.items.length),
    short: say(lang, `push_${kind}`, v),
  };
}

/** The person's own open work worth a mention: late, due today (and tomorrow at the end of the day), sent back. */
function ownWork(me: Person, w: World, now: Date, lang: Lang, kind: Kind): string[] {
  const t = now.getTime();
  const endToday = riyadhMidnightUtc(now) + DAY;
  const until = kind === 'evening' ? endToday + DAY : endToday;
  const mine = w.tasks.filter((x) => x.owner_id === me.id && OPEN.includes(x.status));
  const late = mine.filter((x) => x.due_at && Date.parse(x.due_at) < t).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const soon = mine.filter((x) => x.due_at && Date.parse(x.due_at) >= t && Date.parse(x.due_at) < until).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const back = mine.filter((x) => x.status === 'returned' && !late.includes(x) && !soon.includes(x));
  return [
    ...late.map((x) => say(lang, 'lateMine', { title: x.title, when: when(x.due_at!, lang) })),
    ...soon.map((x) => say(lang, 'due', { title: x.title, when: when(x.due_at!, lang) })),
    ...back.map((x) => say(lang, 'back', { title: x.title })),
  ];
}

function employeeReport(me: Person, w: World, now: Date, lang: Lang, kind: Kind): Summary | null {
  const t = now.getTime();
  const endToday = riyadhMidnightUtc(now) + DAY;
  const mine = w.tasks.filter((x) => x.owner_id === me.id);
  const open = mine.filter((x) => OPEN.includes(x.status));
  const late = open.filter((x) => x.due_at && Date.parse(x.due_at) < t).length;
  const today = open.filter((x) => x.due_at && Date.parse(x.due_at) >= t && Date.parse(x.due_at) < endToday).length;
  const tomorrow = open.filter((x) => x.due_at && Date.parse(x.due_at) >= endToday && Date.parse(x.due_at) < endToday + DAY).length;
  const back = open.filter((x) => x.status === 'returned').length;
  const waiting = mine.filter((x) => x.status === 'submitted').length;
  const [from, to] = winsSpan(kind, now);
  const won = mine.filter((x) => (x.status === 'done' || x.status === 'submitted') && x.closed_at && Date.parse(x.closed_at) >= from && Date.parse(x.closed_at) < to);
  const weekStart = riyadhMidnightUtc(now) - riyadh(now).getUTCDay() * DAY; // Sunday
  const week = mine.filter((x) => x.status === 'done' && x.closed_at && Date.parse(x.closed_at) >= weekStart).length + waiting;

  const work = ownWork(me, w, now, lang, kind);
  const wins = won.map((x) => say(lang, 'wonMine', { title: x.title }));
  if (kind === 'daily' ? !work.length && !waiting : !work.length && !wins.length) return null;
  const v = { today: num(today, lang), late: num(late, lang), back: num(back, lang), done: num(won.length, lang), tomorrow: num(tomorrow, lang) };
  const label = say(lang, `label_${kind}`);
  return {
    subject: say(lang, `subject_${kind}`, { date: when(now.toISOString(), lang) }),
    hello: say(lang, `hello_${kind}`, { name: firstName(me, lang) }),
    headline: say(lang, kind === 'daily' ? 'emp_daily' : kind === 'midday' ? 'emp_midday' : 'emp_evening', v),
    sections: (
      [
        { key: 'yours', title: say(lang, 'yours'), items: top(work, lang, 5) },
        { key: 'wins', title: say(lang, 'wins'), items: kind === 'daily' ? (week ? [say(lang, 'winsWeek', { n: num(week, lang) })] : []) : top(wins, lang, 5) },
        { key: 'waiting', title: say(lang, 'waiting'), items: waiting ? [say(lang, 'waitingN', { n: num(waiting, lang) })] : [] },
      ] as Section[]
    ).filter((s) => s.items.length),
    short: say(lang, 'pushEmp', v),
    counts: say(lang, 'counts', { label, risks: num(late, lang), needs: num(work.length, lang), wins: num(wins.length, lang) }),
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

/** WhatsApp, bold section titles and one item per line (the whole report fits one message) */
function whatsappText(s: Summary, lang: Lang) {
  return rtl(
    lang === 'ar',
    [`*${s.hello}*`, s.headline, ...s.sections.flatMap((sec) => ['', `*${sec.title}*`, ...sec.items.map((i) => `• ${i}`)])].join('\n'),
  );
}

/** inside the 24 h window: the report, then what needs them as cards with buttons; outside it: the approved template */
async function sendWhatsAppReport(admin: SupabaseClient, me: Person, lang: Lang, s: Summary, kind: Kind): Promise<boolean> {
  if (!me.phone) return false;
  if (!inWindow(me.wa_last_inbound_at))
    return await waTemplate(me.phone, REPORT_TEMPLATE(), lang, [firstName(me, lang), s.counts], `rep:${kind}`);
  if (!(await waText(me.phone, whatsappText(s, lang)))) return false;
  const cards = await needsYouCards(admin, me.id, lang === 'ar');
  if (cards.length) {
    await waText(me.phone, rtl(lang === 'ar', say(lang, 'below')));
    await sendCards(me.phone, lang === 'ar', cards, 3);
  }
  return true;
}

// ─── run ──────────────────────────────────────────────────────────────────────

async function loadWorld(admin: SupabaseClient): Promise<World> {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const dayAgo = new Date(Date.now() - DAY).toISOString();
  const [peopleRes, tasksRes, decRes, revRes, movedRes, nudgedRes, itemsRes] = await Promise.all([
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
    admin.from('incoming_items').select('owner_id, suggestions').eq('status', 'new').gte('received_at', since),
  ]);
  for (const r of [peopleRes, tasksRes, decRes, revRes]) if (r.error) throw r.error;
  const toolsWaiting = new Map<string, number>();
  for (const it of (itemsRes.data ?? []) as { owner_id: string; suggestions: { state: string }[] | null }[]) {
    const n = (it.suggestions ?? []).filter((s) => s.state === 'new').length;
    if (n) toolsWaiting.set(it.owner_id, (toolsWaiting.get(it.owner_id) ?? 0) + n);
  }
  return {
    people: new Map(((peopleRes.data ?? []) as Person[]).map((p) => [p.id, p])),
    tasks: ((tasksRes.data ?? []) as Task[]).filter((x) => x.status !== 'cancelled'),
    decisions: decRes.data ?? [],
    reviews: revRes.data ?? [],
    toolsWaiting,
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

function ruleOf(p: Prefs | undefined, kind: Kind, me: Person): Required<Rule> {
  const r = (p?.rules?.[RULE_KEY[kind]] ?? {}) as Rule;
  const d = DEFAULT_RULE[kind];
  // never chose the channels: WhatsApp too once it's connected
  const channels = r.channels ?? (me.whatsapp_connected && !d.channels.includes('whatsapp') ? [...d.channels, 'whatsapp'] : d.channels);
  return { enabled: r.enabled ?? d.enabled, channels, time: r.time ?? d.time };
}

async function sendOne(
  admin: SupabaseClient,
  me: Person,
  w: World,
  prefs: Prefs | undefined,
  now: Date,
  kind: Kind,
  opts: { test: boolean; only?: string; dry?: boolean },
) {
  const lang: Lang = me.locale === 'ar' ? 'ar' : 'en';
  const rule = ruleOf(prefs, kind, me);
  const mgr = isManager(me, w);
  const s = mgr ? managerReport(me, w, now, lang, kind) : employeeReport(me, w, now, lang, kind);
  if (!s) return { profile: me.id, kind, sent: [] as string[], skipped: 'nothing to say' };

  if (kind === 'daily') {
    // "New for you": up to two features from the last 2 weeks this person hasn't tried (or turned down) yet
    const { data: feats } = await admin.from('features').select('key, audience, released_at, title, title_ar, benefit, benefit_ar').order('sort');
    const { data: mine } = await admin.from('feature_events').select('feature_key, state').eq('profile_id', me.id);
    const done = new Set(
      (mine ?? []).filter((e) => ['tried', 'adopted', 'not_interested'].includes(e.state as string)).map((e) => e.feature_key as string),
    );
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
        key: 'new',
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
        key: 'since',
        title: say(lang, 'since'),
        items: [say(lang, 'sinceN', { n: num(quiet.length, lang) }), ...quiet.slice(0, 3).map((a) => ((lang === 'ar' && a.title_ar) || a.title) as string)],
      });
  }

  const allowed = (c: string) => rule.channels.includes(c) && prefs?.channels?.[c] !== false;
  const channels = opts.dry
    ? []
    : opts.only
    ? [opts.only]
    : opts.test
      ? [...new Set([...rule.channels, 'push', 'email'])].filter((c) => prefs?.channels?.[c] !== false)
      : rule.channels.filter(allowed);
  const sent: string[] = [];

  if (channels.includes('push')) {
    // Thursday (end of the Saudi week): the morning report opens the week's receipt
    const receipt = kind === 'daily' && riyadh(now).getUTCDay() === 4;
    const pushed = await sendPush(
      [me.id],
      receipt
        ? {
            title: s.subject,
            body: `${s.hello}\n${pushLine(s.short)}\n${lang === 'ar' ? '🧾 إيصال أسبوعك جاهز' : '🧾 Your week’s receipt is ready'}`,
            data: { screen: '/32-receipt' },
          }
        : { title: s.subject, body: `${s.hello}\n${pushLine(s.short)}`, data: { screen: '/' } },
      admin,
    );
    if (pushed > 0) sent.push('push');
  }
  if (channels.includes('email') && me.email && (await sendEmail(me.email, s.subject, emailHtml(s, s.hello, lang), plainText(s, s.hello, lang))))
    sent.push('email');
  if (channels.includes('whatsapp') && waConfigured() && me.phone && me.whatsapp_connected && (await sendWhatsAppReport(admin, me, lang, s, kind)))
    sent.push('whatsapp');

  if (!opts.test) await admin.from('daily_summaries').upsert({ profile_id: me.id, day: riyadhDay(now), kind, channels: sent });
  if (!opts.dry && sent.length)
    await phCapture([{ distinctId: me.id, event: 'report_sent', properties: { kind, channels: sent.join(','), manager: mgr, asked: opts.test } }]);
  if (sent.length) {
    const via = sent.join(', ');
    await admin.from('activity_log').insert({
      actor_type: 'muntej',
      subject_id: me.id,
      action: 'daily_summary_sent',
      summary: say('en', 'logSummary', { via, label: say('en', `label_${kind}`) }),
      summary_ar: say('ar', 'logSummary', { via, label: say('ar', `label_${kind}`) }),
      reason: say(lang, 'logReason', { time: rule.time, label: say(lang, `label_${kind}`) }),
      undoable: false,
    });
  }
  return { profile: me.id, kind, sent, preview: opts.test ? (opts.dry ? whatsappText(s, lang) : plainText(s, s.hello, lang)) : undefined };
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as { test?: boolean; kind?: string; only?: string; dry?: boolean };
  const admin = adminClient();
  const now = new Date();

  // ── "Send me today's summary" from the Alerts screen, or "report" on WhatsApp (only: 'whatsapp') ──
  if (body.test) {
    const { profileId } = await getCaller(req);
    const w = await loadWorld(admin);
    const me = w.people.get(profileId);
    if (!me) throw new HttpError(404, 'No profile');
    const prefs = (await loadPrefs(admin, [me.id])).get(me.id);
    const kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : kindNow(now);
    return json(await sendOne(admin, me, w, prefs, now, kind, { test: true, only: body.only === 'whatsapp' ? 'whatsapp' : undefined, dry: !!body.dry }));
  }

  // ── cron run ──
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');

  const weekday = riyadh(now).getUTCDay(); // 5 Friday, 6 Saturday
  if (weekday === 5 || weekday === 6) return json({ skipped: 'weekend' });
  const nudged = await setupNudges(admin, now);

  const active = await (async () => {
    const { data } = await admin.from('profiles').select('id').eq('status', 'active').eq('hidden', false);
    return (data ?? []).map((p) => p.id as string);
  })();
  const prefs = await loadPrefs(admin, active);
  const { data: done, error } = await admin.from('daily_summaries').select('profile_id, kind').eq('day', riyadhDay(now)).in('kind', KINDS);
  if (error) throw error;
  const already = new Set((done ?? []).map((r) => `${r.profile_id}:${r.kind}`));

  let w: World | null = null;
  const results = [];
  for (const kind of KINDS) {
    const due = active.filter((id) => {
      if (already.has(`${id}:${kind}`)) return false;
      const r = (prefs.get(id)?.rules?.[RULE_KEY[kind]] ?? {}) as Rule;
      const at = chosenTimeUtc(now, r.time ?? DEFAULT_RULE[kind].time);
      return (r.enabled ?? DEFAULT_RULE[kind].enabled) && now.getTime() >= at && now.getTime() < at + WINDOW_MS[kind];
    });
    if (!due.length) continue;
    w ??= await loadWorld(admin);
    for (const id of due) {
      const me = w.people.get(id);
      if (me) results.push(await sendOne(admin, me, w, prefs.get(id), now, kind, { test: false }));
    }
  }
  return json({ results, nudged });
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
