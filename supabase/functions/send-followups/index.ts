// send-followups — delivers the follow-up plan as push notifications.
// 1) Called every minute by pg_cron (header x-cron-secret = CRON_SECRET): sends follow-ups that came due in the
//    last hour, marks them sent (or skipped when the person has no device yet) and logs each one in activity_log.
//    Older overdue rows are left alone so turning this on never sends a burst of stale reminders.
//    Follow-ups respect the person's settings: push switched off → skipped; quiet hours (after-hours, Friday,
//    prayer times) → moved to when they end. The same run then delivers every new alert (_shared/notify.ts).
// 2) Called by a signed-in user with { test: true }: sends a test notification to that user's own devices only.
// WhatsApp arrives in Sprint 2; until then every follow-up channel is delivered as a push.
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, sendPush } from '../_shared/push.ts';
import { deliverPending, followupHold, loadPrefs } from '../_shared/notify.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as { test?: boolean };

  // ── test notification for the caller ──
  if (body.test) {
    const { db, profileId } = await getCaller(req);
    const { data: me } = await db.from('profiles').select('locale').eq('id', profileId).single();
    const ar = me?.locale === 'ar';
    const sent = await sendPush([profileId], {
      title: ar ? 'منتج' : 'Muntej',
      body: ar ? 'تمام! الإشعارات شغالة على جوالك 🎉' : 'All set! Notifications work on this phone 🎉',
      data: { test: true, screen: 'alerts' },
    });
    return json({ sent });
  }

  // ── cron run ──
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');

  const admin = adminClient();
  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000);
  const { data: due, error } = await admin
    .from('followups')
    .select('id, task_id, recipient_id, message, message_ar, channel, task:tasks(title, status), recipient:profiles!followups_recipient_id_fkey(locale)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', from.toISOString())
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at')
    .limit(200);
  if (error) throw error;

  let sentCount = 0;
  let skipped = 0;
  let held = 0;
  const prefs = await loadPrefs(admin, [...new Set((due ?? []).map((f) => f.recipient_id).filter((x): x is string => !!x))]);
  for (const f of due ?? []) {
    const task = f.task as unknown as { title: string; status: string } | null;
    const locale = (f.recipient as unknown as { locale?: string } | null)?.locale;
    // a task that was finished or cancelled since the plan was made needs no more chasing
    if (!task || ['done', 'cancelled'].includes(task.status) || !f.recipient_id) {
      await admin.from('followups').update({ status: 'skipped' }).eq('id', f.id);
      skipped++;
      continue;
    }
    // the person's settings: push off → skip; quiet hours → try again when they end
    const hold = followupHold(prefs.get(f.recipient_id), now);
    if (hold.skip) {
      await admin.from('followups').update({ status: 'skipped' }).eq('id', f.id);
      skipped++;
      continue;
    }
    if (hold.until) {
      await admin.from('followups').update({ scheduled_at: hold.until.toISOString() }).eq('id', f.id);
      held++;
      continue;
    }
    const text = locale === 'ar' && f.message_ar ? f.message_ar : f.message;
    const delivered = await sendPush([f.recipient_id], { title: task.title, body: text, data: { taskId: f.task_id } }, admin);
    await admin
      .from('followups')
      .update(delivered ? { status: 'sent', sent_at: now.toISOString() } : { status: 'skipped' })
      .eq('id', f.id);
    if (delivered) {
      sentCount++;
      await admin.from('activity_log').insert({
        actor_type: 'muntej',
        subject_id: f.recipient_id,
        task_id: f.task_id,
        action: 'followup_sent',
        summary: `Followed up on "${task.title}"`,
        summary_ar: `تابعت على "${task.title}"`,
        reason: `Scheduled follow-up (${f.channel}) from the task's plan`,
      });
    } else {
      skipped++;
    }
  }
  // every new alert (assignments, reviews, decisions, changes, team alerts) goes out from here too
  const alerts = await deliverPending(admin).catch((e) => {
    console.error('alert delivery failed', e);
    return null;
  });
  return json({ due: due?.length ?? 0, sent: sentCount, skipped, held, alerts });
});
