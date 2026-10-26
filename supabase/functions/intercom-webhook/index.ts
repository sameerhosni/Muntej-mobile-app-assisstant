// intercom-webhook — when someone from the Muntej team replies in the support chat (Intercom), the person gets a push
// from Saree3 ("The Muntej team replied") that opens the chat in the app (screen 57). Owner, 26 Oct: the chat inside
// the app is a web page and can't push by itself.
//   HEAD/GET  Intercom checks the URL when the webhook is saved → 200
//   POST      Intercom's notification (topic conversation.admin.replied), signed with the developer app's client
//             secret: X-Hub-Signature: sha1=<HMAC-SHA1 of the body> (INTERCOM_CLIENT_SECRET)
// The person is found by the Intercom contact's external_id, which is their Muntej profile id (support-identity).
// Deployed without JWT checks (Intercom calls it); the signature keeps strangers out.
import { adminClient } from '../_shared/push.ts';
import { deliverPending } from '../_shared/notify.ts';

type Part = { id?: string; body?: string | null; author?: { type?: string; name?: string } };
type Payload = {
  topic?: string;
  data?: {
    item?: {
      id?: string;
      contacts?: { contacts?: { id?: string; external_id?: string | null }[] };
      conversation_parts?: { conversation_parts?: Part[] };
    };
  };
};

Deno.serve(async (req) => {
  if (req.method === 'HEAD' || req.method === 'GET') return new Response('ok');
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const raw = await req.text();
  if (!(await signed(raw, req.headers.get('x-hub-signature')))) return new Response('Bad signature', { status: 401 });

  const body = JSON.parse(raw || '{}') as Payload;
  if (body.topic !== 'conversation.admin.replied') return new Response('ignored');
  const item = body.data?.item;
  const part = [...(item?.conversation_parts?.conversation_parts ?? [])].reverse().find((p) => p.author?.type === 'admin');
  const ids = (item?.contacts?.contacts ?? []).map((c) => c.external_id).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x));
  if (!ids.length) return new Response('no muntej person');

  const admin = adminClient();
  const { data: people } = await admin.from('profiles').select('id, locale').in('id', ids);
  const text = strip(part?.body ?? '').slice(0, 160);
  const who = (part?.author?.name ?? '').split(' ')[0];
  const rows = (people ?? []).map((p) => ({
    profile_id: p.id,
    kind: 'support_reply',
    subject_id: p.id,
    title: `💬 ${who || 'The Muntej team'} replied`,
    body: text || 'Open the chat to read it',
    title_ar: `💬 ردّ عليك ${who || 'فريق منتج'}`,
    body_ar: text || 'افتح المحادثة وشوف الرد',
    dedupe_key: `support:${item?.id ?? ''}:${part?.id ?? Date.now()}:${p.id}`,
  }));
  if (!rows.length) return new Response('no muntej person');
  const { data: made, error } = await admin.from('alerts').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
  if (error) {
    console.error('intercom-webhook alert', error.message);
    return new Response('error', { status: 500 });
  }
  if (made?.length) await deliverPending(admin, { only: made.map((a) => a.id as string), ignoreQuiet: false });
  return new Response('ok');
});

async function signed(raw: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get('INTERCOM_CLIENT_SECRET');
  if (!secret || !header?.startsWith('sha1=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('') === header.slice(5);
}

/** Intercom message HTML → one line of text */
function strip(html: string) {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
