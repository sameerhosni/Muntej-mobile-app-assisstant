// phone-auth — signing in without an email code (owner, 26 Oct: "login with mobile number and a generated passkey"):
//   POST {action:'opened', token}        the join page was opened → {first_name, company} (marks the invite opened)
//   POST {action:'redeem', token}        the invite's one-time link → {token_hash} (the app makes the session)
//   POST {action:'pin', phone, pin}      mobile + the PIN from the WhatsApp invite → {token_hash}
//   POST {action:'send_code', phone}     a 6-digit code on WhatsApp (approved authentication template muntej_code)
//   POST {action:'verify_code', phone, code} → {token_hash}
//   POST {action:'device_enroll', device} (signed in) → {key, user_id}: fingerprint sign-in on this phone
//   POST {action:'device_signin', user_id, key} → {token_hash}
// Only people already in Muntej (a profile with that mobile, or the invite) can sign in this way; nobody is created
// from nothing. Links and PINs are single use and expire after 7 days; codes after 10 minutes and 5 tries; every
// mobile and every IP is rate-limited. Each sign-in is written to activity_log.
// Deployed without JWT checks (people aren't signed in yet).
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { newPin, newToken, normPhone, sessionFor, sha256, tooMany } from '../_shared/phone-session.ts';
import { CODE_TEMPLATE, waConfigured, waTemplateWith } from '../_shared/wa.ts';
import { phCapture } from '../_shared/posthog.ts';

type Person = { id: string; user_id: string | null; email: string | null; phone: string | null; full_name: string; full_name_ar: string | null; account_id: string; locale: string | null };
const PERSON = 'id, user_id, email, phone, full_name, full_name_ar, account_id, locale';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const admin = adminClient();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    token?: string;
    phone?: string;
    pin?: string;
    code?: string;
    device?: string;
    user_id?: string;
    key?: string;
  };
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (await tooMany(admin, `ip:${ip}`, 40, 15)) throw new HttpError(429, 'Too many tries, wait a few minutes');

  // ── Muntej's WhatsApp number (the app opens a chat to it with "رمز الدخول": the reply is the code) ──
  if (body.action === 'wa_number') return json({ number: (Deno.env.get('WHATSAPP_NUMBER') ?? '966115209855').replace(/\D/g, '') });

  // ── sign in with WhatsApp, nothing to type: a one-time key the person sends from WhatsApp ──
  if (body.action === 'wa_start') {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => abc[b % abc.length]).join('');
    await admin.from('wa_logins').insert({ nonce });
    return json({ nonce, number: (Deno.env.get('WHATSAPP_NUMBER') ?? '966115209855').replace(/\D/g, '') });
  }
  if (body.action === 'wa_poll') {
    const { data: row } = await admin.from('wa_logins').select('nonce, profile_id, approved_at, used_at, created_at').eq('nonce', String(body.token ?? '')).maybeSingle();
    if (!row || Date.now() - Date.parse(row.created_at) > 15 * 60_000) throw new HttpError(410, 'This sign-in expired, start again');
    if (!row.approved_at || !row.profile_id) return json({ waiting: true });
    if (row.used_at) throw new HttpError(410, 'Already used, start again');
    await admin.from('wa_logins').update({ used_at: new Date().toISOString() }).eq('nonce', row.nonce);
    const { data: person } = await admin.from('profiles').select(PERSON).eq('id', row.profile_id).maybeSingle();
    if (!person) throw new HttpError(404, 'No Muntej account for this WhatsApp number');
    return json({ token_hash: await signIn(person as Person, 'whatsapp_message') });
  }

  // ── fingerprint / face: a device key (made here, kept on the phone behind its biometrics) ──
  if (body.action === 'device_enroll') {
    // signed in: Authorization carries their session
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) throw new HttpError(401, 'Sign in first');
    const secret = newToken();
    await admin.from('device_keys').insert({ user_id: u.user.id, key_hash: await sha256(secret), device: String(body.device ?? '').slice(0, 80) || null });
    return json({ key: secret, user_id: u.user.id });
  }
  if (body.action === 'device_signin') {
    if (await tooMany(admin, `device:${body.user_id ?? ''}`, 10, 15)) throw new HttpError(429, 'Too many tries, wait a few minutes');
    const { data: row } = await admin
      .from('device_keys')
      .select('id, user_id')
      .eq('user_id', String(body.user_id ?? ''))
      .eq('key_hash', await sha256(String(body.key ?? '')))
      .maybeSingle();
    if (!row) throw new HttpError(401, 'This phone isn’t set up for fingerprint sign-in any more');
    await admin.from('device_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
    const { data: p } = await admin.from('profiles').select(PERSON).eq('user_id', row.user_id).neq('status', 'deleted').order('created_at').limit(1);
    const person = (p ?? [])[0] as Person | undefined;
    if (!person) throw new HttpError(404, 'No Muntej account for this phone');
    return json({ token_hash: await signIn(person, 'fingerprint') });
  }

  // ── the invite link ──
  if (body.action === 'opened' || body.action === 'redeem') {
    const hash = await sha256(String(body.token ?? ''));
    const { data: inv } = await admin.from('invites').select('id, profile_id, status, expires_at, used_at, invited_by').eq('token_hash', hash).maybeSingle();
    if (!inv) throw new HttpError(404, 'This link is not valid');
    const { data: person } = await admin.from('profiles').select(PERSON).eq('id', inv.profile_id).maybeSingle();
    if (!person) throw new HttpError(404, 'This link is not valid');
    if (body.action === 'opened') {
      if (inv.status === 'sent') await admin.from('invites').update({ status: 'opened', opened_at: new Date().toISOString() }).eq('id', inv.id);
      const { data: acc } = await admin.from('accounts').select('name').eq('id', person.account_id).maybeSingle();
      return json({ first_name: (((person.locale !== 'en' && person.full_name_ar) || person.full_name) as string).split(' ')[0], company: acc?.name ?? null });
    }
    if (inv.used_at || Date.parse(inv.expires_at) < Date.now()) throw new HttpError(410, 'This link was already used or has expired. Sign in with your mobile number instead.');
    await admin.from('invites').update({ used_at: new Date().toISOString(), status: inv.status === 'joined' ? 'joined' : 'opened', opened_at: new Date().toISOString() }).eq('id', inv.id);
    return json({ token_hash: await signIn(person as Person, 'invite_link') });
  }

  const phone = normPhone(body.phone);
  if (!phone) throw new HttpError(400, 'Enter your mobile number');
  if (await tooMany(admin, `phone:${phone}`, 8, 15)) throw new HttpError(429, 'Too many tries for this number, wait 15 minutes');

  // ── mobile + the PIN from the invite ──
  if (body.action === 'pin') {
    const pinHash = await sha256(`${phone}:${String(body.pin ?? '').replace(/\D/g, '')}`);
    const { data: inv } = await admin
      .from('invites')
      .select('id, profile_id, expires_at, used_at')
      .eq('phone', phone)
      .eq('pin_hash', pinHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!inv) throw new HttpError(401, 'That PIN is not right (or it was already used)');
    const { data: person } = await admin.from('profiles').select(PERSON).eq('id', inv.profile_id).maybeSingle();
    if (!person) throw new HttpError(401, 'That PIN is not right');
    await admin.from('invites').update({ used_at: new Date().toISOString(), status: 'opened', opened_at: new Date().toISOString() }).eq('id', inv.id);
    return json({ token_hash: await signIn(person as Person, 'invite_pin') });
  }

  // ── a code on WhatsApp ──
  const person = await personByPhone(phone);
  if (body.action === 'send_code') {
    // say the same thing whether or not the number is known (nobody can probe who uses Muntej)
    if (person && waConfigured()) {
      const code = newPin();
      await admin.from('phone_codes').upsert({ phone, code_hash: await sha256(`${phone}:${code}`), tries: 0, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
      const ok = await waTemplateWith(phone, CODE_TEMPLATE(), person.locale === 'en' ? 'en' : 'ar', [code], [{ sub_type: 'url', index: 0, param: code }]);
      if (!ok) console.error('phone-auth: code template failed (not approved yet?)');
    }
    return json({ sent: true });
  }
  if (body.action === 'verify_code') {
    const { data: row } = await admin.from('phone_codes').select('code_hash, tries, expires_at').eq('phone', phone).maybeSingle();
    if (!row || !person || Date.parse(row.expires_at) < Date.now() || row.tries >= 5) throw new HttpError(401, 'That code has expired, ask for a new one');
    if (row.code_hash !== (await sha256(`${phone}:${String(body.code ?? '').replace(/\D/g, '')}`))) {
      await admin.from('phone_codes').update({ tries: row.tries + 1 }).eq('phone', phone);
      throw new HttpError(401, 'That code is not right');
    }
    await admin.from('phone_codes').delete().eq('phone', phone);
    return json({ token_hash: await signIn(person, 'whatsapp_code') });
  }
  throw new HttpError(400, 'Unknown action');

  async function personByPhone(p: string): Promise<Person | null> {
    const { data } = await admin.from('profiles').select(PERSON).eq('phone', p).neq('status', 'deleted').eq('hidden', false).order('created_at').limit(1);
    return ((data ?? [])[0] as Person) ?? null;
  }

  async function signIn(p: Person, how: string) {
    const hash = await sessionFor(admin, p);
    await admin.from('activity_log').insert({
      actor_type: 'user',
      actor_id: p.id,
      subject_id: p.id,
      action: 'phone_sign_in',
      summary: `Signed in with ${how.replace('_', ' ')}`,
      summary_ar: how === 'whatsapp_code' ? 'دخل برمز الواتساب' : how === 'whatsapp_message' ? 'دخل برسالة واتساب' : how === 'fingerprint' ? 'دخل ببصمته' : how === 'invite_pin' ? 'دخل برمز الدعوة' : 'دخل من رابط الدعوة',
      reason: 'Mobile sign-in',
      undoable: false,
    });
    await phCapture([{ distinctId: p.id, event: 'sign_in', properties: { method: how } }]);
    return hash;
  }
});
