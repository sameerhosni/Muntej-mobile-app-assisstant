// onboarding-nudges — once a day (pg_cron 09:30 Riyadh, header x-cron-secret = CRON_SECRET; { dry: true } only says
// what it would send). Chat onboarding release 3 (owner, 29 Oct):
//   1) a setup left halfway: one nudge after 1 day and one after 3 days, then never again. An admin hears the step
//      still missing (company / team / first task); a member "two quick questions". Push and, inside WhatsApp's 24 h
//      window, WhatsApp, on the channels the person chose. The push opens the setup chat (screen 63).
//   2) an invite nobody opened: resent after 1 and 3 days (WhatsApp join link or email, as the inviter), then stop.
// Every nudge and resend is written to activity_log.
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, sendPush } from '../_shared/push.ts';
import { loadPrefs } from '../_shared/notify.ts';
import { inWindow, rtl, waText } from '../_shared/wa.ts';
import { inviterInfo } from '../_shared/invite.ts';
import { sendInvite, type InvitePerson } from '../_shared/invite-send.ts';

const DAY = 86_400_000;
const OPEN_STATUSES = ['draft', 'assigned', 'in_progress', 'blocked', 'submitted', 'returned', 'done'];

type Row = { profile_id: string; kind: string | null; account_named: boolean; started_at: string; nudges: number; nudged_at: string | null };
type Person = { id: string; full_name: string; full_name_ar: string | null; locale: string | null; phone: string | null; wa_last_inbound_at: string | null; account_id: string; status: string; user_id: string | null; hidden: boolean | null };

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');
  const { dry = false } = (await req.json().catch(() => ({}))) as { dry?: boolean };
  const admin = adminClient();
  const now = Date.now();
  const out = { setups: [] as string[], invites: [] as string[] };

  // ── 1) setups left halfway ──
  const { data: rows } = await admin.from('onboarding').select('profile_id, kind, account_named, started_at, nudges, nudged_at').is('finished_at', null).lt('nudges', 2);
  const due = ((rows ?? []) as Row[]).filter((r) =>
    r.nudges === 0 ? now - Date.parse(r.started_at) > DAY : !!r.nudged_at && now - Date.parse(r.nudged_at) > 2 * DAY,
  );
  if (due.length) {
    const { data: ppl } = await admin
      .from('profiles')
      .select('id, full_name, full_name_ar, locale, phone, wa_last_inbound_at, account_id, status, user_id, hidden')
      .in('id', due.map((r) => r.profile_id));
    const people = new Map(((ppl ?? []) as Person[]).map((p) => [p.id, p]));
    const prefs = await loadPrefs(admin, due.map((r) => r.profile_id));
    for (const r of due) {
      const p = people.get(r.profile_id);
      if (!p || p.status !== 'active' || !p.user_id || p.hidden) continue;
      const ar = p.locale !== 'en';
      const name = ((ar && p.full_name_ar) || p.full_name).split(' ')[0];
      let title: string;
      let body: string;
      let waExtra = '';
      if (r.kind === 'member') {
        title = ar ? `هلا ${name} 👋` : `Hi ${name} 👋`;
        body = ar ? 'باقي سؤالين سريعة وتخلص تجهيز حسابك في منتج.' : 'Two quick questions and your Muntej account is ready.';
      } else {
        // the step still missing, from real data (same order as the chat)
        const [{ count: others }, { count: given }] = await Promise.all([
          admin.from('profiles').select('id', { count: 'exact', head: true }).eq('account_id', p.account_id).neq('id', p.id).neq('status', 'deleted').eq('hidden', false),
          admin.from('tasks').select('id', { count: 'exact', head: true }).eq('assigner_id', p.id).in('status', OPEN_STATUSES),
        ]);
        const step = !r.account_named ? 'company' : !others ? 'team' : !given ? 'task' : null;
        if (!step) {
          // everything's done, only the chat wasn't closed: nothing to nudge
          if (!dry) await admin.from('onboarding').update({ finished_at: new Date().toISOString() }).eq('profile_id', p.id);
          continue;
        }
        title = ar ? `صباح الخير ${name}` : `Good morning ${name}`;
        body = {
          company: ar ? 'شركتك شبه جاهزة: بس أكّد اسمها وأبدأ معك.' : 'Your company is almost ready: just confirm its name and we start.',
          team: ar ? 'شركتك جاهزة، باقي تجيب فريقك عشان أبدأ أوزّع المهام عنك.' : 'Your company is ready. Bring your team and I start handing out the work.',
          task: ar ? 'فريقك جاهز، عطني أول مهمة وأنا أوصلها وأتابعها.' : 'Your team is ready. Give me a first task and I deliver and follow it.',
        }[step];
        if (step === 'team') waExtra = ar ? '\nأرسل لي هنا أسماءهم أو صورة الهيكل، وأنا أرتّبهم.' : '\nSend me their names or a photo of the org chart here.';
        if (step === 'task') waExtra = ar ? '\nقلها لي هنا بصوتك أو اكتبها.' : '\nSay it here by voice or type it.';
      }
      const pr = prefs.get(p.id);
      const sent: string[] = [];
      if (!dry) {
        if (pr?.channels?.push !== false && (await sendPush([p.id], { title, body, data: { url: '/63-setup-chat' } }, admin)) > 0) sent.push('push');
        if (p.phone && pr?.channels?.whatsapp !== false && inWindow(p.wa_last_inbound_at) && (await waText(p.phone, rtl(ar, `*${title}*\n${body}${waExtra}`)))) sent.push('whatsapp');
        await admin.from('onboarding').update({ nudges: r.nudges + 1, nudged_at: new Date().toISOString() }).eq('profile_id', p.id);
        await admin.from('activity_log').insert({
          actor_type: 'muntej',
          subject_id: p.id,
          action: 'setup_nudged',
          summary: `Reminded ${p.full_name} to finish setting up (${r.nudges + 1} of 2, ${sent.join(' + ') || 'nothing sent'})`,
          summary_ar: `ذكّرت ${(p.full_name_ar ?? p.full_name)} يكمّل تجهيز حسابه (${r.nudges + 1} من ٢)`,
          reason: 'setup left halfway',
          undoable: false,
        });
      }
      out.setups.push(`${p.full_name}: ${body}${sent.length ? ` [${sent.join('+')}]` : ''}`);
    }
  }

  // ── 2) invites nobody opened ──
  const { data: invites } = await admin
    .from('invites')
    .select('profile_id, invited_by, status, sent_at')
    .in('status', ['sent', 'opened'])
    .order('sent_at', { ascending: false });
  const byPerson = new Map<string, { invited_by: string | null; sent_at: string; n: number }>();
  for (const i of invites ?? []) {
    const cur = byPerson.get(i.profile_id as string);
    if (cur) cur.n++;
    else byPerson.set(i.profile_id as string, { invited_by: i.invited_by as string | null, sent_at: i.sent_at as string, n: 1 });
  }
  // 1 send → resend after a day; 2 sends → once more after 2 more days; 3 → stop
  const resend = [...byPerson.entries()].filter(([, v]) => v.invited_by && v.n < 3 && now - Date.parse(v.sent_at) > (v.n === 1 ? DAY : 2 * DAY));
  if (resend.length) {
    const { data: ppl } = await admin
      .from('profiles')
      .select('id, full_name, full_name_ar, email, phone, user_id, locale, account_id, status, hidden')
      .in('id', resend.map(([id]) => id))
      .is('user_id', null)
      .neq('status', 'deleted');
    const info = new Map<string, Awaited<ReturnType<typeof inviterInfo>>>();
    for (const p of (ppl ?? []) as (InvitePerson & { hidden: boolean | null })[]) {
      if (p.hidden) continue;
      const by = byPerson.get(p.id)!.invited_by!;
      if (!info.has(by)) info.set(by, await inviterInfo(by));
      if (dry) {
        out.invites.push(`${p.full_name}: would resend (${p.phone ? 'whatsapp' : 'email'})`);
        continue;
      }
      const r = await sendInvite(admin, p, by, info.get(by)!);
      await admin.from('activity_log').insert({
        actor_type: 'muntej',
        subject_id: p.id,
        action: 'invite_resent',
        summary: `Resent ${p.full_name}'s invite (WhatsApp: ${r.whatsapp ?? 'no'}, email: ${r.email ?? 'no'})`,
        summary_ar: `أعدت إرسال دعوة ${(p.full_name_ar ?? p.full_name)}`,
        reason: 'invite not opened',
        undoable: false,
      });
      out.invites.push(`${p.full_name}: whatsapp ${r.whatsapp ?? '-'}, email ${r.email ?? '-'}`);
    }
  }

  return json({ dry, ...out });
});
