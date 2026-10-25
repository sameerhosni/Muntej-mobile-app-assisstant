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
import { createFromSuggestion, ingestMessage, OPEN, saveItem, type Creator, type Item } from '../_shared/intake-core.ts';

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
  interactive?: { type: string; button_reply?: { id: string; title: string } };
};

/** a message with up to 3 reply buttons (free inside the 24 h window, like a text) */
async function sendButtons(phone: string, body: string, buttons: { id: string; title: string }[], footer?: string) {
  const res = await fetch(`${GRAPH}/${Deno.env.get('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body.slice(0, 1024) },
        ...(footer ? { footer: { text: footer.slice(0, 60) } } : {}),
        action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    }),
  });
  if (!res.ok) console.error('WhatsApp buttons error', res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    return new Response(ok ? (url.searchParams.get('hub.challenge') ?? '') : 'Forbidden', { status: ok ? 200 : 403 });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const raw = await req.text();
  // one-time setup from the server itself (x-cron-secret): register the number, let Meta send this app the number's
  // messages, set the business profile, and report the number's status. The keys never leave the server.
  const cron = Deno.env.get('CRON_SECRET');
  if (cron && req.headers.get('x-cron-secret') === cron) return new Response(JSON.stringify(await setup(JSON.parse(raw || '{}'))), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!(await signedByMeta(raw, req.headers.get('x-hub-signature-256')))) return new Response('Bad signature', { status: 401 });
  const body = JSON.parse(raw || '{}') as { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };
  const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  const work = Promise.all(messages.map((m) => handle(m).catch((e) => console.error('whatsapp message', m.id, String(e)))));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;
  return new Response('ok');
});

/** register the number (2-step PIN), subscribe the app to its WhatsApp account, profile, status */
async function setup(o: { pin?: string; about?: string; description?: string; business?: string; waba?: string; test_to?: string }) {
  const token = Deno.env.get('WHATSAPP_TOKEN') ?? '';
  const phone = Deno.env.get('WHATSAPP_PHONE_ID') ?? '';
  const call = async (path: string, init?: RequestInit) => {
    const r = await fetch(`${GRAPH}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  };
  const out: Record<string, unknown> = {};
  // which WhatsApp accounts this token can manage (from the token itself)
  const dbg = await call(`debug_token?input_token=${token}`);
  const scopes = ((dbg.body as { data?: { granular_scopes?: { scope: string; target_ids?: string[] }[]; scopes?: string[] } }).data ?? {}) as {
    granular_scopes?: { scope: string; target_ids?: string[] }[];
    scopes?: string[];
  };
  out.scopes = scopes.scopes;
  const wabas = [...new Set((scopes.granular_scopes ?? []).filter((g) => g.scope.startsWith('whatsapp')).flatMap((g) => g.target_ids ?? []))];
  if (o.waba) wabas.push(o.waba);
  // a token with access to everything lists no ids: ask the business which WhatsApp accounts it has
  if (!wabas.length && o.business)
    for (const kind of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      const r = await call(`${o.business}/${kind}?fields=id,name`);
      out[kind] = r.body;
      for (const w of ((r.body as { data?: { id: string }[] }).data ?? [])) wabas.push(w.id);
    }
  out.wabas = wabas;
  // let Meta deliver the number's messages to this app's webhook
  out.subscribed = await Promise.all(wabas.map((w) => call(`${w}/subscribed_apps`, { method: 'POST' }).then((r) => ({ waba: w, ...r }))));
  // register the number on the Cloud API (it shows "connected" after this)
  o.pin ??= Deno.env.get('WHATSAPP_PIN') ?? undefined;
  if (o.pin) out.register = await call(`${phone}/register`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin: o.pin }) });
  if (o.about || o.description)
    out.profile = await call(`${phone}/whatsapp_business_profile`, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', vertical: 'PROF_SERVICES', ...(o.about ? { about: o.about } : {}), ...(o.description ? { description: o.description } : {}) }),
    });
  out.number = await call(`${phone}?fields=display_phone_number,verified_name,name_status,code_verification_status,quality_rating,platform_type,status`);
  // Meta's ready-made "hello_world" template: works before the person has written to the number
  if (o.test_to)
    out.test = await call(`${phone}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', to: o.test_to.replace(/\D/g, ''), type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }),
    });
  return out;
}

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
  const rtl = (s: string) => (ar ? s.split('\n').map((l) => (l ? `‏${l}` : l)).join('\n') : s);

  const { data: team } = await admin
    .from('profiles')
    .select('id, full_name, full_name_ar, title, skills')
    .eq('account_id', me.account_id)
    .eq('status', 'active')
    .eq('hidden', false);
  const nameOf = (id: string | null) => {
    const p = (team ?? []).find((x) => x.id === id);
    return p ? (p.id === me.id ? (ar ? 'أنت' : 'You') : (ar && p.full_name_ar) || p.full_name) : null;
  };
  const create: Creator = async (p) => {
    const { data, error } = await admin.rpc('create_task_as', { p, actor: me.id });
    if (error) throw new Error(error.message);
    return data as string;
  };

  // a tap on Approve / Ignore under a task: same as in the app (Your tools)
  if (m.type === 'interactive' && m.interactive?.button_reply) {
    const [verb, itemId, idx] = m.interactive.button_reply.id.split(':');
    const { data: row } = await admin.from('incoming_items').select('*').eq('id', itemId).eq('owner_id', me.id).maybeSingle();
    const item = row as Item | null;
    const s = item?.suggestions[Number(idx)];
    if (!item || !s) return void (await sendWhatsApp(from, ar ? 'ما لقيت هالمهمة 🤔 شيّك عليها في منتج ← أدواتك' : 'I couldn’t find that task 🤔 Check Muntej → Your tools'));
    if (s.state !== 'new')
      return void (await sendWhatsApp(
        from,
        rtl(ar ? `سبق وتعاملنا معها ✓ (${s.state === 'accepted' ? 'معتمدة' : 'متجاهلة'})\n📝 ${s.title}` : `Already handled ✓ (${s.state})\n📝 ${s.title}`),
      ));
    if (verb === 'ok') {
      s.task_id = await createFromSuggestion(admin, me.id, item, s, create);
      s.state = 'accepted';
      await saveItem(admin, item);
      const who = nameOf(s.owner_id);
      await sendWhatsApp(
        from,
        rtl(
          ar
            ? `تم ✅ اعتمدتها\n📝 ${s.title}\n${who ? (s.owner_id === me.id ? '👤 هي عندك، وأذكّرك قبل الموعد ⏰' : `👤 وصلت لـ ${who}، وأنا أتابع معه لين يخلص 💪`) : '👤 ما لها أحد للحين، اختر لها شخص من منتج'}`
            : `Done ✅ Approved\n📝 ${s.title}\n${who ? (s.owner_id === me.id ? '👤 It’s yours, I’ll remind you before it’s due ⏰' : `👤 Sent to ${who}, I’ll follow up until it’s done 💪`) : '👤 Nobody owns it yet, pick someone in Muntej'}`,
        ),
      );
    } else {
      s.state = 'ignored';
      await saveItem(admin, item);
      await sendWhatsApp(from, rtl(ar ? `تمام 👍 تجاهلتها\n📝 ${s.title}` : `OK 👍 Ignored\n📝 ${s.title}`));
    }
    return;
  }

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

  const ids = (team ?? []).map((p) => p.id as string);
  const { data: open } = await admin
    .from('tasks')
    .select('id, title, owner_id')
    .in('status', OPEN)
    .in('owner_id', ids.length ? ids : [me.id]);
  // their last WhatsApp request from the past 30 minutes that still waits: this message may only change it
  // ("make it tomorrow", "give it to someone in QE"), like a follow-up in a chat
  const { data: prev } = await admin
    .from('incoming_items')
    .select('*')
    .eq('owner_id', me.id)
    .eq('source', 'whatsapp')
    .eq('status', 'new')
    .gte('received_at', new Date(Date.now() - 30 * 60_000).toISOString())
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const earlier = prev as Item | null;
  const earlierOpen = (earlier?.suggestions ?? []).filter((s) => s.state === 'new');
  const item = await ingestMessage(admin, {
    delegating: true,
    earlier: earlier && earlierOpen.length ? { text: earlier.body, tasks: earlierOpen.map((s) => ({ title: s.title, owner_id: s.owner_id, due_at: s.due_at })) } : null,
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
  // a change to the earlier request: the new version replaces the old one (no second task)
  const amended = !!earlier && earlierOpen.length > 0 && item.suggestions.some((s) => s.amends_earlier);
  if (amended) {
    for (const s of earlier!.suggestions) if (s.state === 'new') s.state = 'ignored';
    await saveItem(admin, earlier!);
  }
  // one small card per task (title, who, when, what to send back), each line on its own so Arabic and English
  // never mix on one line; RLM keeps Arabic lines right-aligned even when they start with an emoji or a number
  const PROOF: Record<string, [string, string]> = { file: ['ملف', 'a file'], image: ['صورة', 'a photo'], link: ['رابط', 'a link'], any: ['أي إثبات', 'any proof'] };
  const card = (s: (typeof item.suggestions)[number]) => {
    const who = nameOf(s.owner_id) ?? (ar ? 'ما حددت أحد، اختره من منتج' : 'Nobody yet, pick them in Muntej');
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(ar ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { ...o, timeZone: 'Asia/Riyadh' }).format(new Date(s.due_at!));
    const when = s.due_at ? `${fmt({ weekday: 'long', day: 'numeric', month: 'long' })} · ${fmt({ hour: 'numeric', minute: '2-digit' })}` : ar ? 'بدون موعد' : 'No deadline';
    const proof = PROOF[s.proof_required ?? 'none'];
    return [
      `📝 *${s.title}*`,
      `👤 ${ar ? 'لـ' : 'For'}: ${who}`,
      `⏰ ${ar ? 'الموعد' : 'Due'}: ${when}`,
      ...(proof ? [`📎 ${ar ? 'يرسل لك' : 'Sends you'}: ${ar ? proof[0] : proof[1]}`] : []),
    ].join('\n');
  };
  const count = ar ? (n === 1 ? 'مهمة جديدة' : n === 2 ? 'مهمتين' : `${n} مهام`) : `${n} new task${n > 1 ? 's' : ''}`;
  if (!n) return void (await sendWhatsApp(from, ar ? 'قريتها ✓ بس ما لقيت فيها مهمة 🤔' : 'Got it ✓ but I didn’t find a task in it 🤔'));
  const head = amended
    ? ar
      ? 'تمام ✏️ عدّلتها، هذي النسخة الجديدة'
      : 'Done ✏️ I updated it, here’s the new version'
    : ar
      ? `تمام ✅ لقيت ${count}`
      : `Done ✅ I found ${count}`;
  // several tasks: a short heading, then each task with its own buttons
  if (n > 1) await sendWhatsApp(from, rtl(ar ? `${head}، كل وحدة تحتها أزرارها 👇` : `${head}, each with its own buttons 👇`));
  for (const [i, s] of item.suggestions.entries())
    await sendButtons(
      from,
      rtl(n === 1 ? `${head}:\n\n${card(s)}` : card(s)),
      [
        { id: `ok:${item.id}:${i}`, title: ar ? '✅ اعتمد' : '✅ Approve' },
        { id: `no:${item.id}:${i}`, title: ar ? '✖️ تجاهل' : '✖️ Ignore' },
      ],
      ar ? 'وأنا أتابع الباقي 💪' : 'I’ll handle the rest 💪',
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
