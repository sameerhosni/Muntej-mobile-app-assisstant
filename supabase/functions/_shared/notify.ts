// The one place alerts are delivered. Every alert is a row in `alerts` (written by team-alerts, muntej-chat or DB
// triggers); deliverPending() sends each new row once — push (and WhatsApp when connected) — respecting the person's
// Alerts settings: the rule switch for that kind, the push / WhatsApp channel switches, and quiet hours
// (after-hours, Friday, prayer times in Riyadh). An alert that lands in quiet hours waits (deliver_after) and goes out
// when they end. Called every minute by send-followups, right after changes by muntej-chat, and by team-alerts.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { sendPush } from './push.ts';
import { ACTION_TEMPLATE, inWindow, waButtons, waTemplate } from './wa.ts';
import { needsYouCards } from './wa-actions.ts';
import { phCapture } from './posthog.ts';

export type AlertKind =
  | 'task_late'
  | 'task_at_risk'
  | 'overload'
  | 'task_done_on_time'
  | 'task_done_early'
  | 'five_star'
  | 'objective_achieved'
  | 'objective_at_risk'
  | 'objective_missed'
  | 'changed_for_you'
  | 'task_assigned'
  | 'new_submission'
  | 'decision_waiting'
  | 'no_reply'
  | 'escalated'
  | 'tool_sync'
  | 'new_feature'
  | 'request_answered'
  // the value ladder: one gentle nudge when someone is stuck before a step (an everyday push, within the budget)
  | 'ladder_nudge'
  // the Muntej team replied in the support chat (Intercom webhook): always pushed
  | 'support_reply'
  // news about an idea the person sent (status or the team's reply)
  | 'idea_update';

/** Which Alerts-screen rule (notification_prefs.rules) switches each kind; null = always on (things done to you). */
export const RULE_FOR: Record<AlertKind, string | null> = {
  task_late: 'task_overdue',
  no_reply: 'task_overdue',
  escalated: 'task_overdue',
  task_at_risk: 'task_at_risk',
  overload: 'task_at_risk',
  objective_at_risk: 'task_at_risk',
  objective_missed: 'task_at_risk',
  task_done_on_time: 'kudos',
  task_done_early: 'kudos',
  five_star: 'kudos',
  objective_achieved: 'kudos',
  new_submission: 'new_submission',
  decision_waiting: 'decision_waiting',
  changed_for_you: null,
  task_assigned: null,
  // what moved between Muntej and a connected tool (the person turned the sync on themselves)
  tool_sync: null,
  // "New in Muntej" — once per feature per person, only if they never saw it in the app
  new_feature: null,
  // your manager answered what you asked (more time, which first, help)
  request_answered: null,
  ladder_nudge: null,
  support_reply: null,
  idea_update: null,
};

// Notification budget (BRD v1.2 FR-ZLG-02): one morning brief + exceptions. Exceptions always push; a few everyday
// updates may push (up to DAILY_PUSHES a day); the rest never push: they stay in the Alerts list and are counted in
// the next morning brief (whatsapp_status 'batched').
export const EXCEPTION_KINDS = new Set<AlertKind>([
  'task_assigned',
  'request_answered',
  'new_submission',
  'decision_waiting',
  'escalated',
  'no_reply',
  'objective_missed',
  'support_reply',
  'idea_update',
]);
/** these go out at once too when the task is high or urgent priority */
export const URGENT_WHEN_HIGH = new Set<AlertKind>(['task_late', 'task_at_risk', 'no_reply']);
export const BRIEF_ONLY_KINDS = new Set<AlertKind>([
  // what a connected tool synced: the tasks it found already wait in Your tools / Needs you; no push of its own
  'tool_sync',
  // quiet Saree3 (owner, 26 Oct: only act-now, high risks and wins push): a stuck step on the journey waits for the brief
  'ladder_nudge',
  'task_at_risk',
  'objective_at_risk',
  'overload',
  'new_feature',
]);
export const DAILY_PUSHES = 1;
/** wins go out when they happen, push and WhatsApp (owner, 28 Oct: "risks or achievements anytime, notify him") */
export const WIN_KINDS = new Set<AlertKind>(['task_done_on_time', 'task_done_early', 'five_star', 'objective_achieved']);

export type QuietHours = { enabled?: boolean; prayer_times?: boolean; after?: string; friday?: boolean; ramadan?: boolean };
export type Prefs = {
  channels?: Record<string, boolean>;
  rules?: Record<string, { enabled?: boolean; channels?: string[] }>;
  quiet_hours?: QuietHours;
};

export async function loadPrefs(admin: SupabaseClient, ids: string[]): Promise<Map<string, Prefs>> {
  const map = new Map<string, Prefs>();
  if (!ids.length) return map;
  const { data, error } = await admin.from('notification_prefs').select('profile_id, channels, rules, quiet_hours').in('profile_id', ids);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.profile_id as string, {
      channels: row.channels ?? undefined,
      rules: row.rules ?? undefined,
      quiet_hours: row.quiet_hours ?? undefined,
    });
  }
  return map;
}

// ─── quiet hours (Riyadh) ─────────────────────────────────────────────────────

const RIYADH = { lat: 24.7136, lng: 46.6753, tz: 3 };
const MIN = 60_000;
const DAY_MS = 86_400_000;
/** how long a prayer holds notifications */
const PRAYER_HOLD_MIN = 25;
/** the morning end of "after hours" */
const MORNING = '07:00';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fixHour = (h: number) => ((h % 24) + 24) % 24;

/** Prayer times (hours, Riyadh local) for a Riyadh calendar date — Umm al-Qura: Fajr 18.5°, Isha = Maghrib + 90 min (120 in Ramadan). */
export function prayerTimes(y: number, m: number, d: number, ramadan: boolean): number[] {
  const jd = Date.UTC(y, m - 1, d, 12) / DAY_MS + 2440587.5;
  const n = jd - 2451545.0;
  const g = rad((357.529 + 0.98560028 * n) % 360);
  const q = (280.459 + 0.98564736 * n) % 360;
  const L = rad(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const e = rad(23.439 - 0.00000036 * n);
  const ra = deg(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))) / 15;
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  const eqt = q / 15 - fixHour(ra);
  const dhuhr = 12 + RIYADH.tz - RIYADH.lng / 15 - eqt;
  const lat = rad(RIYADH.lat);
  const hourAngle = (angle: number) =>
    deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl)))) / 15;
  const asrAngle = deg(Math.atan(1 / (1 + Math.tan(Math.abs(lat - decl)))));
  const asr = dhuhr + deg(Math.acos((Math.sin(rad(asrAngle)) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl)))) / 15;
  const maghrib = dhuhr + hourAngle(0.833);
  const fajr = dhuhr - hourAngle(18.5);
  const isha = maghrib + (ramadan ? 2 : 1.5);
  return [fajr, dhuhr, asr, maghrib, isha];
}

function isRamadan(at: Date): boolean {
  try {
    const month = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', timeZone: 'Asia/Riyadh' }).format(at);
    return parseInt(month, 10) === 9;
  } catch {
    return false;
  }
}

const hm = (s: string | undefined, fallback: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '') ?? /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  return Number(m[1]) + Number(m[2]) / 60;
};

/** When quiet hours end, if `at` falls inside them; null = fine to send now. */
export function quietUntil(q: QuietHours | undefined, at: Date): Date | null {
  if (!q || q.enabled === false) return null;
  let t = at.getTime();
  let moved = false;
  for (let i = 0; i < 6; i++) {
    const local = new Date(t + RIYADH.tz * 3_600_000);
    const y = local.getUTCFullYear();
    const mo = local.getUTCMonth();
    const d = local.getUTCDate();
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    const midnight = Date.UTC(y, mo, d) - RIYADH.tz * 3_600_000; // this Riyadh day's 00:00 as a real instant
    const atHour = (h: number, dayOffset = 0) => midnight + dayOffset * DAY_MS + Math.round(h * 60) * MIN;
    const morning = hm(MORNING, MORNING);
    let next: number | null = null;

    if (q.friday !== false && local.getUTCDay() === 5) next = atHour(morning, 1);
    else if (q.after) {
      const after = hm(q.after, '21:00');
      if (hour >= after) next = atHour(morning, 1);
      else if (hour < morning) next = atHour(morning);
    }
    if (next == null && q.prayer_times !== false) {
      for (const p of prayerTimes(y, mo + 1, d, q.ramadan !== false && isRamadan(new Date(t)))) {
        if (hour >= p && hour < p + PRAYER_HOLD_MIN / 60) {
          next = atHour(p + PRAYER_HOLD_MIN / 60);
          break;
        }
      }
    }
    if (next == null) return moved ? new Date(t) : null;
    t = next;
    moved = true;
  }
  return new Date(t);
}

// ─── WhatsApp (Meta Cloud API) ────────────────────────────────────────────────

export async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
  if (!token || !phoneId) return false;
  // Meta only delivers free-form text inside the 24 h customer-service window; outside it a template is needed.
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace(/\D/g, ''), type: 'text', text: { body: text } }),
  });
  if (!res.ok) console.error('WhatsApp send error', res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

// ─── delivery ─────────────────────────────────────────────────────────────────

type PendingAlert = {
  id: string;
  profile_id: string;
  kind: AlertKind;
  subject_id: string | null;
  task_id: string | null;
  title: string;
  body: string;
  title_ar: string | null;
  body_ar: string | null;
};

/**
 * Sends every alert not delivered yet (created in the last 24 h, not waiting for quiet hours).
 * `only` limits it to some alert ids; `ignoreQuiet` sends even in quiet hours (the "Send me a test" button).
 */
export async function deliverPending(
  admin: SupabaseClient,
  opts: { only?: string[]; ignoreQuiet?: boolean } = {},
): Promise<{ pushed: number; held: number; off: number; whatsapped: number; batched: number }> {
  const now = new Date();
  let q = admin
    .from('alerts')
    .select('id, profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar')
    .is('delivered_at', null)
    .gte('created_at', new Date(now.getTime() - DAY_MS).toISOString())
    .or(`deliver_after.is.null,deliver_after.lte.${now.toISOString()}`)
    .order('created_at')
    .limit(300);
  if (opts.only?.length) q = q.in('id', opts.only);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as PendingAlert[];
  const out = { pushed: 0, held: 0, off: 0, whatsapped: 0, batched: 0 };
  if (!rows.length) return out;

  const ids = [...new Set(rows.map((r) => r.profile_id))];
  const [prefs, { data: ppl }] = await Promise.all([
    loadPrefs(admin, ids),
    admin.from('profiles').select('id, full_name, full_name_ar, locale, phone, whatsapp_connected, wa_last_inbound_at').in('id', ids),
  ]);
  const people = new Map((ppl ?? []).map((p) => [p.id as string, p]));
  // high-priority work going late or at risk is urgent: it goes out at once like a decision (owner's request), never
  // held back by the daily budget or batched into the morning summary
  const taskIds = [...new Set(rows.filter((r) => r.task_id && URGENT_WHEN_HIGH.has(r.kind)).map((r) => r.task_id as string))];
  const { data: pri } = taskIds.length ? await admin.from('tasks').select('id, priority').in('id', taskIds) : { data: [] };
  const highTask = new Set((pri ?? []).filter((x) => x.priority === 'high' || x.priority === 'urgent').map((x) => x.id as string));
  const urgent = (a: PendingAlert) =>
    EXCEPTION_KINDS.has(a.kind) || WIN_KINDS.has(a.kind) || (!!a.task_id && highTask.has(a.task_id) && URGENT_WHEN_HIGH.has(a.kind));
  const waConfigured = !!Deno.env.get('WHATSAPP_TOKEN') && !!Deno.env.get('WHATSAPP_PHONE_ID');
  // "X assigned you" when Saree3's hand-off message (who, what, when) goes to the same person: one notification, not
  // two (owner's request). The alert stays on the Alerts screen; only Saree3's message is pushed
  const assigned = rows.filter((r) => r.kind === 'task_assigned' && r.task_id);
  const { data: briefs } = assigned.length
    ? await admin
        .from('followups')
        .select('task_id, recipient_id')
        .in('task_id', [...new Set(assigned.map((r) => r.task_id as string))])
        .in('status', ['scheduled', 'sent'])
    : { data: [] };
  const briefed = new Set((briefs ?? []).map((f) => `${f.task_id}:${f.recipient_id}`));

  // everyday pushes each person already got today (Riyadh): the budget
  const riyadh = new Date(now.getTime() + 3 * 3_600_000);
  const dayStart = new Date(Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate()) - 3 * 3_600_000);
  const { data: pushedToday } = await admin
    .from('alerts')
    .select('profile_id, kind')
    .in('profile_id', ids)
    .eq('sent_push', true)
    .gte('delivered_at', dayStart.toISOString());
  const budgetUsed = new Map<string, number>();
  for (const r of (pushedToday ?? []) as { profile_id: string; kind: AlertKind }[])
    if (!EXCEPTION_KINDS.has(r.kind)) budgetUsed.set(r.profile_id, (budgetUsed.get(r.profile_id) ?? 0) + 1);
  const batch = async (a: PendingAlert) => {
    await admin.from('alerts').update({ delivered_at: now.toISOString(), sent_push: false, whatsapp_status: 'batched' }).eq('id', a.id);
    out.batched++;
  };

  // decide per alert: switched off / held for quiet hours / to send (grouped per person)
  const toSend = new Map<string, PendingAlert[]>();
  for (const a of rows) {
    if (a.kind === 'task_assigned' && briefed.has(`${a.task_id}:${a.profile_id}`)) {
      await admin.from('alerts').update({ delivered_at: now.toISOString(), sent_push: false, whatsapp_status: 'merged' }).eq('id', a.id);
      continue;
    }
    const p = prefs.get(a.profile_id);
    const ruleKey = RULE_FOR[a.kind] ?? null;
    const rule = ruleKey ? p?.rules?.[ruleKey] : undefined;
    if (rule?.enabled === false) {
      await admin.from('alerts').update({ delivered_at: now.toISOString(), whatsapp_status: 'off' }).eq('id', a.id);
      out.off++;
      continue;
    }
    if (!opts.ignoreQuiet) {
      const until = quietUntil(p?.quiet_hours, now);
      if (until) {
        await admin.from('alerts').update({ deliver_after: until.toISOString() }).eq('id', a.id);
        out.held++;
        continue;
      }
    }
    // the budget: exceptions always go; brief-only kinds never push; the rest until today's budget is used
    if (!opts.ignoreQuiet && !urgent(a)) {
      const used = budgetUsed.get(a.profile_id) ?? 0;
      if (BRIEF_ONLY_KINDS.has(a.kind) || used >= DAILY_PUSHES) {
        await batch(a);
        continue;
      }
      budgetUsed.set(a.profile_id, used + 1);
    }
    toSend.set(a.profile_id, [...(toSend.get(a.profile_id) ?? []), a]);
  }

  for (const [profileId, all] of toSend) {
    // claim them first: a run that overlaps this one (the every-minute job while the morning backlog goes out) finds
    // them taken and sends nothing, so a notification never arrives twice (owner, 26 Oct: 5 pushes for 2 alerts)
    const { data: claimed } = await admin
      .from('alerts')
      .update({ delivered_at: now.toISOString() })
      .in('id', all.map((a) => a.id))
      .is('delivered_at', null)
      .select('id');
    const mine = new Set((claimed ?? []).map((c) => c.id as string));
    const list = all.filter((a) => mine.has(a.id));
    if (!list.length) continue;
    const p = prefs.get(profileId);
    const person = people.get(profileId);
    const ar = person?.locale === 'ar';
    const tTitle = (a: PendingAlert) => (ar ? a.title_ar : null) ?? a.title;
    const tBody = (a: PendingAlert) => (ar ? a.body_ar : null) ?? a.body;
    // 2+ at once (the morning backlog, a busy minute): one notification that opens the Alerts screen
    const grouped = list.length >= 2;
    const messages = grouped
      ? [
          {
            alerts: list,
            title: ar ? (list.length === 2 ? 'تحديثين من منتج' : `${list.length} تحديثات من منتج`) : `${list.length} updates from Muntej`,
            // one update per line (joined with " · " the directions got mixed)
            body: list.slice(0, 3).map(tTitle).join('\n') + (list.length > 3 ? '\n…' : ''),
            data: { screen: 'alerts', count: list.length } as Record<string, unknown>,
          },
        ]
      : list.map((a) => ({
          alerts: [a],
          title: tTitle(a),
          body: tBody(a),
          data: { alertId: a.id, kind: a.kind, ...(a.task_id ? { taskId: a.task_id } : {}) } as Record<string, unknown>,
        }));

    for (const m of messages) {
      // channel switches: global, and the rule's own channel list when every alert in the message has one
      const rules = m.alerts.map((a) => (RULE_FOR[a.kind] ? p?.rules?.[RULE_FOR[a.kind]!] : undefined));
      const wants = (ch: string) => p?.channels?.[ch] !== false && rules.some((r) => !r?.channels || r.channels.includes(ch));

      let sentPush = false;
      if (wants('push')) {
        sentPush = (await sendPush([profileId], { title: m.title, body: m.body, data: m.data }, admin)) > 0;
        if (sentPush) out.pushed++;
      }

      let waStatus: string;
      let sentWa = false;
      if (!waConfigured) waStatus = 'not_configured';
      else if (!person?.phone) waStatus = 'not_connected';
      else if (!wants('whatsapp')) waStatus = 'off';
      else {
        waStatus = await whatsAppAlert(admin, person as WaPerson, m, ar);
        sentWa = waStatus === 'sent';
        if (sentWa) out.whatsapped++;
      }

      await admin
        .from('alerts')
        .update({ delivered_at: now.toISOString(), sent_push: sentPush, sent_whatsapp: sentWa, whatsapp_status: waStatus })
        .in(
          'id',
          m.alerts.map((a) => a.id),
        );
      await phCapture(
        m.alerts.map((a) => ({ distinctId: profileId, event: 'alert_delivered', properties: { kind: a.kind, push: sentPush, whatsapp: waStatus, grouped } })),
      );
      await admin.from('activity_log').insert(
        m.alerts.map((a) => ({
          actor_type: 'muntej',
          subject_id: a.subject_id ?? a.profile_id,
          task_id: a.task_id,
          action: 'alert_sent',
          summary: `Alert to ${person?.full_name ?? 'someone'}: ${a.title}`,
          summary_ar: `تنبيه لـ ${person?.full_name_ar ?? person?.full_name ?? 'شخص'}: ${a.title_ar ?? a.title}`,
          reason: `${a.kind} (push: ${sentPush ? 'sent' : 'not sent'}${grouped ? ', grouped' : ''}, WhatsApp: ${waStatus})`,
        })),
      );
    }
  }
  return out;
}

type WaPerson = { id: string; full_name: string; full_name_ar: string | null; phone: string; wa_last_inbound_at: string | null };

/** An alert on WhatsApp. Inside the 24 h window: a decision / finished work comes with its buttons (Approve, Decline,
 *  Send back…), anything else as text. Outside it Meta allows only templates: act-now alerts go as the "something
 *  needs you" template (its button brings the cards); the rest wait for the next report. */
async function whatsAppAlert(
  admin: SupabaseClient,
  person: WaPerson,
  m: { alerts: PendingAlert[]; title: string; body: string },
  ar: boolean,
): Promise<'sent' | 'error' | 'outside_window'> {
  if (!inWindow(person.wa_last_inbound_at)) {
    if (!m.alerts.some((a) => EXCEPTION_KINDS.has(a.kind) || WIN_KINDS.has(a.kind) || URGENT_WHEN_HIGH.has(a.kind))) return 'outside_window';
    const name = ((ar && person.full_name_ar) || person.full_name || '').split(' ')[0];
    return (await waTemplate(person.phone, ACTION_TEMPLATE(), ar ? 'ar' : 'en', [name, m.title], 'act:')) ? 'sent' : 'error';
  }
  // the cards for exactly these alerts (a decision without a task: every pending decision)
  const about = (kind: AlertKind) => m.alerts.filter((a) => a.kind === kind);
  const decided = about('decision_waiting');
  const reviewed = new Set(about('new_submission').map((a) => a.task_id));
  if (m.alerts.every((a) => a.kind === 'decision_waiting' || a.kind === 'new_submission')) {
    const cards = (await needsYouCards(admin, person.id, ar)).filter(
      (c) =>
        (c.kind === 'decision' && decided.some((a) => !a.task_id || a.task_id === c.taskId)) ||
        (c.kind === 'review' && reviewed.has(c.taskId ?? null)),
    );
    if (cards.length) {
      let ok = true;
      for (const c of cards.slice(0, 3)) ok = (await waButtons(person.phone, c.body, c.buttons)) && ok;
      return ok ? 'sent' : 'error';
    }
  }
  return (await sendWhatsApp(person.phone, `*${m.title}*\n${m.body}`)) ? 'sent' : 'error';
}

/** Push for a follow-up step: same channel switch and quiet hours as alerts. Returns when to retry if held. */
export function followupHold(p: Prefs | undefined, now: Date): { skip: boolean; until: Date | null } {
  if (p?.channels?.push === false) return { skip: true, until: null };
  return { skip: false, until: quietUntil(p?.quiet_hours, now) };
}
