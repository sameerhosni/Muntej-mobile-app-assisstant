// admin-login — the super admin's own way in (owner, 2 Nov): username (supermuntej) + password, then a 6-digit code
// sent to their email (and WhatsApp as a backup). Their sign-in user has an internal address no code can reach, so
// their real email is free for normal accounts. Table super_logins (server-only).
//   POST { action:'start', username, password }  → { sent, to }         (code valid 10 min, 5 tries)
//   POST { action:'verify', username, code }     → { token_hash }       (app: verifyOtp({ token_hash, type:'magiclink' }))
//   POST { action:'setup', username, user_id, notify_email, notify_phone? } with x-cron-secret
//        → makes a new password, emails it to notify_email, moves the sign-in user to <username>@admin.muntej.invalid
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { newPin, newToken, sha256, tooMany } from '../_shared/phone-session.ts';
import { sendEmail } from '../_shared/email.ts';
import { CODE_TEMPLATE, waConfigured, waTemplateWith } from '../_shared/wa.ts';

const INTERNAL_DOMAIN = 'admin.muntej.invalid';

async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** constant-time compare of two hex strings */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const mask = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => `${a}${'•'.repeat(Math.min(b.length, 6))}${c}`);

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const username = String(body.username ?? '').trim().toLowerCase();
  const admin = adminClient();
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

  if (body.action === 'setup') {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');
    const userId = String(body.user_id ?? '');
    const notifyEmail = String(body.notify_email ?? '').trim().toLowerCase();
    if (!username || !userId || !notifyEmail.includes('@')) throw new HttpError(400, 'username, user_id, notify_email needed');
    const password = newToken().replace(/[-_]/g, '').slice(0, 14);
    const salt = newToken();
    const internal = `${username}@${INTERNAL_DOMAIN}`;
    const moved = await admin.auth.admin.updateUserById(userId, { email: internal, email_confirm: true });
    if (moved.error) throw new HttpError(500, `Could not move the sign-in: ${moved.error.message}`);
    await admin.from('profiles').update({ email: internal }).eq('user_id', userId);
    const { error } = await admin.from('super_logins').upsert({
      username,
      user_id: userId,
      password_hash: `${salt}:${await hashPassword(password, salt)}`,
      notify_email: notifyEmail,
      notify_phone: body.notify_phone ?? null,
      code_hash: null,
      code_tries: 0,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new HttpError(500, error.message);
    const delivered = await sendEmail(
      notifyEmail,
      'Your Muntej super admin sign-in',
      `<p>Your Muntej super admin sign-in:</p><p>Username: <b>${username}</b><br>Password: <b style="font-family:monospace">${password}</b></p><p>Each time you sign in, a 6-digit code is also sent to this email.</p>`,
      `Your Muntej super admin sign-in\nUsername: ${username}\nPassword: ${password}\nEach time you sign in, a 6-digit code is also sent to this email.`,
    );
    return json({ ok: true, delivered });
  }

  if (!username) throw new HttpError(400, 'Enter your username');
  if (await tooMany(admin, `admin-ip:${ip}`, 20, 15)) throw new HttpError(429, 'Too many tries, wait 15 minutes');
  const { data: row } = await admin.from('super_logins').select('*').eq('username', username).maybeSingle();

  if (body.action === 'start') {
    if (await tooMany(admin, `admin:${username}`, 8, 15)) throw new HttpError(429, 'Too many tries, wait 15 minutes');
    const [salt, hash] = String(row?.password_hash ?? ':').split(':');
    const given = await hashPassword(String(body.password ?? ''), salt || 'none');
    if (!row || !same(given, hash ?? '')) throw new HttpError(401, 'Wrong username or password');
    const code = newPin();
    await admin
      .from('super_logins')
      .update({ code_hash: await sha256(`${username}:${code}`), code_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), code_tries: 0 })
      .eq('username', username);
    const mailed = await sendEmail(
      row.notify_email,
      `Muntej sign-in code: ${code}`,
      `<p>Your Muntej super admin sign-in code:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It works for 10 minutes. If this wasn't you, change your password.</p>`,
      `Your Muntej super admin sign-in code: ${code}\nIt works for 10 minutes. If this wasn't you, change your password.`,
    );
    // backup: the same code on WhatsApp (the approved code template), so a slow inbox never locks them out
    if (row.notify_phone && waConfigured()) await waTemplateWith(row.notify_phone, CODE_TEMPLATE(), 'ar', [code], [{ sub_type: 'url', index: 0, param: code }]);
    if (!mailed) console.error('admin-login: code email not sent');
    return json({ sent: true, to: mask(row.notify_email) });
  }

  if (body.action === 'verify') {
    if (!row?.code_hash || !row.code_expires_at || Date.parse(row.code_expires_at) < Date.now() || row.code_tries >= 5)
      throw new HttpError(401, 'That code has expired, sign in again');
    if (!same(row.code_hash, await sha256(`${username}:${String(body.code ?? '').replace(/\D/g, '')}`))) {
      await admin.from('super_logins').update({ code_tries: row.code_tries + 1 }).eq('username', username);
      throw new HttpError(401, 'That code is not right');
    }
    await admin.from('super_logins').update({ code_hash: null, code_expires_at: null, code_tries: 0 }).eq('username', username);
    const { data: u } = await admin.auth.admin.getUserById(row.user_id);
    const email = u?.user?.email;
    if (!email) throw new HttpError(500, 'Could not sign you in');
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) throw new HttpError(500, 'Could not sign you in');
    const { data: me } = await admin.from('profiles').select('id').eq('user_id', row.user_id).order('created_at').limit(1).maybeSingle();
    if (me)
      await admin.from('activity_log').insert({
        actor_type: 'user',
        actor_id: me.id,
        subject_id: me.id,
        action: 'admin_login',
        summary: 'Super admin signed in (password + email code)',
        summary_ar: 'دخل المشرف العام (كلمة المرور + رمز الإيميل)',
        reason: `From ${ip}`,
        undoable: false,
      });
    return json({ token_hash: tokenHash });
  }
  throw new HttpError(400, 'Unknown action');
});
