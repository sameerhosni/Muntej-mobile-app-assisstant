// invite — bringing people into an account (signed-in caller, POST).
//   { email: { person_id } }   email an invitation to someone just added from the Team screen (same account, no login
//                              yet). Returns { result: 'invited' | 'has_login' | 'failed' | 'skipped' }.
//   { redeem: { code } }       join an account with an invite code (redeem_invite runs as the caller: rate-limited,
//                              idempotent), then tell whoever shared the code that they joined (push).
//                              Returns redeem_invite's answer ({ account_id, account_name, joined } or { error }).
//   { send: { person_ids, channel: 'auto' | 'whatsapp' | 'email' } }   invite people (no login yet) on WhatsApp
//                              (approved template muntej_join with a one-time join link; Meta allows no codes in it)
//                              and / or by email;
//                              each send is an invites row (sent → opened → joined). Returns { results: [{ id, whatsapp,
//                              email }] }. A manager invites only people they can see (RLS), at most 100 at a time.
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, sendPush } from '../_shared/push.ts';
import { inviteByEmail, inviterInfo } from '../_shared/invite.ts';
import { sendInvite, type InvitePerson, type InviteResult } from '../_shared/invite-send.ts';
import { phCapture } from '../_shared/posthog.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as {
    email?: { person_id?: string };
    redeem?: { code?: string };
    send?: { person_ids?: string[]; channel?: 'auto' | 'whatsapp' | 'email' };
  };

  if (body.redeem) {
    // a brand-new login made by a code has its profile already (handle_new_user); getCaller needs one
    const { db, userId } = await getCaller(req);
    const { data, error } = await db.rpc('redeem_invite', { p_code: String(body.redeem.code ?? '') });
    if (error) throw new HttpError(400, error.message);
    if (!(data as { error?: string }).error) await notifyInviters(userId);
    return json(data);
  }

  if (body.email?.person_id) {
    const { db, profileId } = await getCaller(req);
    // RLS: only people in the caller's own account are visible
    const { data: person } = await db.from('profiles').select('email, full_name, user_id').eq('id', body.email.person_id).maybeSingle();
    if (!person) throw new HttpError(404, 'Person not found');
    if (!person.email || person.user_id) return json({ result: 'skipped' });
    const result = await inviteByEmail(person.email as string, person.full_name as string, await inviterInfo(profileId));
    return json({ result });
  }

  if (body.send?.person_ids?.length) {
    const { db, profileId } = await getCaller(req);
    const ids = body.send.person_ids.slice(0, 100);
    const channel = body.send.channel ?? 'auto';
    // RLS: only people the caller can see; only people with no login yet
    const { data: people } = await db.from('profiles').select('id, full_name, full_name_ar, email, phone, user_id, locale, account_id').in('id', ids);
    const info = await inviterInfo(profileId);
    const admin = adminClient();
    const results: InviteResult[] = [];
    for (const p of (people ?? []) as InvitePerson[]) results.push(await sendInvite(admin, p, profileId, info, channel));
    await phCapture([
      {
        distinctId: profileId,
        event: 'invites_sent',
        properties: {
          channel,
          people: results.length,
          whatsapp: results.filter((x) => x.whatsapp === 'sent').length,
          email: results.filter((x) => x.email === 'invited').length,
        },
      },
    ]);
    return json({ results });
  }

  throw new HttpError(400, 'Nothing to do');
});

/** "Noura joined your team with your invite code" to each manager whose code was used and not told yet */
async function notifyInviters(userId: string) {
  const admin = adminClient();
  const { data: seats } = await admin.from('profiles').select('id, full_name').eq('user_id', userId);
  const names = new Map((seats ?? []).map((s) => [s.id as string, s.full_name as string]));
  if (!names.size) return;
  const { data: joins } = await admin
    .from('invite_joins')
    .select('id, profile_id, manager_id')
    .in('profile_id', [...names.keys()])
    .is('notified_at', null);
  for (const j of joins ?? []) {
    if (j.manager_id) {
      const { data: mgr } = await admin.from('profiles').select('locale').eq('id', j.manager_id).maybeSingle();
      const ar = mgr?.locale === 'ar';
      const name = names.get(j.profile_id as string) ?? '';
      await sendPush([j.manager_id as string], {
        title: ar ? 'انضم لفريقك 🎉' : 'New teammate 🎉',
        body: ar ? `${name} انضم لفريقك برمز الدعوة. عطه أول مهمة!` : `${name} joined your team with your invite code. Give them a first task!`,
        data: { url: '/39-team' },
      }).catch((e) => console.error('join push', String(e)));
    }
    await admin.from('invite_joins').update({ notified_at: new Date().toISOString() }).eq('id', j.id);
  }
}
