// support-identity — who the signed-in person is, for Intercom's Messenger (support chat opened from Saree3), with
// Intercom's identity-verification hash so nobody can pose as someone else in support. The secret
// (INTERCOM_IDENTITY_SECRET) never leaves the server.
//   POST {} → { userId, email, name, company: { id, name }, role, hash | null }
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { profileId } = await getCaller(req);
  const admin = adminClient();
  const { data: me } = await admin.from('profiles').select('id, full_name, email, role, account_id').eq('id', profileId).maybeSingle();
  if (!me) throw new HttpError(404, 'No profile');
  const { data: account } = me.account_id ? await admin.from('accounts').select('id, name').eq('id', me.account_id).maybeSingle() : { data: null };
  const secret = Deno.env.get('INTERCOM_IDENTITY_SECRET');
  return json({
    userId: me.id,
    email: me.email,
    name: me.full_name,
    role: me.role,
    company: account ? { id: account.id, name: account.name } : null,
    hash: secret ? await hmac(secret, me.id) : null,
  });
});
