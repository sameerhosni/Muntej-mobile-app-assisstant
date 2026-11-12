// client-error — the app reports a failed sign-in step (no session yet, so no login is needed: verify_jwt = false).
// Apple, 11 Nov: "an error occurred when we tapped login" on an iPad, and our logs had nothing to show why. Every
// failure on the sign-in screens now shows its cause with a ref number, and the same ref is kept here
// (public.client_errors). Only the step, the error and the device are kept: never a code, and only the email's domain.
//   POST { ref, step, kind, message?, status?, platform?, os_version?, device?, ipad?, app_version?, build?, update_id?, email? }
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { tooMany } from '../_shared/phone-session.ts';

const STEPS = ['send_code', 'verify', 'quick_login', 'resend', 'whatsapp', 'biometric', 'admin'];
const KINDS = ['network', 'wrong_code', 'rate_limited', 'other'];
const cut = (v: unknown, n: number) => (v == null || v === '' ? null : String(v).slice(0, n));

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const step = String(b.step ?? '');
  const kind = String(b.kind ?? '');
  const ref = String(b.ref ?? '');
  if (!STEPS.includes(step) || !KINDS.includes(kind) || !/^\d{4,6}$/.test(ref)) throw new HttpError(400, 'Bad report');

  const admin = adminClient();
  // one phone stuck in a loop must not fill the table: 30 reports per 15 minutes per address
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (await tooMany(admin, `client-error:${ip}`, 30, 15)) return json({ ok: true, kept: false });

  const email = String(b.email ?? '').trim().toLowerCase();
  const reviewEmail = (Deno.env.get('REVIEW_LOGIN_EMAIL') ?? '').trim().toLowerCase();
  const { error } = await admin.from('client_errors').insert({
    ref,
    step,
    kind,
    message: cut(b.message, 300),
    status: Number.isFinite(Number(b.status)) && b.status != null ? Number(b.status) : null,
    platform: cut(b.platform, 20),
    os_version: cut(b.os_version, 40),
    device: cut(b.device, 80),
    ipad: typeof b.ipad === 'boolean' ? b.ipad : null,
    app_version: cut(b.app_version, 20),
    build: cut(b.build, 20),
    update_id: cut(b.update_id, 60),
    email_domain: email.includes('@') ? cut(email.split('@')[1], 80) : null,
    review_login: !!reviewEmail && email === reviewEmail,
  });
  if (error) throw new HttpError(500, 'Could not keep the report');
  return json({ ok: true, kept: true });
});
