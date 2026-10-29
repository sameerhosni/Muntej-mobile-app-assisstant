// "What needs you" as WhatsApp cards with buttons: decisions (Approve / Decline / Move to …), finished work to review
// (Approve / Send back), tasks found in your tools (Approve / Ignore) and your own work due today or late (Done / Need
// time / Need help). Used by the whatsapp webhook ("وش يحتاجني"), the three daily reports and alerts. The taps come
// back to the whatsapp function, which does them as the person (their own permissions).
//   d:ok|no|mv:<decision id>   r:ok|back:<task id>   ok|no:<incoming item id>:<index>   h:done|need_time|blocked:<task id>
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { rtl, waButtons, waText, type WaButton } from './wa.ts';

export type WaCard = {
  kind: 'decision' | 'review' | 'tool' | 'mine';
  body: string;
  buttons: WaButton[];
  /** the task it's about */
  taskId?: string | null;
  /** a task found in a tool: which message and which suggestion, and its one line in the numbered list */
  ref?: { item: string; index: number };
  line?: string;
};

const OPEN = ['assigned', 'in_progress', 'blocked', 'returned'];
const DAY = 86_400_000;

/** the tool a task was found in, as people say it */
const SOURCE: Record<string, [string, string]> = {
  whatsapp: ['الواتساب', 'WhatsApp'],
  gmail: ['جيميل', 'Gmail'],
  outlook: ['أوتلوك', 'Outlook'],
  google_chat: ['قوقل شات', 'Google Chat'],
  teams: ['تيمز', 'Teams'],
  meet: ['اجتماع ميت', 'a Meet call'],
  calendar: ['التقويم', 'your calendar'],
  paste: ['رسالة لصقتها', 'a pasted message'],
};

type P = { id: string; full_name: string; full_name_ar: string | null };
const first = (p: P | undefined, ar: boolean) => ((ar && p?.full_name_ar) || p?.full_name || '').split(' ')[0];

export function whenText(iso: string, ar: boolean) {
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(ar ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { ...o, timeZone: 'Asia/Riyadh' }).format(new Date(iso));
  return `${f({ weekday: 'short', day: 'numeric', month: 'short' })} · ${f({ hour: 'numeric', minute: '2-digit' })}`;
}

/** everything waiting on this person, most urgent first */
export async function needsYouCards(admin: SupabaseClient, meId: string, ar: boolean): Promise<WaCard[]> {
  const now = Date.now();
  const endToday = Date.parse(`${new Date(now + 3 * 3_600_000).toISOString().slice(0, 10)}T00:00:00Z`) - 3 * 3_600_000 + DAY;
  const [{ data: decisions }, { data: reviewRows }, { data: items }, { data: mine }] = await Promise.all([
    admin
      .from('decisions')
      .select('id, task_id, requested_by, title, title_ar, recommendation, recommendation_ar, details, task:tasks(title, owner_id)')
      .eq('manager_id', meId)
      .eq('status', 'pending')
      .order('created_at')
      .limit(10),
    admin.from('reviews').select('task_id').eq('reviewer_id', meId).is('decision', null).limit(30),
    admin.from('incoming_items').select('id, source, suggestions').eq('owner_id', meId).eq('status', 'new').order('received_at', { ascending: false }).limit(10),
    admin.from('tasks').select('id, title, due_at, status').eq('owner_id', meId).in('status', OPEN).not('due_at', 'is', null).lt('due_at', new Date(endToday).toISOString()).order('due_at').limit(10),
  ]);
  const reviewIds = (reviewRows ?? []).map((r) => r.task_id as string);
  const { data: submitted } = await admin
    .from('tasks')
    .select('id, title, owner_id')
    .eq('status', 'submitted')
    .neq('owner_id', meId)
    .or(`assigner_id.eq.${meId}${reviewIds.length ? `,id.in.(${reviewIds.join(',')})` : ''}`)
    .limit(10);

  const ids = new Set<string>();
  for (const d of decisions ?? []) {
    if (d.requested_by) ids.add(d.requested_by as string);
    const s = (d.details as Record<string, unknown> | null)?.suggested_owner_id;
    if (typeof s === 'string') ids.add(s);
  }
  for (const t of submitted ?? []) if (t.owner_id) ids.add(t.owner_id as string);
  const { data: ppl } = ids.size ? await admin.from('profiles').select('id, full_name, full_name_ar').in('id', [...ids]) : { data: [] };
  const person = new Map(((ppl ?? []) as P[]).map((p) => [p.id, p]));

  const cards: WaCard[] = [];
  for (const d of decisions ?? []) {
    const det = (d.details ?? {}) as Record<string, unknown>;
    const sug = typeof det.suggested_owner_id === 'string' ? person.get(det.suggested_owner_id) : undefined;
    const rec = ((ar && d.recommendation_ar) || d.recommendation) as string | null;
    const reason = typeof det.reason === 'string' && det.reason ? det.reason : null;
    cards.push({
      kind: 'decision',
      taskId: d.task_id as string | null,
      body: rtl(
        ar,
        [
          `⚖️ *${(ar && d.title_ar) || d.title}*`,
          ...(reason ? [`💬 «${reason.slice(0, 200)}»`] : []),
          ...(rec ? [`💡 ${ar ? 'اقتراحي' : 'My suggestion'}: ${rec}`] : []),
        ].join('\n'),
      ),
      buttons: [
        { id: `d:ok:${d.id}`, title: ar ? '✅ موافق' : '✅ Approve' },
        { id: `d:no:${d.id}`, title: ar ? '✖️ لا' : '✖️ Decline' },
        ...(sug && d.task_id ? [{ id: `d:mv:${d.id}`, title: `👤 ${ar ? 'لـ' : 'To'} ${first(sug, ar)}` }] : []),
      ],
    });
  }
  for (const t of submitted ?? [])
    cards.push({
      kind: 'review',
      taskId: t.id as string,
      body: rtl(ar, ar ? `📥 ${first(person.get(t.owner_id as string), ar) || 'أحد'} خلّص:\n📝 *${t.title}*\nتراجعها؟` : `📥 ${first(person.get(t.owner_id as string), ar) || 'Someone'} finished:\n📝 *${t.title}*\nReview it?`),
      buttons: [
        { id: `r:ok:${t.id}`, title: ar ? '✅ اعتمد' : '✅ Approve' },
        { id: `r:back:${t.id}`, title: ar ? '↩️ رجّعها' : '↩️ Send back' },
      ],
    });
  for (const it of items ?? [])
    for (const [i, s] of ((it.suggestions ?? []) as { state: string; title: string; due_at: string | null }[]).entries()) {
      if (s.state !== 'new') continue;
      const tool = (SOURCE[it.source as string] ?? [it.source, it.source])[ar ? 0 : 1];
      const dup = !!(s as { duplicate_of?: unknown }).duplicate_of;
      cards.push({
        kind: 'tool',
        ref: { item: it.id as string, index: i },
        line: `*${s.title.length > 70 ? `${s.title.slice(0, 69)}…` : s.title}*\n   ${[tool, s.due_at ? whenText(s.due_at, ar) : null, dup ? (ar ? '♻️ موجودة قبل' : '♻️ already a task') : null].filter(Boolean).join(' · ')}`,
        body: rtl(ar, `🔌 ${ar ? 'لقيتها في' : 'Found in'} ${(SOURCE[it.source as string] ?? [it.source, it.source])[ar ? 0 : 1]}:\n📝 *${s.title}*${s.due_at ? `\n⏰ ${whenText(s.due_at, ar)}` : ''}`),
        buttons: [
          { id: `ok:${it.id}:${i}`, title: ar ? '✅ اعتمد' : '✅ Approve' },
          { id: `no:${it.id}:${i}`, title: ar ? '✖️ تجاهل' : '✖️ Ignore' },
        ],
      });
    }
  for (const t of mine ?? []) {
    const late = Date.parse(t.due_at as string) < now;
    cards.push({
      kind: 'mine',
      body: rtl(ar, `${late ? '🔴' : '🟡'} *${t.title}*\n⏰ ${late ? (ar ? 'متأخرة من' : 'late since') : ar ? 'مطلوبة' : 'due'} ${whenText(t.due_at as string, ar)}`),
      buttons: [
        { id: `h:done:${t.id}`, title: ar ? '✅ خلصت' : '✅ Done' },
        { id: `h:need_time:${t.id}`, title: ar ? '⏳ أبي وقت' : '⏳ Need time' },
        { id: `h:blocked:${t.id}`, title: ar ? '🆘 أبي مساعدة' : '🆘 Need help' },
      ],
    });
  }
  return cards;
}

/** The one profile a WhatsApp number speaks for when it's on several accounts: the account its person works in now
 *  (account_sessions), else the oldest. The chat answers as this profile, and only it gets the WhatsApp reports. */
export async function waProfileFor(admin: SupabaseClient, phone: string): Promise<string | null> {
  const { data: people } = await admin
    .from('profiles')
    .select('id, user_id, account_id')
    .eq('phone', phone)
    .eq('status', 'active')
    .eq('hidden', false)
    .not('user_id', 'is', null)
    .order('created_at');
  if (!people?.length) return null;
  if (people.length === 1) return people[0].id as string;
  // each profile may have its own sign-in (two emails): the most recently used account session wins
  const { data: sessions } = await admin
    .from('account_sessions')
    .select('user_id, account_id')
    .in('user_id', [...new Set(people.map((p) => p.user_id as string))])
    .order('updated_at', { ascending: false });
  for (const s of sessions ?? []) {
    const hit = people.find((p) => p.user_id === s.user_id && p.account_id === s.account_id);
    if (hit) return hit.id as string;
  }
  return people[0].id as string;
}

/** the team's late tasks (people under me, or work I gave out): Saree3 chases these, the manager only needs to know */
export async function lateTeamLines(admin: SupabaseClient, meId: string, ar: boolean, max = 3): Promise<{ count: number; lines: string[] }> {
  const { data: reports } = await admin.from('profiles').select('id').eq('manager_id', meId).eq('status', 'active');
  const ids = (reports ?? []).map((p) => p.id as string);
  const { data: late } = await admin
    .from('tasks')
    .select('title, due_at, owner:profiles!tasks_owner_id_fkey(full_name, full_name_ar)')
    .in('status', OPEN)
    .lt('due_at', new Date().toISOString())
    .neq('owner_id', meId)
    .or(`assigner_id.eq.${meId}${ids.length ? `,owner_id.in.(${ids.join(',')})` : ''}`)
    .order('due_at')
    .limit(20);
  const rows = (late ?? []) as unknown as { title: string; due_at: string; owner: P | null }[];
  return {
    count: rows.length,
    lines: rows.slice(0, max).map((t) => `🔴 *${t.title.length > 50 ? `${t.title.slice(0, 49)}…` : t.title}* · ${first(t.owner ?? undefined, ar) || '…'} · ${whenText(t.due_at, ar)}`),
  };
}

/** tasks found in tools as ONE numbered message (owner, 28 Oct: one card each took ages to answer, and every tap
 *  jumped to the bottom of the chat). The numbers map to the cards in this order. */
export const MAX_LIST = 30;
export function toolListText(cards: WaCard[], ar: boolean) {
  const shown = cards.slice(0, MAX_LIST);
  return rtl(
    ar,
    [
      ar ? `🔌 لقيت ${cards.length === 1 ? 'مهمة وحدة' : cards.length === 2 ? 'مهمتين' : `${cards.length} ${cards.length <= 10 ? 'مهام' : 'مهمة'}`} في أدواتك:` : `🔌 I found ${cards.length} task${cards.length > 1 ? 's' : ''} in your tools:`,
      '',
      ...shown.map((c, n) => `${n + 1}. ${c.line ?? ''}`),
      ...(cards.length > shown.length ? ['', ar ? `و${cards.length - shown.length} غيرها في منتج ← أدواتك` : `+${cards.length - shown.length} more in Muntej → Your tools`] : []),
    ].join('\n'),
  );
}
export function toolListButtons(ar: boolean): { body: string; buttons: WaButton[] } {
  return {
    body: rtl(
      ar,
      ar
        ? 'تعتمدها كلها؟ أو اكتب أرقام اللي تبيها (مثل: 1 3 5 أو 1-4) وأتجاهل الباقي.\nأو «تجاهل 2 6» وأعتمد الباقي.'
        : 'Approve them all? Or type the numbers you want (e.g. 1 3 5 or 1-4) and I’ll ignore the rest.\nOr "ignore 2 6" and I’ll approve the rest.',
    ),
    buttons: [
      { id: 'ta:', title: ar ? '✅ اعتمد الكل' : '✅ Approve all' },
      { id: 'ti:', title: ar ? '✖️ تجاهل الكل' : '✖️ Ignore all' },
      { id: 'tp:', title: ar ? '✍️ أختار' : '✍️ I’ll choose' },
    ],
  };
}

export type Pick = { all: 'approve' | 'ignore' } | { approve: boolean; nums: number[] };
/** "1 3 5", "1-4, 7", "١ و ٣", "اعتمد 2 4", "تجاهل 2 6", "كلها إلا 3", "all except 3", "الكل": null when it isn't a pick */
export function parsePick(raw: string): Pick | null {
  const s = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[،؛]/g, ',')
    .trim()
    .toLowerCase()
    .replace(/^[✅✖️❌\s]+/u, '');
  if (/^(اعتمد|اعتمدها|approve|ok|okay)?\s*(الكل|كلها|كله|all)\s*$/.test(s)) return { all: 'approve' };
  if (/^(تجاهل|تجاهلها|ignore)\s*(الكل|كلها|كله|all)\s*$/.test(s)) return { all: 'ignore' };
  let approve = true;
  let rest = s;
  const neg = rest.match(/^(كلها|الكل|all)?\s*(الا|إلا|ماعدا|ما عدا|except|but)\s*/) ?? rest.match(/^(تجاهل|تجاهلها|ignore|skip)\s*/);
  const pos = rest.match(/^(اعتمد|اعتمدها|approve|ok|add|اضف|أضف)\s*/);
  if (neg) {
    approve = false;
    rest = rest.slice(neg[0].length);
  } else if (pos) rest = rest.slice(pos[0].length);
  rest = rest.replace(/(\d)\s*و\s*(?=\d)/g, '$1 ').replace(/\b(and|to)\b|الى|إلى|لين/g, (w) => (w === 'and' ? ' ' : '-')).replace(/\s*[-–]\s*/g, '-');
  if (!/^[\d\s,\-–]+$/.test(rest) || !/\d/.test(rest)) return null;
  const nums = new Set<number>();
  for (const part of rest.split(/[\s,]+/).filter(Boolean)) {
    const r = part.match(/^(\d+)[-–](\d+)$/);
    if (r) for (let n = Math.min(+r[1], +r[2]); n <= Math.max(+r[1], +r[2]) && nums.size < 200; n++) nums.add(n);
    else if (/^\d+$/.test(part)) nums.add(+part);
    else return null;
  }
  return { approve, nums: [...nums] };
}

/** sends up to `max` cards, then one line for the rest */
export async function sendCards(phone: string, ar: boolean, cards: WaCard[], max = 3) {
  for (const c of cards.slice(0, max)) await waButtons(phone, c.body, c.buttons);
  if (cards.length > max)
    await waText(phone, rtl(ar, ar ? `و${cards.length - max} غيرها في منتج، أو قل «وش يحتاجني» وأرسلها لك 👌` : `+${cards.length - max} more in Muntej, or say "what needs me" and I'll send them 👌`));
}
