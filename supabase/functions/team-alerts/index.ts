// team-alerts — risk & achievement alerts for people and their managers.
// 1) Called every 15 minutes by pg_cron (header x-cron-secret = CRON_SECRET). Detects:
//    - task_late          active task whose due_at passed in the last 24h → owner's manager (or admins) + owner
//    - task_at_risk       ≥65% of the task's time gone and progress < 50 → owner's manager (or admins)
//    - overload           open work > 110% of weekly capacity → person's manager (or admins), once per ISO week
//    - task_done_on_time  closed in the last 24h on/before due_at → owner + owner's manager
//    - task_done_early    same, but ≥24h before due_at
//    - five_star          review rated 5 decided in the last 24h → owner + owner's manager
//    - objective_at_risk  progress well behind time used, or late linked tasks → objective owner + their manager (weekly)
//    - objective_missed   the objective's end passed before all its tasks were done → owner + their manager (once)
//    - no_reply           a follow-up was sent N h ago (escalation.no_reply_hours, default 24) and nothing moved → owner
//    - escalated          still nothing after 2×N h → the owner's manager (escalation.alert_manager)
//    Every alert row has a dedupe_key; rows are inserted with ON CONFLICT DO NOTHING, then delivered by the shared
//    pipeline (_shared/notify.ts: settings, quiet hours, push + WhatsApp, activity_log).
// 2) Called by a signed-in user with { test: true }: creates one sample achievement alert for that user (deduped per
//    minute) and delivers it, so the flow can be tried from the phone.
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { deliverPending, loadPrefs, RULE_FOR } from '../_shared/notify.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Kind =
  | 'task_late'
  | 'task_at_risk'
  | 'overload'
  | 'task_done_on_time'
  | 'task_done_early'
  | 'five_star'
  | 'objective_at_risk'
  | 'objective_missed'
  | 'no_reply'
  | 'escalated';

type Person = {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  role: string;
  manager_id: string | null;
  status: string;
  locale: string;
  phone: string | null;
  whatsapp_connected: boolean;
  weekly_capacity_hours: number | null;
};

type Task = {
  id: string;
  title: string;
  owner_id: string | null;
  status: string;
  due_at: string | null;
  start_at: string | null;
  created_at: string;
  closed_at: string | null;
  progress: number;
  estimate_hours: number | null;
};

type AlertRow = {
  profile_id: string;
  kind: Kind;
  subject_id: string | null;
  task_id: string | null;
  title: string;
  body: string;
  title_ar: string;
  body_ar: string;
  dedupe_key: string;
};

type Inserted = AlertRow & { id: string };

/** Statuses where the owner still has the ball (submitted = waiting on the reviewer, so not "late" on the owner). */
const ACTIVE = ['assigned', 'in_progress', 'blocked', 'returned'];
/** Statuses that still count as open work for capacity. */
const OPEN = ['assigned', 'in_progress', 'blocked', 'returned', 'submitted'];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DEFAULT_TASK_HOURS = 4;

// ─── texts (EN + Saudi Arabic) ────────────────────────────────────────────────
type Ctx = {
  task?: string;
  name: string;
  nameAr: string;
  self: boolean;
  pct?: number;
  progress?: number;
  hours?: number;
  cap?: number;
  early?: number;
  late?: number;
};

function texts(kind: Kind, c: Ctx): { title: string; body: string; title_ar: string; body_ar: string } {
  switch (kind) {
    case 'task_late':
      return {
        title: `Running late: ${c.task}`,
        body: c.self
          ? 'Your due time has passed. Send an update or ask for more time.'
          : `${c.name}'s task passed its due time and isn't closed yet.`,
        title_ar: `مهمة متأخرة: ${c.task}`,
        body_ar: c.self
          ? 'فات موعد مهمتك. حدّث الحالة أو اطلب وقت إضافي.'
          : `مهمة ${c.nameAr} فات موعدها وللحين ما تقفلت.`,
      };
    case 'task_at_risk':
      return {
        title: `At risk: ${c.task}`,
        body: `${c.pct}% of the time is gone and ${c.name} is at ${c.progress}%.`,
        title_ar: `مهمة ممكن تتأخر: ${c.task}`,
        body_ar: `راح ${c.pct}% من الوقت والإنجاز عند ${c.nameAr} ${c.progress}% بس.`,
      };
    case 'overload':
      return {
        // sent to the person themself; Muntej proposes the move to their manager
        title: 'Your week is very full',
        body: `${c.hours} h of open work against ${c.cap} h a week. Muntej is asking your manager to move something off your plate.`,
        title_ar: 'أسبوعك مليان',
        body_ar: `عندك ${c.hours} ساعة شغل مفتوح وطاقتك ${c.cap} ساعة بالأسبوع. منتج بيطلب من مديرك ينقل شي عنك.`,
      };
    case 'task_done_on_time':
      return {
        title: `Done on time: ${c.task}`,
        body: c.self ? 'You delivered on time. Nice work!' : `${c.name} delivered on time 👏`,
        title_ar: `خلصت في وقتها: ${c.task}`,
        body_ar: c.self ? 'سلّمت في الوقت، كفو!' : `${c.nameAr} سلّم المهمة في وقتها 👏`,
      };
    case 'task_done_early':
      return {
        title: `Done early: ${c.task}`,
        body: c.self ? `You finished ${c.early} h ahead of time. Great pace!` : `${c.name} finished ${c.early} h early 🚀`,
        title_ar: `خلصت قبل موعدها: ${c.task}`,
        body_ar: c.self ? `خلّصت قبل الموعد بـ ${c.early} ساعة، ما شاء الله!` : `${c.nameAr} خلّص قبل الموعد بـ ${c.early} ساعة 🚀`,
      };
    case 'objective_at_risk':
      return {
        title: `Objective at risk: ${c.task}`,
        body: `${c.progress}% done with ${c.pct}% of the time gone${c.late ? `, ${c.late} late task(s)` : ''}.`,
        title_ar: `هدف ممكن يتأخر: ${c.task}`,
        body_ar: `الإنجاز ${c.progress}% وراح ${c.pct}% من الوقت${c.late ? `، و${c.late} مهام متأخرة` : ''}.`,
      };
    case 'objective_missed':
      return {
        title: `Objective missed: ${c.task}`,
        body: 'Its end date passed before all its tasks were done.',
        title_ar: `هدف فات موعده: ${c.task}`,
        body_ar: 'خلص وقته وللحين فيه مهام ما خلصت.',
      };
    case 'no_reply':
      return {
        title: `Waiting for your update: ${c.task}`,
        body: "Muntej asked for an update and hasn't heard back. One line is enough.",
        title_ar: `ننتظر تحديثك: ${c.task}`,
        body_ar: 'منتج سأل عن التحديث وما وصله رد. سطر واحد يكفي.',
      };
    case 'escalated':
      return {
        title: `${c.name} hasn't replied: ${c.task}`,
        body: `No answer to Muntej's follow-up for ${c.hours} h. Maybe check in?`,
        title_ar: `${c.nameAr} ما رد: ${c.task}`,
        body_ar: `ما رد على متابعة منتج من ${c.hours} ساعة. يمكن تتطمن عليه؟`,
      };
    case 'five_star':
      return {
        title: `5 stars ⭐ ${c.task}`,
        body: c.self ? 'Your work got a 5-star review. Well done!' : `${c.name}'s work got a 5-star review.`,
        title_ar: `٥ نجوم ⭐ ${c.task}`,
        body_ar: c.self ? 'شغلك أخذ تقييم ٥ نجوم، كفو والله!' : `شغل ${c.nameAr} أخذ تقييم ٥ نجوم.`,
      };
  }
}

/** ISO week label like 2026-W42 (for once-a-week overload alerts). */
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── storing (delivery is shared: _shared/notify.ts) ──────────────────────────
async function insertNew(admin: SupabaseClient, rows: AlertRow[]): Promise<Inserted[]> {
  const out: Inserted[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await admin
      .from('alerts')
      .upsert(rows.slice(i, i + 200), { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id, profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key');
    if (error) throw error;
    out.push(...((data ?? []) as Inserted[]));
  }
  return out;
}

const PERSON_COLS = 'id, full_name, full_name_ar, role, manager_id, status, locale, phone, whatsapp_connected, weekly_capacity_hours';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as { test?: boolean };
  const admin = adminClient();
  const now = new Date();

  // ── sample alert for the caller ──
  if (body.test) {
    const { profileId } = await getCaller(req);
    const { data: me, error } = await admin.from('profiles').select(PERSON_COLS).eq('id', profileId).single();
    if (error || !me) throw new HttpError(404, 'No profile');
    const person = me as Person;
    const minute = now.toISOString().slice(0, 16);
    const t = texts('task_done_early', { task: 'Sample task', name: person.full_name, nameAr: person.full_name_ar ?? person.full_name, self: true, early: 26 });
    const rows = await insertNew(admin, [
      { profile_id: profileId, kind: 'task_done_early', subject_id: profileId, task_id: null, ...t, dedupe_key: `test:${profileId}:${minute}` },
    ]);
    const res = await deliverPending(admin, { only: rows.map((r) => r.id), ignoreQuiet: true });
    return json({ created: rows.length, ...res });
  }

  // ── cron run ──
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');

  const since = new Date(now.getTime() - DAY).toISOString();
  const [peopleRes, openRes, doneRes, starRes] = await Promise.all([
    admin.from('profiles').select(PERSON_COLS).neq('status', 'deleted'),
    admin
      .from('tasks')
      .select('id, title, owner_id, status, due_at, start_at, created_at, closed_at, progress, estimate_hours')
      .in('status', OPEN)
      .not('owner_id', 'is', null),
    admin
      .from('tasks')
      .select('id, title, owner_id, status, due_at, start_at, created_at, closed_at, progress, estimate_hours')
      .eq('status', 'done')
      .gte('closed_at', since)
      .not('owner_id', 'is', null)
      .not('due_at', 'is', null),
    admin
      .from('reviews')
      .select('id, rating, decided_at, task:tasks(id, title, owner_id)')
      .eq('rating', 5)
      .gte('decided_at', since),
  ]);
  for (const r of [peopleRes, openRes, doneRes, starRes]) if (r.error) throw r.error;

  const people = new Map<string, Person>();
  for (const p of (peopleRes.data ?? []) as Person[]) people.set(p.id, p);
  const active = (id: string | null | undefined) => {
    const p = id ? people.get(id) : undefined;
    return p && p.status === 'active' ? p : undefined;
  };
  const admins = [...people.values()].filter((p) => p.status === 'active' && (p.role === 'admin' || p.role === 'super_admin'));
  /** The person's manager, or every active admin when they have none (never the person themselves). */
  const managersOf = (personId: string): string[] => {
    const m = active(people.get(personId)?.manager_id);
    if (m) return [m.id];
    return admins.map((a) => a.id).filter((id) => id !== personId);
  };

  const rows: AlertRow[] = [];
  const add = (kind: Kind, recipients: string[], subject: Person, task: { id: string; title: string } | null, ctx: Omit<Ctx, 'name' | 'nameAr' | 'self' | 'task'>, keyBase: string) => {
    for (const rid of new Set(recipients)) {
      if (!active(rid)) continue;
      const t = texts(kind, {
        ...ctx,
        task: task?.title,
        name: subject.full_name,
        nameAr: subject.full_name_ar ?? subject.full_name,
        self: rid === subject.id,
      });
      rows.push({ profile_id: rid, kind, subject_id: subject.id, task_id: task?.id ?? null, ...t, dedupe_key: `${keyBase}:${rid}` });
    }
  };

  const nowMs = now.getTime();
  const openByOwner = new Map<string, Task[]>();
  for (const t of (openRes.data ?? []) as Task[]) {
    const owner = active(t.owner_id);
    if (!owner) continue;
    openByOwner.set(owner.id, [...(openByOwner.get(owner.id) ?? []), t]);
    if (!ACTIVE.includes(t.status) || !t.due_at) continue;
    const due = new Date(t.due_at).getTime();

    // late work is the autopilot's job (it chases the owner and only brings the manager a decision), so no
    // task_late alert here; an at-risk heads-up goes to the owner, not the manager
    if (due > nowMs) {
      const start = new Date(t.start_at ?? t.created_at).getTime();
      const total = due - start;
      if (total > 0) {
        const frac = (nowMs - start) / total;
        if (frac >= 0.65 && t.progress < 50) {
          add('task_at_risk', [owner.id], owner, t, { pct: Math.round(frac * 100), progress: t.progress }, `task_at_risk:${t.id}`);
        }
      }
    }
  }

  // overload — at most once per person per ISO week
  const week = isoWeek(now);
  for (const [ownerId, tasks] of openByOwner) {
    const owner = people.get(ownerId)!;
    const cap = Number(owner.weekly_capacity_hours ?? 0);
    if (cap <= 0) continue;
    const hours = tasks.reduce((s, t) => s + (t.estimate_hours != null ? Number(t.estimate_hours) : DEFAULT_TASK_HOURS), 0);
    // the manager gets a ready "move a task" decision from the autopilot instead of a bare overload alert;
    // the person hears it so they can say what to drop
    if (hours > cap * 1.1) {
      add('overload', [ownerId], owner, null, { hours: Math.round(hours), cap: Math.round(cap) }, `overload:${ownerId}:${week}`);
    }
  }

  // finished on time / early in the last 24h
  for (const t of (doneRes.data ?? []) as Task[]) {
    const owner = active(t.owner_id);
    if (!owner || !t.closed_at || !t.due_at) continue;
    const closed = new Date(t.closed_at).getTime();
    const due = new Date(t.due_at).getTime();
    if (closed > due) continue;
    const early = due - closed >= DAY;
    const kind: Kind = early ? 'task_done_early' : 'task_done_on_time';
    add(kind, [owner.id, ...managersOf(owner.id)], owner, t, { early: Math.round((due - closed) / HOUR) }, `task_done:${t.id}`);
  }

  // five-star reviews in the last 24h
  for (const r of starRes.data ?? []) {
    const task = r.task as unknown as { id: string; title: string; owner_id: string | null } | null;
    const owner = active(task?.owner_id);
    if (!task || !owner) continue;
    add('five_star', [owner.id, ...managersOf(owner.id)], owner, task, {}, `five_star:${r.id}`);
  }

  // objectives: at risk (weekly) / missed (once)
  const [objRes, linkedRes] = await Promise.all([
    admin.from('objectives').select('id, title, owner_id, start_at, due_at, status').in('status', ['active', 'missed']),
    admin.from('tasks').select('id, objective_id, status, due_at').not('objective_id', 'is', null).neq('status', 'cancelled'),
  ]);
  if (!objRes.error && !linkedRes.error) {
    const linkedBy = new Map<string, { status: string; due_at: string | null }[]>();
    for (const t of linkedRes.data ?? []) linkedBy.set(t.objective_id as string, [...(linkedBy.get(t.objective_id as string) ?? []), t]);
    for (const o of objRes.data ?? []) {
      const owner = active(o.owner_id as string | null);
      if (!owner) continue;
      const linked = linkedBy.get(o.id as string) ?? [];
      const done = linked.filter((t) => t.status === 'done').length;
      const late = linked.filter((t) => t.status !== 'done' && t.due_at && new Date(t.due_at).getTime() < nowMs).length;
      const start = new Date(o.start_at as string).getTime();
      const end = new Date(o.due_at as string).getTime();
      const progress = linked.length ? Math.round((done / linked.length) * 100) : 0;
      const timeUsed = Math.min(100, Math.max(0, Math.round(((nowMs - start) / Math.max(end - start, 1)) * 100)));
      const objTask = { id: null as unknown as string, title: o.title as string };
      if (o.status === 'missed' || (end < nowMs && (linked.length === 0 || done < linked.length))) {
        add('objective_missed', [owner.id, ...managersOf(owner.id)], owner, null, {}, `objective_missed:${o.id}`);
      } else if (late > 0 || (linked.length ? timeUsed - progress >= 25 : timeUsed >= 30)) {
        add('objective_at_risk', [owner.id, ...managersOf(owner.id)], owner, null, { progress, pct: timeUsed, late }, `objective_at_risk:${o.id}:${week}`);
      }
      // the objective title rides in the text, not as a task link
      for (const r of rows) if (r.dedupe_key.startsWith(`objective_`) && r.dedupe_key.includes(o.id as string)) {
        const t = texts(r.kind, { task: objTask.title, name: owner.full_name, nameAr: owner.full_name_ar ?? owner.full_name, self: r.profile_id === owner.id, progress, pct: timeUsed, late });
        Object.assign(r, t);
      }
    }
  } else console.error('objective check failed', objRes.error ?? linkedRes.error);

  // escalation: a follow-up got no answer (nothing moved on the task since) → remind the owner, then tell the manager
  const { data: sentFollowups } = await admin
    .from('followups')
    .select('id, task_id, recipient_id, sent_at, task:tasks(id, title, status, updated_at, due_at)')
    .eq('status', 'sent')
    .gte('sent_at', new Date(nowMs - 7 * DAY).toISOString())
    .lte('sent_at', new Date(nowMs - 2 * HOUR).toISOString())
    .limit(500);
  const recipients = [...new Set((sentFollowups ?? []).map((f) => f.recipient_id as string).filter(Boolean))];
  const { data: escRows } = recipients.length
    ? await admin.from('notification_prefs').select('profile_id, escalation').in('profile_id', recipients)
    : { data: [] as { profile_id: string; escalation: Record<string, unknown> | null }[] };
  const escOf = new Map((escRows ?? []).map((e) => [e.profile_id as string, (e.escalation ?? {}) as { no_reply_hours?: number; alert_manager?: boolean }]));
  for (const f of sentFollowups ?? []) {
    const task = f.task as unknown as { id: string; title: string; status: string; updated_at: string; due_at: string | null } | null;
    const owner = active(f.recipient_id as string | null);
    if (!task || !owner || !ACTIVE.includes(task.status)) continue;
    // past due: the autopilot's chase owns it (reminders, then one decision for the manager)
    if (task.due_at && new Date(task.due_at).getTime() < nowMs) continue;
    const sentAt = new Date(f.sent_at as string).getTime();
    if (new Date(task.updated_at).getTime() > sentAt + 5 * 60_000) continue; // something moved since: answered
    const esc = escOf.get(owner.id) ?? {};
    const h = Math.max(1, Number(esc.no_reply_hours ?? 24));
    const waited = (nowMs - sentAt) / HOUR;
    if (waited >= h) add('no_reply', [owner.id], owner, task, {}, `no_reply:${f.id}`);
    if (waited >= 2 * h && esc.alert_manager !== false) add('escalated', managersOf(owner.id), owner, task, { hours: Math.round(waited) }, `escalated:${f.id}`);
  }

  // respect each recipient's Alerts-screen switch for the matching rule (no prefs row = everything on)
  const prefs = await loadPrefs(admin, [...new Set(rows.map((r) => r.profile_id))]);
  const allowed = rows.filter((r) => {
    const rule = RULE_FOR[r.kind];
    return !rule || prefs.get(r.profile_id)?.rules?.[rule]?.enabled !== false;
  });

  const inserted = await insertNew(admin, allowed);
  const res = await deliverPending(admin);
  return json({ candidates: rows.length, allowed: allowed.length, created: inserted.length, ...res });
});
