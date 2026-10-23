// whatsapp — Muntej's own WhatsApp number (Meta WhatsApp Cloud API webhook). People send or forward voice notes and
// messages to it; Muntej writes voice notes down (Saudi Arabic), finds the tasks with the same reader as email, and
// they wait for the person's OK in the app. It answers in WhatsApp with what it found.
//   GET   Meta's webhook check (hub.verify_token = WHATSAPP_VERIFY_TOKEN → echo hub.challenge)
//   POST  incoming messages (signed by Meta: X-Hub-Signature-256 with WHATSAPP_APP_SECRET); answered 200 at once,
//         the work continues in the background (EdgeRuntime.waitUntil) so Meta never retries a slow voice note
// The sender is matched by their WhatsApp number (Connect your tools → WhatsApp → "My WhatsApp number").
// Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, OPENAI_API_KEY.
// Deployed without JWT checks (Meta calls it), so the signature check is what keeps strangers out.
import { corsHeaders } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { sendWhatsApp } from '../_shared/notify.ts';
import { ingestMessage, OPEN, type Creator } from '../_shared/intake-core.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

type WaMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  audio?: { id: string; mime_type?: string };
  voice?: { id: string; mime_type?: string };
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    return new Response(ok ? (url.searchParams.get('hub.challenge') ?? '') : 'Forbidden', { status: ok ? 200 : 403 });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const raw = await req.text();
  if (!(await signedByMeta(raw, req.headers.get('x-hub-signature-256')))) return new Response('Bad signature', { status: 401 });
  const body = JSON.parse(raw || '{}') as { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };
  const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  const work = Promise.all(messages.map((m) => handle(m).catch((e) => console.error('whatsapp message', m.id, String(e)))));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;
  return new Response('ok');
});

async function signedByMeta(raw: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!secret || !header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === header.slice(7);
}

async function handle(m: WaMessage) {
  const admin = adminClient();
  const from = m.from.replace(/\D/g, '');
  // who sent it: their WhatsApp number on their profile; with several accounts, the one they work in now
  const { data: people } = await admin
    .from('profiles')
    .select('id, user_id, account_id, locale, full_name')
    .eq('phone', from)
    .eq('status', 'active')
    .eq('hidden', false)
    .not('user_id', 'is', null);
  if (!people?.length) {
    await sendWhatsApp(
      from,
      'هلا! 👋 رقمك مو مربوط بمنتج للحين. افتح منتج ← اربط أدواتك ← واتساب، وأضف رقمك. وبعدها أرسل لي أي رسالة صوتية وأطلع منها المهام.\n\nHi! Your number isn’t linked to Muntej yet. Open Muntej → Connect your tools → WhatsApp and add it.',
    );
    return;
  }
  let me = people[0];
  if (people.length > 1) {
    const { data: s } = await admin.from('account_sessions').select('account_id').eq('user_id', me.user_id).maybeSingle();
    me = people.find((p) => p.account_id === s?.account_id) ?? me;
  }
  const ar = me.locale !== 'en';

  // what they said: a text, or a voice note written down
  let text = '';
  if (m.type === 'text') text = m.text?.body ?? '';
  else if (m.type === 'audio' || m.type === 'voice') text = await transcribe((m.audio ?? m.voice)!.id, ar);
  else {
    await sendWhatsApp(from, ar ? 'أرسل لي نص أو رسالة صوتية، وأطلع منها المهام 🎤' : 'Send me a text or a voice note and I’ll find the tasks 🎤');
    return;
  }
  if (!text.trim()) {
    await sendWhatsApp(from, ar ? 'ما سمعت شي واضح في الرسالة 🤔 جرّب مرة ثانية؟' : 'I couldn’t hear anything clear 🤔 Try again?');
    return;
  }

  const { data: team } = await admin
    .from('profiles')
    .select('id, full_name, full_name_ar, title, skills')
    .eq('account_id', me.account_id)
    .eq('status', 'active')
    .eq('hidden', false);
  const ids = (team ?? []).map((p) => p.id as string);
  const { data: open } = await admin
    .from('tasks')
    .select('id, title, owner_id')
    .in('status', OPEN)
    .in('owner_id', ids.length ? ids : [me.id]);
  const create: Creator = async (p) => {
    const { data, error } = await admin.rpc('create_task_as', { p, actor: me.id });
    if (error) throw new Error(error.message);
    return data as string;
  };
  const item = await ingestMessage(admin, {
    profileId: me.id,
    text,
    source: 'whatsapp',
    externalId: `wa:${m.id}`,
    sender: me.full_name,
    receivedAt: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
    team: team ?? [],
    open: open ?? [],
    create,
    confirmFirst: true,
  });
  if (item.duplicate_message) return;
  const n = item.suggestions.length;
  await sendWhatsApp(
    from,
    n
      ? ar
        ? `لقيت ${n === 1 ? 'مهمة' : n === 2 ? 'مهمتين' : `${n} مهام`} ✓ تنتظر موافقتك في منتج («مهام من الإيميل»):\n${item.suggestions.map((s) => `• ${s.title}`).join('\n')}`
        : `Found ${n} task${n > 1 ? 's' : ''} ✓ waiting for your OK in Muntej:\n${item.suggestions.map((s) => `• ${s.title}`).join('\n')}`
      : ar
        ? 'قريتها ✓ بس ما لقيت فيها مهمة 🤔'
        : 'Got it ✓ but I didn’t find a task in it 🤔',
  );
}

/** a WhatsApp voice note → text (Meta media download, then the same speech model as the app) */
async function transcribe(mediaId: string, ar: boolean): Promise<string> {
  const token = Deno.env.get('WHATSAPP_TOKEN') ?? '';
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!meta.ok) throw new Error(`media ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type?: string };
  const audio = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!audio.ok) throw new Error(`media download ${audio.status}`);
  const form = new FormData();
  form.append('file', new File([await audio.arrayBuffer()], 'voice.ogg', { type: mime_type ?? 'audio/ogg' }));
  form.append('model', Deno.env.get('STT_MODEL') ?? 'gpt-4o-transcribe');
  if (ar) form.append('language', 'ar');
  form.append('prompt', 'Saudi dialect. A work voice note about tasks.');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY') ?? ''}` },
    body: form,
  });
  if (!res.ok) throw new Error(`stt ${res.status}`);
  return (((await res.json()) as { text?: string }).text ?? '').trim();
}
