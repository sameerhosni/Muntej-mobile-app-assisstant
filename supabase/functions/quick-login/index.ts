// quick-login — TEMPORARY sign-in shortcut while sign-in emails can't reach everyone (no verified email domain yet).
// The owner chose a shared code for everyone (QUICK_LOGIN_CODE, e.g. 1234), knowing that anyone who knows a
// colleague's email can sign in as them. Limits: only emails that already belong to a Muntej person (never creates
// a new person), every use is written to activity_log, and it stops working by itself after QUICK_LOGIN_UNTIL.
// Remove the secrets (or this function) once email delivery is fixed.
//   POST { email, code } → { token_hash } — the app turns it into a session with auth.verifyOtp({ token_hash, type: 'magiclink' })
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const code = Deno.env.get('QUICK_LOGIN_CODE');
  const until = Date.parse(Deno.env.get('QUICK_LOGIN_UNTIL') ?? '');
  if (!code || Number.isNaN(until) || Date.now() > until) throw new HttpError(403, 'Use the code from your email');

  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || String(body.code ?? '').trim() !== code) throw new HttpError(401, 'Wrong code');

  const admin = adminClient();
  // once real email codes work, the shared code can be kept for a few emails only (QUICK_LOGIN_EMAILS, comma-separated)
  const only = (Deno.env.get('QUICK_LOGIN_EMAILS') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (only.length && !only.includes(email.toLowerCase())) throw new HttpError(401, 'Wrong code');
  // one email can be in several accounts (one profile each): any membership that isn't removed is enough
  const { data: people } = await admin.from('profiles').select('id, status').ilike('email', email).eq('hidden', false);
  const person = (people ?? []).find((p) => p.status !== 'deleted');
  if (!person) throw new HttpError(404, 'No Muntej account for this email. Ask your manager to add you.');

  // a magic-link token for this email (the person exists in Muntej; create their sign-in user on first use)
  let link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && !/already/i.test(created.error.message)) throw new HttpError(500, 'Could not sign you in');
    link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  }
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) throw new HttpError(500, 'Could not sign you in');

  await admin.from('activity_log').insert({
    actor_type: 'user',
    actor_id: person.id,
    subject_id: person.id,
    action: 'quick_login',
    summary: 'Signed in with the temporary shared code',
    summary_ar: 'دخل بالرمز المؤقت المشترك',
    reason: 'Email codes not delivered yet',
    undoable: false,
  });
  return json({ token_hash: tokenHash });
});
