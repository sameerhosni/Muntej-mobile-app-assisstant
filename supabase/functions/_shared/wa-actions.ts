// "What needs you" as WhatsApp cards with buttons: decisions (Approve / Decline / Move to …), finished work to review
// (Approve / Send back), tasks found in your tools (Approve / Ignore) and your own work due today or late (Done / Need
// time / Need help). Used by the whatsapp webhook ("وش يحتاجني"), the three daily reports and alerts. The taps come
// back to the whatsapp function, which does them as the person (their own permissions).
//   d:ok|no|mv:<decision id>   r:ok|back:<task id>   ok|no:<incoming item id>:<index>   h:done|need_time|blocked:<task id>
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { titleIn } from './task-text.ts';
import { rtl, waButtons, waText, type WaButton, type WaRow } from './wa.ts';

export type WaCard = {
  kind: 'decision' | 'review' | 'question' | 'comment' | 'cancel' | 'tool' | 'mine';
  body: string;
  buttons: WaButton[];
  /** the task it's about */
  taskId?: string | null;
  /** a task found in a tool: which message and which suggestion, and its one line in the numbered list */
  ref?: { item: string; index: number };
  line?: string;
  /** a tool card's title, who asked, when it came and when it's due: one row of the WhatsApp list */
  title?: string;
  /** Muntej's own ≤20-character name for it (owner, 11 Nov, option B) */
  short?: string | null;
  who?: string | null;
  at?: string | null;
  due?: string | null;
};

/** "اليوم 4:02م" / "أمس" / "الأحد 8 نوفمبر": short, Riyadh time (owner, 10 Nov: the full date on every line was noise) */
export function shortWhen(iso: string, ar: boolean, now = new Date()) {
  const day = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(ar ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { ...o, timeZone: 'Asia/Riyadh' }).format(d);
  const time = f({ hour: 'numeric', minute: '2-digit' }).replace(/\s?(ص|م)$/, '$1');
  if (day(d) === day(now)) return ar ? `اليوم ${time}` : `today ${time}`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return ar ? 'أمس' : 'yesterday';
  if (day(d) === day(new Date(now.getTime() + 86_400_000))) return ar ? `بكرة ${time}` : `tomorrow ${time}`;
  return f({ weekday: 'short', day: 'numeric', month: 'short' });
}

/** the tools list as WhatsApp's drop-down (owner, 10 Nov, option 2): one row per task — its title, then who · when ·
 *  due. A row opens the task's full card. 10 rows at most: with more, the 10th is «شوف الباقي» */
export function toolListRows(cards: WaCard[], ar: boolean, from = 0, nums?: number[]): WaRow[] {
  // nums: each card's number in the FIRST list sent (the numbers typed back point there, reviewer, 10 Nov)
  const numOf = (k: number) => (nums ? nums[k] : k + 1);
  const page = cards.slice(from);
  const more = page.length > 10;
  const shown = more ? page.slice(0, 9) : page.slice(0, 10);
  const rows: WaRow[] = shown.map((c, i) => ({
    id: `tc:${c.ref!.item}:${c.ref!.index}`,
    // a name that reads whole, never cut mid-word (owner, 11 Nov, option B: «Investigate AI assig…» said nothing)
    title: ((n) => `${n} ${shortTitle({ title: c.title ?? '…', short_title: c.short }, 24 - n.length - 1)}`)(`${numOf(from + i)}.`),
    description: clip(
      [c.who ? (ar ? `من ${c.who}` : `from ${c.who}`) : null, c.at ? shortWhen(c.at, ar) : null, c.due ? `⏰ ${shortWhen(c.due, ar)}` : null].filter(Boolean).join(' · ') ||
        (ar ? 'من أدواتك' : 'from your tools'),
      72,
    ),
  }));
  if (more) rows.push({ id: `tl:${numOf(from + 9) - 1}`, title: ar ? `📋 شوف الباقي (${page.length - 9})` : `📋 See the rest (${page.length - 9})` });
  return rows;
}
/** the message above the list button: how many, and from whom */
export function toolListIntro(cards: WaCard[], ar: boolean, button?: string, beyond = 0) {
  const n = cards.length;
  const by = new Map<string, number>();
  for (const c of cards) if (c.who) by.set(c.who, (by.get(c.who) ?? 0) + 1);
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, k]) => (ar ? `${k} من ${w.split(' ')[0]}` : `${k} from ${w.split(' ')[0]}`));
  return rtl(
    ar,
    [
      ar ? `🔌 *${n === 1 ? 'مهمة وحدة' : n === 2 ? 'مهمتين' : `${n} ${n <= 10 ? 'مهام' : 'مهمة'}`} من أدواتك* تنتظر موافقتك` : `🔌 *${n} task${n > 1 ? 's' : ''} from your tools* wait for your OK`,
      ...(top.length ? [top.join(' · ') + (by.size > 3 ? ' · …' : '')] : []),
      // the button this very message has (reviewer, 10 Nov: page 2's button is «شوف الباقي»)
      ar ? `اضغط «${button ?? '📋 شوف المهام'}» واختر مهمة تشوف تفاصيلها.` : `Tap "${button ?? '📋 See tasks'}" and pick one for its details.`,
      // more than the list can number: the rest are in the app
      ...(beyond > 0 ? [ar ? `و${beyond} غيرها في منتج ← أدواتك` : `+${beyond} more in Muntej → Your tools`] : []),
      // where they live in the app too (Nouran, 10 Nov: "I discovered it by chance")
      ar ? '📲 وتلقاها كمان في تطبيق منتج: الرئيسية ← «يحتاجك» ← «لقيت … في أدواتك»' : '📲 They’re also in the Muntej app: Home → "Needs you" → "tasks found in your tools"',
    ].join('\n'),
  );
}

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
      .select('id, type, task_id, requested_by, title, title_ar, recommendation, recommendation_ar, details, task:tasks(title, owner_id)')
      .eq('manager_id', meId)
      .eq('status', 'pending')
      .order('created_at')
      .limit(10),
    admin.from('reviews').select('task_id').eq('reviewer_id', meId).is('decision', null).limit(30),
    admin.from('incoming_items').select(TOOL_ITEM_COLS).eq('owner_id', meId).eq('status', 'new').order('received_at', { ascending: false }).limit(10),
    admin.from('tasks').select('id, title, translations, due_at, status').eq('owner_id', meId).in('status', OPEN).not('due_at', 'is', null).lt('due_at', new Date(endToday).toISOString()).order('due_at').limit(10),
  ]);
  const reviewIds = (reviewRows ?? []).map((r) => r.task_id as string);
  const { data: submitted } = await admin
    .from('tasks')
    .select('id, title, translations, owner_id')
    .eq('status', 'submitted')
    .neq('owner_id', meId)
    .or(`assigner_id.eq.${meId}${reviewIds.length ? `,id.in.(${reviewIds.join(',')})` : ''}`)
    .limit(10);

  const ids = new Set<string>();
  for (const d of decisions ?? []) {
    if (d.requested_by) ids.add(d.requested_by as string);
    const s = (d.details as Record<string, unknown> | null)?.suggested_owner_id;
    if (typeof s === 'string') ids.add(s);
    const asked = (d.details as Record<string, unknown> | null)?.asked_of;
    if (typeof asked === 'string') ids.add(asked);
  }
  for (const t of submitted ?? []) if (t.owner_id) ids.add(t.owner_id as string);
  const { data: ppl } = ids.size ? await admin.from('profiles').select('id, full_name, full_name_ar').in('id', [...ids]) : { data: [] };
  const person = new Map(((ppl ?? []) as P[]).map((p) => [p.id, p]));

  const cards: WaCard[] = [];
  // a request someone couldn't give directly: «👤 لـ X» gives it to the person they asked, when you may (assign rule)
  const mayGive = (decisions ?? []).some((d) => (d as { type?: string }).type === 'task_request')
    ? new Set((((await admin.rpc('assignable_for', { p_actor: meId })).data ?? []) as unknown[]).map((x) => (typeof x === 'string' ? x : (x as Record<string, string>).assignable_for)))
    : new Set<string>();
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
      // an ask someone couldn't give directly: add it to you, or not (owner, 11 Nov)
      buttons:
        (d as { type?: string }).type === 'task_request'
          ? [
              { id: `d:ok:${d.id}`, title: ar ? '✅ أضفها لي' : '✅ Take it on' },
              ...(typeof det.asked_of === 'string' && det.asked_of !== meId && mayGive.has(det.asked_of) && person.get(det.asked_of)
                ? [{ id: `d:mv:${d.id}`, title: clip(`👤 ${ar ? 'لـ' : 'To'} ${first(person.get(det.asked_of), ar)}`, 20) }]
                : []),
              { id: `d:no:${d.id}`, title: ar ? '✖️ تجاهل' : '✖️ Not now' },
            ]
          : [
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
      body: rtl(ar, ar ? `📥 ${first(person.get(t.owner_id as string), ar) || 'أحد'} خلّص:\n📝 *${titleIn(t as never, ar ? 'ar' : 'en')}*\nتراجعها؟` : `📥 ${first(person.get(t.owner_id as string), ar) || 'Someone'} finished:\n📝 *${titleIn(t as never, ar ? 'ar' : 'en')}*\nReview it?`),
      buttons: [
        { id: `r:ok:${t.id}`, title: ar ? '✅ اعتمد' : '✅ Approve' },
        { id: `r:back:${t.id}`, title: ar ? '↩️ رجّعها' : '↩️ Send back' },
      ],
    });
  // questions about tasks they gave (due date, definition of done, budget) still unanswered: «✍️ جاوب» (owner, 10 Nov:
  // outside the 24 h window the "something needs you" button brought only decisions and reviews)
  const answersOn = (await admin.rpc('feature_on_for', { p_key: 'task_answers', p_profile: meId })).data === true;
  const { data: asks } = !answersOn ? { data: [] } : await admin
    .from('alerts')
    .select('task_id, title, title_ar, body, body_ar, dedupe_key')
    .eq('profile_id', meId)
    .eq('kind', 'detail_asked')
    .is('read_at', null)
    .not('task_id', 'is', null)
    .gte('created_at', new Date(now - 14 * DAY).toISOString())
    .order('created_at', { ascending: false })
    .limit(6);
  const seenAsk = new Set<string>();
  for (const a of asks ?? []) {
    const what = /^ask:[0-9a-f-]+:(due|doneDef|budget):/.exec((a.dedupe_key as string | null) ?? '')?.[1];
    if (!what || seenAsk.has(`${a.task_id}:${what}`)) continue;
    seenAsk.add(`${a.task_id}:${what}`);
    cards.push({
      kind: 'question',
      taskId: a.task_id as string,
      body: rtl(ar, `❓ *${((ar && a.title_ar) || a.title) as string}*\n${((ar && a.body_ar) || a.body || '') as string}`.trim()),
      buttons: [{ id: `da:${a.task_id}:${what}`, title: ar ? '✍️ جاوب' : '✍️ Answer' }],
    });
  }
  // one «يحتاجك» (owner, 11 Nov, option 2): comments and cancel requests wait here too, like in the app (testers first)
  if ((await admin.rpc('feature_on_for', { p_key: 'one_needs_you', p_profile: meId })).data === true) {
    const { data: waits } = await admin
      .from('alerts')
      .select('task_id, kind, title, title_ar, body, body_ar, task:tasks(status)')
      .eq('profile_id', meId)
      .in('kind', ['task_comment', 'cancel_asked'])
      .is('read_at', null)
      .not('task_id', 'is', null)
      .gte('created_at', new Date(now - 14 * DAY).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);
    const seen = new Set<string>();
    for (const a of (waits ?? []) as unknown as { task_id: string; kind: string; title: string; title_ar: string | null; body: string | null; body_ar: string | null; task: { status: string } | null }[]) {
      if (seen.has(`${a.kind}:${a.task_id}`) || ['done', 'cancelled'].includes(a.task?.status ?? '')) continue;
      seen.add(`${a.kind}:${a.task_id}`);
      const body = rtl(ar, `${a.kind === 'cancel_asked' ? '✕' : '💬'} *${(ar && a.title_ar) || a.title}*\n${((ar && a.body_ar) || a.body || '').slice(0, 300)}`.trim());
      cards.push(
        a.kind === 'cancel_asked'
          ? { kind: 'cancel', taskId: a.task_id, body, buttons: [{ id: `xc:${a.task_id}`, title: ar ? '✕ ألغها' : '✕ Cancel it' }, { id: `xk:${a.task_id}`, title: ar ? '👍 خلّها' : '👍 Keep it' }] }
          : { kind: 'comment', taskId: a.task_id, body, buttons: [{ id: `cm:${a.task_id}`, title: ar ? '💬 رد عليه' : '💬 Reply' }] },
      );
    }
  }
  const choicesOn = await choicesOnFor(admin, meId);
  for (const it of items ?? []) cards.push(...toolCardsOf(it as ToolItem, ar, choicesOn));
  for (const t of mine ?? []) {
    const late = Date.parse(t.due_at as string) < now;
    cards.push({
      kind: 'mine',
      body: rtl(ar, `${late ? '🔴' : '🟡'} *${titleIn(t as never, ar ? 'ar' : 'en')}*\n⏰ ${late ? (ar ? 'متأخرة من' : 'late since') : ar ? 'مطلوبة' : 'due'} ${whenText(t.due_at as string, ar)}`),
      buttons: [
        { id: `h:done:${t.id}`, title: ar ? '✅ خلصت' : '✅ Done' },
        { id: `h:need_time:${t.id}`, title: ar ? '⏳ أبي وقت' : '⏳ Need time' },
        { id: `h:blocked:${t.id}`, title: ar ? '🆘 أبي مساعدة' : '🆘 Need help' },
      ],
    });
  }
  // one «يحتاجك»: only what the shared list holds (needs_you_items, the same the app reads — reviewer, 11 Nov), one card
  // per task for questions, comments and cancel requests; your tools and today's own tasks stay (not in the count)
  const one = await needsYouList(admin, meId);
  if (one) {
    const seen = new Set<string>();
    return cards.filter((c) => {
      if (c.kind === 'tool' || c.kind === 'mine') return true;
      const kind = c.kind === 'decision' ? 'request' : c.kind;
      const hit = one.find((i) =>
        i.kind === kind && (kind === 'request' ? c.buttons.some((b) => !!i.decision_id && b.id.endsWith(i.decision_id)) : i.task_id === c.taskId),
      );
      const key = `${kind}:${hit?.decision_id ?? hit?.task_id}`;
      if (!hit || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return cards;
}

type ToolItem = {
  id: string;
  owner_id?: string | null;
  source: string;
  sender?: string | null;
  subject?: string | null;
  received_at?: string | null;
  suggestions:
    | {
        state: string;
        title: string;
        short_title?: string | null;
        due_at: string | null;
        duplicate_of?: unknown;
        requested_by?: string | null;
        quote?: string | null;
        owner_id?: string | null;
        owner_name?: string | null;
        description?: string | null;
        definition_of_done?: string | null;
        priority?: string | null;
        proof_required?: string | null;
      }[]
    | null;
};
export const TOOL_ITEM_COLS = 'id, owner_id, source, sender, subject, received_at, suggestions';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** a found task's name for a list row (owner, 11 Nov, option B): Muntej's own short title (≤20, so a numbered row shows it whole), else the full title cut
 *  at a word, never mid-word */
export function shortTitle(s: { title: string; short_title?: string | null }, max = 22) {
  const t = ((s.short_title ?? '').trim() || s.title).trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 8 ? cut.slice(0, sp) : cut).trim()}…`;
}
const PRIORITY: Record<string, [string, string]> = { urgent: ['🔴 عاجلة', '🔴 urgent'], high: ['🟠 مهمة', '🟠 high'] };
const PROOF: Record<string, [string, string]> = { image: ['📎 يرسل صورة', '📎 send a photo'], file: ['📎 يرسل ملف', '📎 send a file'], link: ['📎 يرسل رابط', '📎 send a link'], any: ['📎 يرسل إثبات', '📎 send proof'] };

/** the three buttons under a found task (owner, 11 Nov): approve for whoever it's for, «لغيري», «⋯ خيارات» */
export function toolButtons(it: { id: string; owner_id?: string | null }, i: number, s: { owner_id?: string | null; owner_name?: string | null }, ar: boolean): WaButton[] {
  const forMe = !s.owner_id || s.owner_id === it.owner_id;
  const name = (realName(s.owner_name) ?? '').split(' ')[0];
  return [
    { id: `ok:${it.id}:${i}`, title: forMe || !name ? (ar ? '✅ اعتمدها لي' : '✅ Mine, approve') : clip(`✅ ${ar ? 'لـ' : 'To'} ${name}`, 20) },
    { id: `tg:${it.id}:${i}`, title: ar ? '👤 لغيري' : '👤 Someone else' },
    { id: `tx:${it.id}:${i}`, title: ar ? '⋯ خيارات' : '⋯ More' },
  ];
}
/** a person or place a tool reports, never a placeholder ("Direct message", "Space") */
const realName = (s: string | null | undefined) => (s && !/^(direct message|google chat|google meet|microsoft teams|teams|meeting|group|space|someone|unknown)$/i.test(s.trim()) ? s.trim() : null);

/** an item's waiting suggestions as cards (✅ اعتمد / ✖️ تجاهل). Enough to decide right there (owner, 10 Nov: "Need some
 *  info on the task like from whom and when or any other important things to help me to confirm"): who asked, when,
 *  where (the mail subject or the chat), their words, the due date, and who it would go to */
/** the new card buttons go to testers first (feature found_task_choices); the others keep ✅ اعتمد / ✖️ تجاهل */
export async function choicesOnFor(admin: SupabaseClient, profileId: string | null | undefined) {
  return !!profileId && (await admin.rpc('feature_on_for', { p_key: 'found_task_choices', p_profile: profileId })).data === true;
}

function toolCardsOf(it: ToolItem, ar: boolean, choicesOn = true): WaCard[] {
  const out: WaCard[] = [];
  const tool = (SOURCE[it.source] ?? [it.source, it.source])[ar ? 0 : 1];
  for (const [i, s] of (it.suggestions ?? []).entries()) {
    if (s.state !== 'new') continue;
    const dup = !!s.duplicate_of;
    // the sender only when it names a person: a chat space's or meeting's name in that field is a place (reviewer, 10 Nov)
    const sender = realName(it.sender);
    const who = realName(s.requested_by) ?? (sender && sender !== realName(it.subject) ? sender : null);
    const sent = it.received_at ? whenText(it.received_at, ar) : null;
    const where = realName(it.subject);
    const words = (s.quote ?? '').trim();
    const forMe = !!s.owner_id && s.owner_id === it.owner_id;
    const forWho = forMe ? (ar ? 'لك' : 'you') : realName(s.owner_name);
    const desc = (s.description ?? '').trim();
    const done = (s.definition_of_done ?? '').trim();
    const flags = [
      s.due_at ? `⏰ ${ar ? 'مطلوبة' : 'due'} ${whenText(s.due_at, ar)}` : null,
      s.priority && PRIORITY[s.priority] ? PRIORITY[s.priority][ar ? 0 : 1] : null,
      s.proof_required && PROOF[s.proof_required] ? PROOF[s.proof_required][ar ? 0 : 1] : null,
    ].filter(Boolean);
    out.push({
      kind: 'tool',
      ref: { item: it.id, index: i },
      title: s.title,
      short: s.short_title ?? null,
      who,
      at: it.received_at ?? null,
      due: s.due_at,
      line: `*${clip(s.title, 70)}*\n   ${[who ? (ar ? `من ${who}` : `from ${who}`) : null, tool, sent, s.due_at ? `⏰ ${whenText(s.due_at, ar)}` : null, dup ? (ar ? '♻️ موجودة قبل' : '♻️ already a task') : null].filter(Boolean).join(' · ')}`,
      // everything needed to decide, within WhatsApp's 1024 (owner, 11 Nov: "how can I approve any task without any
      // details of it?"): where, what exactly, who asked and when, what's needed, when it's done, due, who it's for
      body: clip(
        rtl(
          ar,
          [
            `🔌 ${ar ? 'لقيتها في' : 'Found in'} ${tool}${where ? ` · «${clip(where, 50)}»` : ''}`,
            `📝 *${s.title}*`,
            ...(who || sent ? [`👤 ${[who ? (ar ? `من ${who}` : `from ${who}`) : null, sent].filter(Boolean).join(' · ')}`] : []),
            ...(desc ? [`📄 ${ar ? 'المطلوب' : 'What'}: ${clip(desc, 320)}`] : words && words !== s.title ? [`💬 «${clip(words, 200)}»`] : []),
            ...(done ? [`✓ ${ar ? 'تنتهي لما' : 'Done when'}: ${clip(done, 160)}`] : []),
            ...(flags.length ? [flags.join(' · ')] : []),
            `➡️ ${forWho ? (forMe ? forWho : `${ar ? 'لـ' : 'for'} ${forWho}`) : ar ? 'ما لها أحد للحين' : 'nobody yet'}`,
            ...(dup ? [ar ? '♻️ فيه مهمة مثلها من قبل' : '♻️ there is already a task like it'] : []),
          ].join('\n'),
        ),
        1000,
      ),
      buttons: choicesOn
        ? toolButtons(it, i, s, ar)
        : [
            { id: `ok:${it.id}:${i}`, title: ar ? '✅ اعتمد' : '✅ Approve' },
            { id: `no:${it.id}:${i}`, title: ar ? '✖️ تجاهل' : '✖️ Ignore' },
          ],
    });
  }
  return out;
}

/** the exact items a "found in your tools" alert named (kept in its key: tools_found:<conn>:<ts>:<id,id>) */
export const foundItemIds = (dedupeKey: string | null | undefined) => (/^tools_found:[^:]+:\d+:(.+)$/.exec(dedupeKey ?? '')?.[1] ?? '').split(',').filter(Boolean);

/** cards for exactly those items, still waiting (reviewer, 10 Nov: never "the newest waiting ones") */
export async function toolCardsFor(admin: SupabaseClient, itemIds: string[], ar: boolean): Promise<WaCard[]> {
  if (!itemIds.length) return [];
  const { data } = await admin.from('incoming_items').select(TOOL_ITEM_COLS).in('id', itemIds).eq('status', 'new');
  const byId = new Map(((data ?? []) as ToolItem[]).map((x) => [x.id, x]));
  // each item by its own seat's switch
  const on = new Map<string, boolean>();
  for (const seat of new Set([...byId.values()].map((x) => x.owner_id ?? ''))) on.set(seat, await choicesOnFor(admin, seat));
  return itemIds.flatMap((id) => (byId.get(id) ? toolCardsOf(byId.get(id)!, ar, on.get(byId.get(id)!.owner_id ?? '') ?? false) : []));
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
    // the super admin's console seat never answers on WhatsApp: the person's company seat does (owner, 10 Nov)
    .neq('role', 'super_admin')
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
  // no switch on record: the seat the phone's app signed in to last (its newest push token), then the oldest
  const { data: tok } = await admin
    .from('push_tokens')
    .select('profile_id')
    .in('profile_id', people.map((p) => p.id as string))
    .order('updated_at', { ascending: false })
    .limit(1);
  if (tok?.[0]) return tok[0].profile_id as string;
  return people[0].id as string;
}

/** the team's late tasks (people under me, or work I gave out): Saree3 chases these, the manager only needs to know */
export async function lateTeamLines(admin: SupabaseClient, meId: string, ar: boolean, max = 3): Promise<{ count: number; lines: string[] }> {
  const { data: reports } = await admin.from('profiles').select('id').eq('manager_id', meId).eq('status', 'active');
  const ids = (reports ?? []).map((p) => p.id as string);
  const { data: late } = await admin
    .from('tasks')
    .select('title, translations, due_at, owner:profiles!tasks_owner_id_fkey(full_name, full_name_ar)')
    .in('status', OPEN)
    .lt('due_at', new Date().toISOString())
    .neq('owner_id', meId)
    .or(`assigner_id.eq.${meId}${ids.length ? `,owner_id.in.(${ids.join(',')})` : ''}`)
    .order('due_at')
    .limit(20);
  const rows = (late ?? []) as unknown as { title: string; translations: Record<string, { title?: string }> | null; due_at: string; owner: P | null }[];
  return {
    count: rows.length,
    lines: rows.slice(0, max).map((x) => ({ ...x, title: titleIn(x, ar ? 'ar' : 'en') })).map((t) => `🔴 *${t.title.length > 50 ? `${t.title.slice(0, 49)}…` : t.title}* · ${first(t.owner ?? undefined, ar) || '…'} · ${whenText(t.due_at, ar)}`),
  };
}

/** tasks found in tools as ONE numbered message (owner, 28 Oct: one card each took ages to answer, and every tap
 *  jumped to the bottom of the chat). The numbers map to the cards in this order. */
export const MAX_LIST = 30;
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

export type NeedItem = { kind: 'request' | 'cancel' | 'review' | 'question' | 'comment'; task_id: string | null; decision_id: string | null };
/** the shared «يحتاجك» list (needs_you_items) when one_needs_you is on for this seat, else null */
export async function needsYouList(admin: SupabaseClient, meId: string): Promise<NeedItem[] | null> {
  if ((await admin.rpc('feature_on_for', { p_key: 'one_needs_you', p_profile: meId })).data !== true) return null;
  const { data, error } = await admin.rpc('needs_you_items', { p_profile: meId });
  if (error) {
    console.error('needs_you_items', error.message);
    return null;
  }
  return (data ?? []) as NeedItem[];
}

/** Arabic counted noun: «سؤال / سؤالين / 3 أسئلة / 11 سؤال» (R55) */
function arCount(n: number, one: string, two: string, few: string) {
  return n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${one}`;
}
/** «عندك 5 تنتظرك: 3 اعتمادات، سؤال، طلب إلغاء» — the same list and number as the app's «يحتاجك» (needs_you_items):
 *  your own tasks due today and tasks found in your tools are not in it */
export function waitingLine(items: NeedItem[], ar: boolean): string | null {
  if (!items.length) return null;
  const n = (k: NeedItem['kind']) => items.filter((i) => i.kind === k).length;
  const parts: [number, string][] = ar
    ? [
        [n('review'), arCount(n('review'), 'اعتماد', 'اعتمادين', 'اعتمادات')],
        [n('request'), arCount(n('request'), 'طلب', 'طلبين', 'طلبات')],
        [n('cancel'), arCount(n('cancel'), 'طلب إلغاء', 'طلبين إلغاء', 'طلبات إلغاء')],
        [n('question'), arCount(n('question'), 'سؤال', 'سؤالين', 'أسئلة')],
        [n('comment'), arCount(n('comment'), 'تعليق', 'تعليقين', 'تعليقات')],
      ]
    : [
        [n('review'), `${n('review')} to approve`],
        [n('request'), `${n('request')} request${n('request') > 1 ? 's' : ''}`],
        [n('cancel'), `${n('cancel')} to cancel`],
        [n('question'), `${n('question')} question${n('question') > 1 ? 's' : ''}`],
        [n('comment'), `${n('comment')} comment${n('comment') > 1 ? 's' : ''}`],
      ];
  const bits = parts.filter(([k]) => k > 0).map(([, w]) => w);
  const total = items.length;
  if (ar) return total === 1 ? `فيه شي واحد ينتظرك: ${bits[0]} 👇` : `عندك ${total} تنتظرك: ${bits.join('، ')} 👇`;
  return `${total} wait${total > 1 ? '' : 's'} on you: ${bits.join(', ')} 👇`;
}

/** sends up to `max` cards, then one line for the rest */
export async function sendCards(phone: string, ar: boolean, cards: WaCard[], max = 3) {
  for (const c of cards.slice(0, max)) await waButtons(phone, c.body, c.buttons);
  if (cards.length > max)
    await waText(phone, rtl(ar, ar ? `و${cards.length - max} غيرها في منتج، أو قل «وش يحتاجني» وأرسلها لك 👌` : `+${cards.length - max} more in Muntej, or say "what needs me" and I'll send them 👌`));
}
