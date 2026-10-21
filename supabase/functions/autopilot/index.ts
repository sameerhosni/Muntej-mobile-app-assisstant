// autopilot — Muntej runs the day by itself; people only make decisions. Called every 10 minutes by pg_cron
// (x-cron-secret), or by a signed-in admin/manager with {"dry": true} to see what it would do without doing it.
//
//   chase_late    a task past its due date: kind reminders to the owner (due day, next working morning, the one after;
//                 `chase_reminders`, default 3). Anything moving on the task counts as an answer and restarts the wait.
//                 Still nothing → ONE decision for the manager: move it to someone with free time, or give 2 more days.
//   help_blocked  a task marked blocked: ask the owner what's blocking it (once per blocked spell).
//   rebalance     someone booked over 110% this week: propose moving their least urgent task to the freest teammate.
//   find_owner    a task nobody owns after 30 min: propose the teammate with the most free time.
//   auto_approve  (always on) finished work waiting for review: remind the reviewer after 1 working day; approve it by itself at
//                 reviews.auto_approve_at (2 working days by default, 3 at most) and tell both sides.
// The switches live in autopilot_prefs (the manager's row governs their team; missing = on). Messages go out through
// the follow-up / alert pipeline, so quiet hours, prayer times and Fridays are respected; every action is logged.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { deliverPending } from '../_shared/notify.ts';

type Rule = 'chase_late' | 'help_blocked' | 'rebalance' | 'find_owner' | 'auto_approve';
type Person = {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  role: string;
  manager_id: string | null;
  status: string;
  locale: string;
  weekly_capacity_hours: number | null;
};
type Task = {
  id: string;
  title: string;
  owner_id: string | null;
  assigner_id: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  updated_at: string;
  created_at: string;
  progress: number;
  estimate_hours: number | null;
};
type Prefs = { rules: Partial<Record<Rule, boolean>>; chase_reminders: number; auto_approve_days: number };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RIYADH = 3 * HOUR;
const DEFAULT_TASK_HOURS = 4;
const ACTIVE = ['assigned', 'in_progress', 'blocked', 'returned'];
const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

// ─── Saudi working time (Sun–Thu, 09:00–17:00 Riyadh, UTC+3) ───────────────────

const local = (t: number) => new Date(t + RIYADH);
const isWorkDay = (t: number) => {
  const d = local(t).getUTCDay();
  return d !== 5 && d !== 6;
};
/** 09:00 Riyadh on the next working day after t */
function nextWorkingMorning(t: number): number {
  const l = local(t);
  l.setUTCHours(9, 0, 0, 0);
  let m = l.getTime() - RIYADH;
  do m += DAY;
  while (!isWorkDay(m));
  return m;
}
/** whole working days from t to now (each working morning passed counts one) */
function workingDaysSince(t: number, now: number): number {
  let n = 0;
  for (let m = nextWorkingMorning(t); m <= now && n < 30; m = nextWorkingMorning(m)) n++;
  return n;
}
/** 17:00 Riyadh, `days` working days after now */
function workingDaysAhead(now: number, days: number): number {
  let m = now;
  for (let i = 0; i < days; i++) m = nextWorkingMorning(m);
  const l = local(m);
  l.setUTCHours(17, 0, 0, 0);
  return l.getTime() - RIYADH;
}
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - y0.getTime()) / DAY + 1) / 7)}`;
}
const whenText = (iso: string | number, ar: boolean) =>
  new Date(iso).toLocaleDateString(ar ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'short' });

// ─── messages ─────────────────────────────────────────────────────────────────

function chaseText(n: number, title: string, due: string, managerFirst: string, managerFirstAr: string) {
  const en = [
    `"${title}" was due ${whenText(due, false)}. Is it done? If you need more time, tell me the new date and I'll update it.`,
    `Checking again on "${title}". What's holding it up? Reply with a date or what you need, and I'll sort it.`,
    `Last reminder on "${title}". If I don't hear back, I'll ask ${managerFirst || 'your manager'} to decide what to do with it.`,
  ];
  const ar = [
    `«${title}» كان موعدها ${whenText(due, true)}. خلصت؟ لو تحتاج وقت زيادة قل لي الموعد الجديد وأنا أعدّله.`,
    `أرجع أسأل عن «${title}». وش موقفها؟ رد بموعد أو باللي تحتاجه وأنا أتصرف.`,
    `آخر تذكير عن «${title}». لو ما رديت، بطلب من ${managerFirstAr || 'مديرك'} يقرر وش نسوي فيها.`,
  ];
  const i = Math.min(n, 2);
  return { message: en[i], message_ar: ar[i] };
}

// ─── run ──────────────────────────────────────────────────────────────────────

type Action = { kind: string; key: string; detail: string };

async function run(admin: SupabaseClient, dry: boolean) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const actions: Action[] = [];

  const [peopleRes, tasksRes, prefsRes, marksRes, decRes, revRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, full_name_ar, role, manager_id, status, locale, weekly_capacity_hours').neq('status', 'deleted'),
    admin
      .from('tasks')
      .select('id, title, owner_id, assigner_id, status, priority, due_at, updated_at, created_at, progress, estimate_hours')
      .in('status', [...ACTIVE, 'draft', 'submitted']),
    admin.from('autopilot_prefs').select('profile_id, rules, chase_reminders, auto_approve_days'),
    admin.from('autopilot_marks').select('key, created_at').gte('created_at', new Date(now - 60 * DAY).toISOString()),
    admin.from('decisions').select('task_id').eq('status', 'pending'),
    admin.from('reviews').select('id, task_id, reviewer_id, created_at, auto_approve_at').is('decision', null),
  ]);
  for (const r of [peopleRes, tasksRes, prefsRes, marksRes, decRes, revRes]) if (r.error) throw r.error;

  const people = new Map(((peopleRes.data ?? []) as Person[]).map((p) => [p.id, p]));
  const active = (id: string | null | undefined) => {
    const p = id ? people.get(id) : undefined;
    return p && p.status === 'active' ? p : undefined;
  };
  const admins = [...people.values()].filter((p) => p.status === 'active' && (p.role === 'admin' || p.role === 'super_admin'));
  const managerOf = (personId: string, fallback?: string | null): Person | undefined =>
    active(people.get(personId)?.manager_id) ?? active(fallback && fallback !== personId ? fallback : null) ?? admins.find((a) => a.id !== personId);
  const first = (p: Person | undefined, ar = false) => ((ar && p?.full_name_ar) || p?.full_name || '').split(' ')[0];

  const prefsOf = new Map(
    ((prefsRes.data ?? []) as { profile_id: string; rules: Prefs['rules']; chase_reminders: number; auto_approve_days: number }[]).map((r) => [
      r.profile_id,
      { rules: r.rules ?? {}, chase_reminders: r.chase_reminders ?? 3, auto_approve_days: r.auto_approve_days ?? 2 },
    ]),
  );
  const prefs = (managerId: string | undefined): Prefs => (managerId && prefsOf.get(managerId)) || { rules: {}, chase_reminders: 3, auto_approve_days: 2 };
  const on = (managerId: string | undefined, rule: Rule) => prefs(managerId).rules[rule] !== false;

  const marks = new Map<string, number>();
  for (const m of (marksRes.data ?? []) as { key: string; created_at: string }[]) marks.set(m.key, Date.parse(m.created_at));
  const decided = new Set(((decRes.data ?? []) as { task_id: string | null }[]).map((d) => d.task_id).filter(Boolean));
  const tasks = (tasksRes.data ?? []) as Task[];

  // ── helpers that write (or only record, when dry) ──
  const mark = async (key: string, taskId: string | null, profileId: string | null) => {
    marks.set(key, now);
    if (!dry) await admin.from('autopilot_marks').insert({ key, task_id: taskId, profile_id: profileId });
  };
  const followup = async (taskId: string, to: string, text: { message: string; message_ar: string }) => {
    if (!dry) await admin.from('followups').insert({ task_id: taskId, recipient_id: to, scheduled_at: nowIso, channel: 'push', status: 'scheduled', ...text });
  };
  const log = async (row: { subject: string | null; task: string | null; action: string; en: string; ar: string; why: string }) => {
    if (!dry)
      await admin.from('activity_log').insert({
        actor_type: 'muntej',
        subject_id: row.subject,
        task_id: row.task,
        action: row.action,
        summary: row.en,
        summary_ar: row.ar,
        reason: row.why,
        undoable: false,
      });
  };
  const decision = async (d: {
    task: Task;
    manager: Person;
    requestedBy: string | null;
    type: 'delay_risk' | 'extension_request' | 'reassignment';
    title: string;
    title_ar: string;
    details: Record<string, unknown>;
    rec: string;
    rec_ar: string;
    why: string;
  }) => {
    decided.add(d.task.id);
    if (dry) return;
    await admin.from('decisions').insert({
      task_id: d.task.id,
      manager_id: d.manager.id,
      requested_by: d.requestedBy,
      type: d.type,
      title: d.title,
      title_ar: d.title_ar,
      details: d.details,
      recommendation: d.rec,
      recommendation_ar: d.rec_ar,
      recommendation_reason: d.why,
    });
  };

  // load this week per person (open work due by the end of the week, estimate or 4 h)
  const weekEnd = workingDaysAhead(now, 5);
  const hoursOf = (personId: string) =>
    tasks
      .filter((t) => t.owner_id === personId && ACTIVE.includes(t.status) && (!t.due_at || Date.parse(t.due_at) <= weekEnd))
      .reduce((s, t) => s + (t.estimate_hours != null ? Number(t.estimate_hours) : DEFAULT_TASK_HOURS), 0);
  const capOf = (p: Person) => (p.weekly_capacity_hours && p.weekly_capacity_hours > 0 ? Number(p.weekly_capacity_hours) : 40);
  /** the teammate (same manager) with the most free hours that can take `hours` more */
  const freest = (manager: Person, exclude: string, hours: number) => {
    const team = [...people.values()].filter((p) => p.status === 'active' && p.manager_id === manager.id && p.id !== exclude);
    let best: { p: Person; free: number } | null = null;
    for (const p of team) {
      const free = capOf(p) - hoursOf(p.id);
      if (free - hours >= capOf(p) * 0.1 && (!best || free > best.free)) best = { p, free };
    }
    return best;
  };

  // open steps of open tasks (next-step hints, late steps)
  const { data: stepRows } = await admin
    .from('subtasks')
    .select('id, task_id, title, owner_id, due_at, position')
    .eq('done', false)
    .in('task_id', tasks.map((t) => t.id).slice(0, 500));
  const openSteps = (stepRows ?? []) as { id: string; task_id: string; title: string; owner_id: string | null; due_at: string | null; position: number }[];

  // ── 1. chase late work ──
  for (const t of tasks) {
    const owner = active(t.owner_id);
    if (!owner || !ACTIVE.includes(t.status) || !t.due_at) continue;
    const due = Date.parse(t.due_at);
    if (due > now) continue;
    const manager = managerOf(owner.id, t.assigner_id);
    if (!on(manager?.id, 'chase_late')) continue;
    const limit = prefs(manager?.id).chase_reminders;
    const base = `chase:${t.id}:${t.due_at}`;
    const sent = [...Array(limit).keys()].map((i) => marks.get(`${base}:${i + 1}`)).filter((x): x is number => x !== undefined);
    const last = sent.length ? Math.max(...sent) : null;
    // the owner answered (anything moved on the task since the last reminder): wait until the next working morning
    const moved = Date.parse(t.updated_at);
    const since = last !== null ? Math.max(last, moved > last + 5 * MIN ? moved : last) : null;
    if (since !== null && now < nextWorkingMorning(since)) continue;
    if (sent.length < limit) {
      const n = sent.length + 1;
      // first reminder · the ones in between · the last one (says the manager decides next)
      const tone = n === limit && limit > 1 ? 2 : n === 1 ? 0 : 1;
      const txt = chaseText(tone, t.title, t.due_at, first(manager), first(manager, true));
      // the next open step makes the ask concrete
      const next = openSteps.filter((s) => s.task_id === t.id).sort((a, b) => a.position - b.position)[0];
      if (next) {
        txt.message += ` Next step: ${next.title}.`;
        txt.message_ar += ` الخطوة الجاية: ${next.title}.`;
      }
      await followup(t.id, owner.id, txt);
      await mark(`${base}:${n}`, t.id, owner.id);
      actions.push({ kind: 'chase', key: `${base}:${n}`, detail: `${first(owner)} · ${t.title} (${n}/${limit})` });
      continue;
    }
    // all reminders sent, no answer → one decision for the manager
    const dkey = `chase_decision:${t.id}:${t.due_at}`;
    if (marks.has(dkey) || decided.has(t.id) || !manager) continue;
    const hours = t.estimate_hours != null ? Number(t.estimate_hours) : DEFAULT_TASK_HOURS;
    const helper = freest(manager, owner.id, hours);
    const overdueDays = Math.max(1, workingDaysSince(due, now));
    if (helper) {
      await decision({
        task: t,
        manager,
        requestedBy: owner.id,
        type: 'delay_risk',
        title: `"${t.title}" is ${overdueDays} working day${overdueDays === 1 ? '' : 's'} late and ${first(owner)} isn't answering`,
        title_ar: `«${t.title}» متأخرة ${overdueDays} يوم عمل و${first(owner, true)} ما يرد`,
        details: { overdue: overdueDays, progress: t.progress, suggested_owner_id: helper.p.id, free_hours: Math.round(helper.free) },
        rec: `Move it to ${first(helper.p)}: ${Math.round(helper.free)} h free this week`,
        rec_ar: `انقلها لـ${first(helper.p, true)}: عنده ${Math.round(helper.free)} ساعة فاضية هالأسبوع`,
        why: `${limit} reminders since ${whenText(due, false)} with no reply`,
      });
    } else {
      const newDue = workingDaysAhead(now, 2);
      await decision({
        task: t,
        manager,
        requestedBy: owner.id,
        type: 'extension_request',
        title: `"${t.title}" is ${overdueDays} working day${overdueDays === 1 ? '' : 's'} late and ${first(owner)} isn't answering`,
        title_ar: `«${t.title}» متأخرة ${overdueDays} يوم عمل و${first(owner, true)} ما يرد`,
        details: { requested_due_offset_days: 2, new_due_at: new Date(newDue).toISOString(), overdue: overdueDays },
        rec: `Give 2 more working days (until ${whenText(newDue, false)}): nobody on the team has free time to take it`,
        rec_ar: `عطه يومين عمل زيادة (لين ${whenText(newDue, true)}): ما فيه أحد بالفريق عنده وقت ياخذها`,
        why: `${limit} reminders since ${whenText(due, false)} with no reply`,
      });
    }
    await mark(dkey, t.id, owner.id);
    await log({
      subject: owner.id,
      task: t.id,
      action: 'escalated',
      en: `Asked ${first(manager)} to decide on "${t.title}" after ${limit} reminders`,
      ar: `طلب من ${first(manager, true)} يقرر في «${t.title}» بعد ${limit} تذكيرات`,
      why: 'No reply to the reminders',
    });
    actions.push({ kind: 'late_decision', key: dkey, detail: `${first(manager)} ← ${t.title}` });
  }

  // ── 2. help blocked work ──
  for (const t of tasks) {
    const owner = active(t.owner_id);
    if (!owner || t.status !== 'blocked') continue;
    if (now - Date.parse(t.updated_at) < 30 * MIN) continue; // give them a moment to explain by themselves
    const manager = managerOf(owner.id, t.assigner_id);
    if (!on(manager?.id, 'help_blocked')) continue;
    const key = `blocked:${t.id}:${t.updated_at}`;
    if (marks.has(key)) continue;
    await followup(t.id, owner.id, {
      message: `"${t.title}" is marked blocked. What's in the way? Tell me who or what you're waiting for, and I'll chase it.`,
      message_ar: `«${t.title}» واقفة. وش اللي موقفها؟ قل لي مين أو وش تنتظر وأنا ألاحقه.`,
    });
    await mark(key, t.id, owner.id);
    actions.push({ kind: 'blocked', key, detail: `${first(owner)} · ${t.title}` });
  }

  // ── 2b. late steps: a kind reminder to the step's person, once a working day, at most 3 times ──
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  for (const s of openSteps) {
    if (!s.owner_id || !s.due_at || Date.parse(s.due_at) > now) continue;
    const t = taskById.get(s.task_id);
    const who = active(s.owner_id);
    if (!t || !who || !ACTIVE.includes(t.status)) continue;
    const manager = managerOf(who.id, t.assigner_id);
    if (!on(manager?.id, 'chase_late')) continue;
    const sent = [1, 2, 3].map((i) => marks.get(`step:${s.id}:${i}`)).filter((x): x is number => x !== undefined);
    if (sent.length >= 3) continue;
    if (sent.length && now < nextWorkingMorning(Math.max(...sent))) continue;
    await followup(t.id, who.id, {
      message: `The step "${s.title}" (for "${t.title}") was due ${whenText(s.due_at, false)}. Done? Tick it in Muntej, or tell me what you need.`,
      message_ar: `الخطوة «${s.title}» (في «${t.title}») كان موعدها ${whenText(s.due_at, true)}. خلصت؟ علّمها في منتج، أو قل لي وش تحتاج.`,
    });
    await mark(`step:${s.id}:${sent.length + 1}`, t.id, who.id);
    actions.push({ kind: 'step_chase', key: `step:${s.id}:${sent.length + 1}`, detail: `${first(who)} · ${s.title}` });
  }

  // ── 3. rebalance overloaded people ──
  const week = isoWeek(new Date(now));
  for (const p of people.values()) {
    if (p.status !== 'active') continue;
    const manager = managerOf(p.id);
    if (!manager || manager.id === p.id || !on(manager.id, 'rebalance')) continue;
    const load = hoursOf(p.id);
    if (load <= capOf(p) * 1.1) continue;
    const key = `overload:${p.id}:${week}`;
    if (marks.has(key)) continue;
    // their least urgent, latest-due task that isn't half done
    const movable = tasks
      .filter((t) => t.owner_id === p.id && (t.status === 'assigned' || t.status === 'in_progress') && t.progress < 50 && !decided.has(t.id))
      .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || (Date.parse(b.due_at ?? '9999') - Date.parse(a.due_at ?? '9999')))[0];
    if (!movable) continue;
    const hours = movable.estimate_hours != null ? Number(movable.estimate_hours) : DEFAULT_TASK_HOURS;
    const helper = freest(manager, p.id, hours);
    if (!helper) continue;
    await decision({
      task: movable,
      manager,
      requestedBy: p.id,
      type: 'reassignment',
      title: `${first(p)} is booked ${Math.round((load / capOf(p)) * 100)}% this week: move "${movable.title}"?`,
      title_ar: `${first(p, true)} محجوز ${Math.round((load / capOf(p)) * 100)}٪ هالأسبوع: ننقل «${movable.title}»؟`,
      details: { load_hours: Math.round(load), suggested_owner_id: helper.p.id, free_hours: Math.round(helper.free) },
      rec: `Move it to ${first(helper.p)}: ${Math.round(helper.free)} h free this week`,
      rec_ar: `انقلها لـ${first(helper.p, true)}: عنده ${Math.round(helper.free)} ساعة فاضية هالأسبوع`,
      why: `${Math.round(load)} h of work against ${Math.round(capOf(p))} h a week`,
    });
    await mark(key, movable.id, p.id);
    actions.push({ kind: 'rebalance', key, detail: `${first(p)} → ${first(helper.p)} · ${movable.title}` });
  }

  // ── 4. find an owner for unowned tasks ──
  for (const t of tasks) {
    if (t.owner_id || t.status !== 'draft' || decided.has(t.id)) continue;
    if (now - Date.parse(t.created_at) < 30 * MIN) continue;
    const manager = active(t.assigner_id);
    if (!manager || !on(manager.id, 'find_owner')) continue;
    const key = `owner:${t.id}`;
    if (marks.has(key)) continue;
    const helper = freest(manager, manager.id, t.estimate_hours != null ? Number(t.estimate_hours) : DEFAULT_TASK_HOURS);
    if (!helper) continue;
    await decision({
      task: t,
      manager,
      requestedBy: null,
      type: 'reassignment',
      title: `"${t.title}" has no owner yet`,
      title_ar: `«${t.title}» للحين بدون مسؤول`,
      details: { suggested_owner_id: helper.p.id, free_hours: Math.round(helper.free) },
      rec: `Give it to ${first(helper.p)}: ${Math.round(helper.free)} h free this week`,
      rec_ar: `عطها ${first(helper.p, true)}: عنده ${Math.round(helper.free)} ساعة فاضية هالأسبوع`,
      why: 'Nobody owns it, so nobody is working on it',
    });
    await mark(key, t.id, null);
    actions.push({ kind: 'owner', key, detail: `${first(helper.p)} ← ${t.title}` });
  }

  // ── 5. reviews: remind after 1 working day, approve by itself after N ──
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const alerts: Record<string, unknown>[] = [];
  for (const r of (revRes.data ?? []) as { id: string; task_id: string; reviewer_id: string | null; created_at: string; auto_approve_at: string | null }[]) {
    const t = byId.get(r.task_id);
    if (!t || t.status !== 'submitted') continue;
    const owner = active(t.owner_id);
    const reviewer = active(r.reviewer_id) ?? (owner ? managerOf(owner.id, t.assigner_id) : undefined);
    // always on: finished work never waits more than 2 working days by default, 3 at most (reviews.auto_approve_at)
    if (!owner || !reviewer) continue;
    const days = workingDaysSince(Date.parse(r.created_at), now);
    const limit = Math.min(3, Math.max(1, prefs(reviewer.id).auto_approve_days));
    const deadline = r.auto_approve_at ? Date.parse(r.auto_approve_at) : workingDaysAhead(Date.parse(r.created_at), limit);
    if (now >= deadline) {
      const key = `auto_approve:${r.id}`;
      if (marks.has(key)) continue;
      if (!dry) {
        await admin.from('tasks').update({ status: 'done', closed_at: nowIso, progress: 100 }).eq('id', t.id).eq('status', 'submitted');
        await admin
          .from('reviews')
          .update({ decision: 'approved', decided_at: nowIso, reviewer_id: reviewer.id, note: `Approved by Muntej: no review in ${limit} working days` })
          .eq('id', r.id)
          .is('decision', null);
      }
      await log({
        subject: owner.id,
        task: t.id,
        action: 'task_closed',
        en: `Approved "${t.title}" by itself (no review in ${limit} working days)`,
        ar: `اعتمد «${t.title}» بنفسه (ما انراجعت خلال ${limit} أيام عمل)`,
        why: `Waiting for ${first(reviewer)} since ${whenText(r.created_at, false)}`,
      });
      for (const to of [owner, reviewer]) {
        alerts.push({
          profile_id: to.id,
          kind: 'changed_for_you',
          subject_id: owner.id,
          task_id: t.id,
          title: to.id === owner.id ? `Muntej approved "${t.title}" ✓` : `Muntej approved "${t.title}" for you`,
          body: to.id === owner.id ? 'Nice work. It counts as done.' : `${first(owner)}'s work waited ${limit} working days for a review.`,
          title_ar: to.id === owner.id ? `منتج اعتمد «${t.title}» ✓` : `منتج اعتمد «${t.title}» عنك`,
          body_ar: to.id === owner.id ? 'شغل حلو. انحسبت خالصة.' : `شغل ${first(owner, true)} انتظر المراجعة ${limit} أيام عمل.`,
          dedupe_key: `auto_approve:${r.id}:${to.id}`,
        });
      }
      await mark(key, t.id, owner.id);
      actions.push({ kind: 'auto_approve', key, detail: `${first(owner)} · ${t.title}` });
    } else if (days >= 1) {
      const key = `review_remind:${r.id}`;
      if (marks.has(key)) continue;
      const on_ = `${whenText(deadline, false)} 9:00`;
      const onAr = `${whenText(deadline, true)} الساعة ٩ الصبح`;
      alerts.push({
        profile_id: reviewer.id,
        kind: 'new_submission',
        subject_id: owner.id,
        task_id: t.id,
        title: `"${t.title}" is still waiting for your review`,
        body: `${first(owner)} finished it. If you don't review it, Muntej approves it by itself on ${on_}.`,
        title_ar: `«${t.title}» للحين تنتظر مراجعتك`,
        body_ar: `${first(owner, true)} خلّصها. لو ما راجعتها، منتج يعتمدها بنفسه ${onAr}.`,
        dedupe_key: key,
      });
      await mark(key, t.id, reviewer.id);
      actions.push({ kind: 'review_remind', key, detail: `${first(reviewer)} · ${t.title}` });
    }
  }
  // ── 6. new features nobody showed them yet: one push, 3 days after launch, grouped per person ──
  const { data: feats } = await admin.from('features').select('key, audience, released_at, title, title_ar, benefit, benefit_ar');
  const launchable = (feats ?? []).filter((f) => {
    const age = now - Date.parse(f.released_at as string);
    return age >= 3 * DAY && age <= 30 * DAY;
  });
  if (launchable.length) {
    const { data: fev } = await admin.from('feature_events').select('profile_id, feature_key').in('feature_key', launchable.map((f) => f.key));
    const seenBy = new Set((fev ?? []).map((e) => `${e.feature_key}:${e.profile_id}`));
    const forRole = (aud: string, p: Person) =>
      aud === 'all' || (aud === 'admin' && (p.role === 'admin' || p.role === 'super_admin')) || (aud === 'manager' && p.role !== 'employee') || (aud === 'employee' && p.role === 'employee');
    for (const p of people.values()) {
      if (p.status !== 'active') continue;
      const missed = launchable.filter((f) => forRole(f.audience as string, p) && !seenBy.has(`${f.key}:${p.id}`) && !marks.has(`launch_push:${f.key}:${p.id}`));
      if (!missed.length) continue;
      const one = missed.length === 1 ? missed[0] : null;
      alerts.push({
        profile_id: p.id,
        kind: 'new_feature',
        subject_id: p.id,
        task_id: null,
        title: one ? `New in Muntej: ${one.title}` : `${missed.length} new things Muntej can do for you`,
        body: one ? (one.benefit as string) : missed.map((f) => f.title).join(' · '),
        title_ar: one ? `جديد في منتج: ${one.title_ar}` : `${missed.length} أشياء جديدة يسويها منتج لك`,
        body_ar: one ? (one.benefit_ar as string) : missed.map((f) => f.title_ar).join(' · '),
        dedupe_key: `launch_push:${p.id}:${missed.map((f) => f.key).join(',')}`,
      });
      for (const f of missed) await mark(`launch_push:${f.key}:${p.id}`, null, p.id);
      actions.push({ kind: 'launch_push', key: `launch_push:${p.id}`, detail: `${first(p)} · ${missed.map((f) => f.key).join(', ')}` });
    }
  }

  if (alerts.length && !dry) {
    const { error } = await admin.from('alerts').upsert(alerts, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    if (error) console.error('alerts insert failed', error.message);
  }

  const delivered = dry ? null : await deliverPending(admin);
  return { dry, actions, delivered };
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as { dry?: boolean };
  const admin = adminClient();

  // a person checking what the autopilot would do right now (nothing is sent or changed)
  if (body.dry) {
    const { profileId } = await getCaller(req);
    const { data: me } = await admin.from('profiles').select('role').eq('id', profileId).single();
    if (!me || me.role === 'employee') throw new HttpError(403, 'Managers only');
    return json(await run(admin, true));
  }

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');
  return json(await run(admin, false));
});
