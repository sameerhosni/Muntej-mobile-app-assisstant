// team-alerts — risk & achievement alerts for people and their managers.
// 1) Called every 15 minutes by pg_cron (header x-cron-secret = CRON_SECRET). Detects:
//    - task_late          active task whose due_at passed in the last 24h → owner's manager (or admins) + owner
//    - task_at_risk       ≥65% of the task's time gone and progress < 50 → owner's manager (or admins)
//    - overload           open work > 110% of weekly capacity → person's manager (or admins), once per ISO week
//    - task_done_on_time  closed in the last 24h on/before due_at → owner + owner's manager
//    - task_done_early    same, but ≥24h before due_at
//    - five_star          review rated 5 decided in the last 24h → owner + owner's manager
//    Every alert row has a dedupe_key; rows are inserted with ON CONFLICT DO NOTHING and only the newly inserted ones
//    are delivered (push, WhatsApp) and written to activity_log.
// 2) Called by a signed-in user with { test: true }: creates one sample achievement alert for that user (deduped per
//    minute) and delivers it, so the flow can be tried from the phone.
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, sendPush } from '../_shared/push.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Kind = 'task_late' | 'task_at_risk' | 'overload' | 'task_done_on_time' | 'task_done_early' | 'five_star';

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

type Prefs = { channels?: Record<string, boolean>; rules?: Record<string, { enabled?: boolean; channels?: string[] }> };

/** Statuses where the owner still has the ball (submitted = waiting on the reviewer, so not "late" on the owner). */
const ACTIVE = ['assigned', 'in_progress', 'blocked', 'returned'];
/** Statuses that still count as open work for capacity. */
const OPEN = ['assigned', 'in_progress', 'blocked', 'returned', 'submitted'];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DEFAULT_TASK_HOURS = 4;

/** Which Alerts-screen rule (notification_prefs.rules) switches each kind. Missing prefs = on. */
const RULE_FOR: Record<Kind, string> = {
  task_late: 'task_overdue',
  task_at_risk: 'task_at_risk',
  overload: 'task_at_risk',
  task_done_on_time: 'kudos',
  task_done_early: 'kudos',
  five_star: 'kudos',
};

// ─── texts (EN + Saudi Arabic) ────────────────────────────────────────────────
type Ctx = { task?: string; name: string; nameAr: string; self: boolean; pct?: number; progress?: number; hours?: number; cap?: number; early?: number };

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
        title: `${c.name} is overloaded`,
        body: `${c.hours} h of open work against ${c.cap} h a week. Consider moving something.`,
        title_ar: `${c.nameAr} عليه ضغط شغل`,
        body_ar: `عنده ${c.hours} ساعة شغل مفتوح وطاقته ${c.cap} ساعة بالأسبوع. يمكن تنقل شي منها.`,
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

// ─── delivery ─────────────────────────────────────────────────────────────────
async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
  if (!token || !phoneId) return false;
  // Note: Meta only delivers free-form text inside the 24h customer-service window; outside it a template is needed.
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace(/\D/g, ''), type: 'text', text: { body: text } }),
  });
  if (!res.ok) console.error('WhatsApp send error', res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

async function deliver(admin: SupabaseClient, rows: Inserted[], people: Map<string, Person>, prefs: Map<string, Prefs>) {
  const waConfigured = !!Deno.env.get('WHATSAPP_TOKEN') && !!Deno.env.get('WHATSAPP_PHONE_ID');
  let pushed = 0;
  let whatsapped = 0;
  for (const a of rows) {
    const r = people.get(a.profile_id);
    const ar = r?.locale === 'ar';
    const title = ar ? a.title_ar : a.title;
    const body = ar ? a.body_ar : a.body;
    const p = prefs.get(a.profile_id);
    const rule = p?.rules?.[RULE_FOR[a.kind]];

    // push (default on)
    let sentPush = false;
    if (p?.channels?.push !== false) {
      sentPush = (await sendPush([a.profile_id], { title, body, data: { alertId: a.id, kind: a.kind, ...(a.task_id && { taskId: a.task_id }) } }, admin)) > 0;
      if (sentPush) pushed++;
    }

    // WhatsApp: the person must have it connected and not have switched it off (globally or for this rule).
    let waStatus: string;
    let sentWa = false;
    const waWanted = p?.channels?.whatsapp !== false && (!rule?.channels || rule.channels.includes('whatsapp'));
    if (!waConfigured) waStatus = 'not_configured';
    else if (!r?.whatsapp_connected || !r.phone) waStatus = 'not_connected';
    else if (!waWanted) waStatus = 'off';
    else {
      sentWa = await sendWhatsApp(r.phone, `*${title}*\n${body}`);
      waStatus = sentWa ? 'sent' : 'error';
      if (sentWa) whatsapped++;
    }
    // TODO(telegram): deliver via a Telegram bot once one is set up (profiles.telegram_connected / telegram_handle).

    await admin.from('alerts').update({ sent_push: sentPush, sent_whatsapp: sentWa, whatsapp_status: waStatus }).eq('id', a.id);
    await admin.from('activity_log').insert({
      actor_type: 'muntej',
      subject_id: a.subject_id ?? a.profile_id,
      task_id: a.task_id,
      action: 'alert_sent',
      summary: `Alert to ${r?.full_name ?? 'someone'}: ${a.title}`,
      summary_ar: `تنبيه لـ ${r?.full_name_ar ?? r?.full_name ?? 'شخص'}: ${a.title_ar}`,
      reason: `${a.kind} (push: ${sentPush ? 'sent' : 'not sent'}, WhatsApp: ${waStatus})`,
    });
  }
  return { pushed, whatsapped };
}

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

async function loadPrefs(admin: SupabaseClient, ids: string[]): Promise<Map<string, Prefs>> {
  const map = new Map<string, Prefs>();
  if (!ids.length) return map;
  const { data, error } = await admin.from('notification_prefs').select('profile_id, channels, rules').in('profile_id', ids);
  if (error) throw error;
  for (const row of data ?? []) map.set(row.profile_id as string, { channels: row.channels ?? undefined, rules: row.rules ?? undefined });
  return map;
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
    const prefs = await loadPrefs(admin, [profileId]);
    const res = await deliver(admin, rows, new Map([[profileId, person]]), prefs);
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

    if (due <= nowMs && due > nowMs - DAY) {
      add('task_late', [...managersOf(owner.id), owner.id], owner, t, {}, `task_late:${t.id}`);
    } else if (due > nowMs) {
      const start = new Date(t.start_at ?? t.created_at).getTime();
      const total = due - start;
      if (total > 0) {
        const frac = (nowMs - start) / total;
        if (frac >= 0.65 && t.progress < 50) {
          add('task_at_risk', managersOf(owner.id), owner, t, { pct: Math.round(frac * 100), progress: t.progress }, `task_at_risk:${t.id}`);
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
    if (hours > cap * 1.1) {
      add('overload', managersOf(ownerId), owner, null, { hours: Math.round(hours), cap: Math.round(cap) }, `overload:${ownerId}:${week}`);
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

  // respect each recipient's Alerts-screen switch for the matching rule (no prefs row = everything on)
  const prefs = await loadPrefs(admin, [...new Set(rows.map((r) => r.profile_id))]);
  const allowed = rows.filter((r) => prefs.get(r.profile_id)?.rules?.[RULE_FOR[r.kind]]?.enabled !== false);

  const inserted = await insertNew(admin, allowed);
  const res = await deliver(admin, inserted, people, prefs);
  return json({ candidates: rows.length, allowed: allowed.length, created: inserted.length, ...res });
});
