// support-identity — who the signed-in person is, for Intercom's Messenger (support chat with the Muntej team), with
// Intercom's identity-verification hash when the secret is set (INTERCOM_IDENTITY_SECRET never leaves the server).
//   POST {}                 (signed in) → { userId, email, name, company, role, hash | null }
//   POST { action: 'link' } (signed in) → { url }: a one-time link to the support page in the browser (15 min)
//   GET  ?token=…           (the support page) → the same identity, once
// Deployed without JWT checks so the support page can call it; the POSTs check the caller themselves.
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';

const PAGE = Deno.env.get('SUPPORT_PAGE_URL') ?? 'https://nizamy-muntej.expo.app/';

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function identity(profileId: string) {
  const admin = adminClient();
  const { data: me } = await admin.from('profiles').select('id, full_name, email, role, account_id, locale').eq('id', profileId).maybeSingle();
  if (!me) throw new HttpError(404, 'No profile');
  const { data: account } = me.account_id ? await admin.from('accounts').select('id, name').eq('id', me.account_id).maybeSingle() : { data: null };
  const secret = Deno.env.get('INTERCOM_IDENTITY_SECRET');
  return {
    userId: me.id,
    email: me.email,
    name: me.full_name,
    role: me.role,
    locale: me.locale,
    company: account ? { id: account.id, name: account.name } : null,
    hash: secret ? await hmac(secret, me.id) : null,
  };
}

serve(async (req) => {
  const admin = adminClient();
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (!/^[0-9a-f-]{36}$/.test(token)) throw new HttpError(400, 'Bad link');
    const { data: link } = await admin
      .from('support_links')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)
      .is('used_at', null)
      .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
      .select('profile_id')
      .maybeSingle();
    if (!link) throw new HttpError(410, 'This link has expired. Open it again from Muntej.');
    return json(await identity(link.profile_id as string));
  }
  if (req.method !== 'POST') throw new HttpError(405, 'GET or POST only');
  const { profileId } = await getCaller(req);
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === 'link') {
    const { data, error } = await admin.from('support_links').insert({ profile_id: profileId }).select('token').single();
    if (error) throw error;
    return json({ url: `${PAGE}?t=${data.token}` });
  }
  return json(await identity(profileId));
});
