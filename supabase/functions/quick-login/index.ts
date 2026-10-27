// quick-login — TEMPORARY sign-in shortcut while sign-in emails can't reach everyone (no verified email domain yet).
// The owner chose a shared code for everyone (QUICK_LOGIN_CODE, e.g. 1234), knowing that anyone who knows a
// colleague's email can sign in as them. Limits: only emails that already belong to a Muntej person (never creates
// a new person), every use is written to activity_log, and it stops working by itself after QUICK_LOGIN_UNTIL.
// Remove the QUICK_LOGIN_* secrets once email delivery is fixed (keep REVIEW_LOGIN_*: Google Play's reviewers need it).
//   POST { email, code } → { token_hash } — the app turns it into a session with auth.verifyOtp({ token_hash, type: 'magiclink' })
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { tooMany } from '../_shared/phone-session.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  const email = String(body.email ?? '').trim().toLowerCase();
  const admin = adminClient();

  // Google Play review login (owner, 27 Oct): ONE address with its own fixed code (REVIEW_LOGIN_EMAIL /
  // REVIEW_LOGIN_CODE), permanent, so store reviewers can sign in without our emails. That person lives only in the
  // separate demo company (scripts/store/review-seed.sql) and is never a super admin. 10 tries per 15 minutes.
  const reviewEmail = (Deno.env.get('REVIEW_LOGIN_EMAIL') ?? '').trim().toLowerCase();
  const reviewCode = Deno.env.get('REVIEW_LOGIN_CODE') ?? '';
  if (reviewEmail && reviewCode && email === reviewEmail) {
    if (await tooMany(admin, `review:${email}`, 10, 15)) throw new HttpError(429, 'Too many tries, wait a few minutes');
    if (String(body.code ?? '').trim() !== reviewCode) throw new HttpError(401, 'Wrong code');
    const { data: who } = await admin.from('profiles').select('id, role').ilike('email', email).neq('status', 'deleted');
    if (!who?.length || who.some((p) => p.role === 'super_admin')) throw new HttpError(404, 'No Muntej account for this email');
    return json({ token_hash: await tokenFor(admin, email, who[0].id, 'review_login', 'Signed in with the store review login', 'دخل بحساب مراجعة المتجر') });
  }

  const code = Deno.env.get('QUICK_LOGIN_CODE');
  const until = Date.parse(Deno.env.get('QUICK_LOGIN_UNTIL') ?? '');
  if (!code || Number.isNaN(until) || Date.now() > until) throw new HttpError(403, 'Use the code from your email');
  if (!email || String(body.code ?? '').trim() !== code) throw new HttpError(401, 'Wrong code');

  // QUICK_LOGIN_EMAILS (comma-separated) are always let in. QUICK_LOGIN_ALL=true also lets in every other existing
  // person (owner's choice while code emails land in spam), except a super admin: that one sees every company, so
  // only the listed emails may use the shared code for it.
  const only = (Deno.env.get('QUICK_LOGIN_EMAILS') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const listed = only.includes(email);
  const all = Deno.env.get('QUICK_LOGIN_ALL') === 'true';
  if (only.length && !listed && !all) throw new HttpError(401, 'Wrong code');
  // one email can be in several accounts (one profile each): any membership that isn't removed is enough
  const { data: people } = await admin.from('profiles').select('id, status, role').ilike('email', email).eq('hidden', false);
  const person = (people ?? []).find((p) => p.status !== 'deleted');
  if (!person) throw new HttpError(404, 'No Muntej account for this email. Ask your manager to add you.');
  if (!listed && (people ?? []).some((p) => p.role === 'super_admin')) throw new HttpError(401, 'Wrong code');

  return json({ token_hash: await tokenFor(admin, email, person.id, 'quick_login', 'Signed in with the temporary shared code', 'دخل بالرمز المؤقت المشترك') });
});

/** a magic-link token for this email (the person exists in Muntej; their sign-in user is created on first use), logged */
async function tokenFor(admin: ReturnType<typeof adminClient>, email: string, personId: string, action: string, summary: string, summaryAr: string) {
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
    actor_id: personId,
    subject_id: personId,
    action,
    summary,
    summary_ar: summaryAr,
    reason: 'Email codes not delivered yet',
    undoable: false,
  });
  return tokenHash;
}
