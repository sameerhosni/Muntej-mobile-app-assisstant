// whatsapp — Muntej's own WhatsApp number (Meta WhatsApp Cloud API webhook): Saree3 on WhatsApp, the same as in the app.
// A text or voice note is a turn of the person's chat with Saree3 (muntej-chat, run as them): questions, new tasks,
// changes, moves, bulk changes, team and objectives. Its cards come back as reply buttons (Confirm, pick one, Undo).
// Decisions, reviews, tasks found in their tools and their own check-ins are answered with buttons too
// (_shared/wa-actions.ts). A FORWARDED message is someone else's: the tasks in it wait for the person's OK, as before.
//   GET   Meta's webhook check (hub.verify_token = WHATSAPP_VERIFY_TOKEN → echo hub.challenge)
//   POST  incoming messages (signed by Meta: X-Hub-Signature-256 with WHATSAPP_APP_SECRET); answered 200 at once,
//         the work continues in the background (EdgeRuntime.waitUntil) so Meta never retries a slow voice note
//   POST  with x-cron-secret: setup (register the number, subscribe the app, create the report templates, status)
// The sender is matched by their WhatsApp number (Connect your tools → WhatsApp → "My WhatsApp number").
// Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, OPENAI_API_KEY.
// Deployed without JWT checks (Meta calls it), so the signature check is what keeps strangers out.
import { corsHeaders } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { createFromSuggestion, ingestMessage, OPEN, saveItem, type Creator, type Item } from '../_shared/intake-core.ts';
import {
  ACTION_TEMPLATE,
  CODE_TEMPLATE,
  INVITE_TEMPLATE,
  callAs,
  capture,
  pend,
  pending,
  REPORT_TEMPLATE,
  rtl as rtlOf,
  userDb,
  userToken,
  waButtons,
  waList,
  waText,
  waTyping,
  type WaButton,
  type WaRow,
} from '../_shared/wa.ts';
import { lateTeamLines, MAX_LIST, needsYouCards, parsePick, sendCards, toolListButtons, toolListText, waProfileFor, whenText, type Pick, type WaCard } from '../_shared/wa-actions.ts';
import { newPin, sessionFor, sha256 } from '../_shared/phone-session.ts';
import { phCapture } from '../_shared/posthog.ts';

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
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  /** a tap on a template's quick-reply button */
  button?: { payload?: string; text?: string };
  context?: { forwarded?: boolean; frequently_forwarded?: boolean };
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
  // one-time setup from the server itself (x-cron-secret): register the number, let Meta send this app the number's
  // messages, set the business profile, create the report templates, and report the number's status. The keys never
  // leave the server.
  const cron = Deno.env.get('CRON_SECRET');
  if (cron && req.headers.get('x-cron-secret') === cron) {
    const o = JSON.parse(raw || '{}');
    // a dry run of one incoming message from a linked number: everything runs, the replies come back here unsent
    // (and the 24 h window is left alone). Note: a chat turn is real (saved in their chat, changes really happen).
    if (o.simulate) {
      capture.on = true;
      capture.out = [];
      const sim = o.simulate as { from: string; text?: string; tap?: string; forwarded?: boolean };
      await handle(
        {
          id: `sim-${Date.now()}`,
          from: sim.from,
          type: sim.tap ? 'interactive' : 'text',
          text: { body: sim.text ?? '' },
          ...(sim.tap ? { interactive: { type: 'button_reply', button_reply: { id: sim.tap, title: '' } } } : {}),
          ...(sim.forwarded ? { context: { forwarded: true } } : {}),
        },
        true,
      );
      capture.on = false;
      return new Response(JSON.stringify({ sent: capture.out }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(await setup(o)), { headers: { 'Content-Type': 'application/json' } });
  }
  if (!(await signedByMeta(raw, req.headers.get('x-hub-signature-256')))) return new Response('Bad signature', { status: 401 });
  const body = JSON.parse(raw || '{}') as { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };
  const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  const work = Promise.all(messages.map((m) => handle(m).catch((e) => console.error('whatsapp message', m.id, String(e)))));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;
  return new Response('ok');
});

// the report and action templates (Meta approves "utility" templates in minutes to a day). Variables can't open or
// close a template, so each starts with a greeting.
const TEMPLATES = [
  {
    name: REPORT_TEMPLATE(),
    ar: { text: 'هلا {{1}}، تقريرك جاهز 📋\n{{2}}\nاضغط «وريني» وأرسله لك هنا كامل.', button: 'وريني', ex: ['أحمد', '☀️ تقرير الصباح: ٣ مخاطر · ٢ قرارات · ٥ إنجازات'] },
    en: { text: 'Hi {{1}}, your report is ready 📋\n{{2}}\nTap "Show me" and I will send it here in full.', button: 'Show me', ex: ['Ahmed', '☀️ Morning report: 3 risks · 2 decisions · 5 wins'] },
  },
  {
    name: ACTION_TEMPLATE(),
    ar: { text: 'هلا {{1}}، فيه شي يحتاجك 📌\n{{2}}\nاضغط «وريني» وتقرر من هنا بضغطة.', button: 'وريني', ex: ['أحمد', 'فيصل يطلب يوم زيادة في «تقرير المبيعات»'] },
    en: { text: 'Hi {{1}}, something needs you 📌\n{{2}}\nTap "Show me" and decide right here.', button: 'Show me', ex: ['Ahmed', 'Faisal asks for one more day on "Sales report"'] },
  },
];

// the team invite (a personal PIN + a one-time join link) and the sign-in code (Meta's authentication format)
const JOIN_URL = 'https://nizamy-muntej.expo.app/join.html?t={{1}}';
const MORE_TEMPLATES = (lang: 'ar' | 'en') => [
  {
    name: INVITE_TEMPLATE(),
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text:
          lang === 'ar'
            ? 'هلا {{1}} 👋\n{{2}} أضافك لفريق {{3}} على منتج، عشان توصلك مهامك وتتابعها بسهولة.\nاضغط «ادخل منتج» وتبدأ على طول.'
            : 'Hi {{1}} 👋\n{{2}} added you to the {{3}} team on Muntej, so your tasks reach you and are easy to follow.\nTap "Join Muntej" to start.',
        example: { body_text: [lang === 'ar' ? ['فيصل', 'أحمد', 'نظامي'] : ['Faisal', 'Ahmed', 'Nizamy']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'URL', text: lang === 'ar' ? 'ادخل منتج' : 'Join Muntej', url: JOIN_URL, example: ['https://nizamy-muntej.expo.app/join.html?t=abc123'] }] },
    ],
  },
  {
    name: CODE_TEMPLATE(),
    category: 'AUTHENTICATION',
    components: [
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }] },
    ],
  },
];

/** register the number (2-step PIN), subscribe the app to its WhatsApp account, templates, profile, status */
async function setup(o: {
  pin?: string;
  about?: string;
  description?: string;
  business?: string;
  waba?: string;
  test_to?: string;
  /** create the templates (existing ones just report their status) */
  templates?: boolean;
  /** only the invite / code templates */
  more_only?: boolean;
  /** also the sign-in code template (Meta must allow authentication templates for this account) */
  code_template?: boolean;
  /** just list the templates and why Meta rejected any */
  template_status?: boolean;
}) {
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
  if (o.pin && !o.templates && !o.template_status) out.register = await call(`${phone}/register`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin: o.pin }) });
  if (o.about || o.description)
    out.profile = await call(`${phone}/whatsapp_business_profile`, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', vertical: 'PROF_SERVICES', ...(o.about ? { about: o.about } : {}), ...(o.description ? { description: o.description } : {}) }),
    });
  // the report / action templates, Arabic and English (an existing one just reports its status)
  if (o.templates)
    for (const w of wabas.slice(0, 1)) {
      const made: unknown[] = [];
      for (const t of o.more_only ? [] : TEMPLATES)
        for (const lang of ['ar', 'en'] as const)
          made.push({
            name: t.name,
            lang,
            ...(await call(`${w}/message_templates`, {
              method: 'POST',
              body: JSON.stringify({
                name: t.name,
                language: lang,
                category: 'UTILITY',
                components: [
                  { type: 'BODY', text: t[lang].text, example: { body_text: [t[lang].ex] } },
                  { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: t[lang].button }] },
                ],
              }),
            })),
          });
      for (const lang of ['ar', 'en'] as const)
        for (const t of MORE_TEMPLATES(lang).filter((x) => o.code_template || x.category !== 'AUTHENTICATION'))
          made.push({ name: t.name, lang, ...(await call(`${w}/message_templates`, { method: 'POST', body: JSON.stringify({ ...t, language: lang }) })) });
      out.templates = made;
    }
  if (o.templates || o.template_status)
    for (const w of wabas.slice(0, 1)) {
      out.template_status = (await call(`${w}/message_templates?fields=name,language,status,category,rejected_reason&limit=50`)).body;
    }
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

type Me = { id: string; user_id: string; account_id: string; locale: string | null; full_name: string };
type ChatMsg = { id: string; content: string; action: string; payload: Record<string, unknown> | null };

// the few words that skip the chat (Saudi and English ways of saying them)
const SAYS_REPORT = /^(ملخص|الملخص|تقرير|التقرير|تقريري|report|my report|summary|brief)[\s؟?!.]*$/i;
const SAYS_NEEDS = /^(وش يحتاجني|ايش يحتاجني|إيش يحتاجني|وش علي|وش عندي|what needs me|needs me|what's waiting|whats waiting)[\s؟?!.]*$/i;
// asking for a sign-in code (the app opens WhatsApp with this text ready to send)
const SAYS_CODE = /^(رمز الدخول|رمز دخول|الرمز|رمز|دخول|ادخل|sign[- ]?in code|login code|code|login)[\s؟?!.]*$/i;
const SAYS_HELP = /^(مساعدة|ساعدني|help|\?|؟|وش تقدر تسوي|what can you do)[\s؟?!.]*$/i;

async function handle(m: WaMessage, dry = false) {
  const admin = adminClient();
  const from = m.from.replace(/\D/g, '');
  // signing in from the app ("دخول منتج #K7F3QX", sent with one tap): approve that key for whoever this number is
  const login = m.type === 'text' ? (m.text?.body ?? '').match(/#([A-Z0-9]{6})\b/i) : null;
  if (login) {
    const { data: known } = await admin.from('profiles').select('id, locale').eq('phone', from).neq('status', 'deleted').eq('hidden', false).order('created_at').limit(1);
    const who = (known ?? [])[0];
    const ar = who?.locale !== 'en';
    if (!who)
      return void (await waText(
        from,
        'رقم الواتساب هذا مو مسجّل في منتج 🤔 اطلب من مديرك يضيفك بنفس الرقم، أو ادخل بإيميلك.\n\nThis WhatsApp number isn’t in Muntej. Ask your manager to add you with it, or sign in with your email.',
      ));
    if (!dry)
      await admin
        .from('wa_logins')
        .update({ profile_id: who.id, phone: from, approved_at: new Date().toISOString() })
        .eq('nonce', login[1].toUpperCase())
        .is('approved_at', null);
    await admin.from('profiles').update({ wa_last_inbound_at: new Date().toISOString() }).eq('phone', from);
    return void (await waText(from, ar ? 'تم ✅ ارجع لمنتج، دخّلتك 👋' : 'Done ✅ Go back to Muntej, you’re in 👋'));
  }
  // a sign-in code: anyone Muntej knows by this number, invited (no login yet) or not
  if (m.type === 'text' && SAYS_CODE.test((m.text?.body ?? '').trim())) {
    const { data: known } = await admin.from('profiles').select('id, locale').eq('phone', from).neq('status', 'deleted').eq('hidden', false).limit(1);
    const who = (known ?? [])[0];
    if (!who)
      return void (await waText(
        from,
        'رقمك مو مسجّل في منتج 🤔 اطلب من مديرك يضيفك برقم جوالك، أو ادخل بإيميلك.\n\nThis number isn’t in Muntej yet. Ask your manager to add you with it, or sign in with your email.',
      ));
    const code = newPin();
    if (!dry)
      await admin.from('phone_codes').upsert({ phone: from, code_hash: await sha256(`${from}:${code}`), tries: 0, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    const ar = who.locale !== 'en';
    return void (await waText(
      from,
      ar ? `رمز دخولك لمنتج: *${code}*\nصالح ١٠ دقايق. لا تعطيه أحد 🔒` : `Your Muntej sign-in code: *${code}*\nValid for 10 minutes. Don’t share it 🔒`,
    ));
  }
  // who sent it: their WhatsApp number on their profile; with several accounts, the one they work in now
  const findPeople = () =>
    admin.from('profiles').select('id, user_id, account_id, locale, full_name').eq('phone', from).eq('status', 'active').eq('hidden', false).not('user_id', 'is', null);
  let { data: people } = await findPeople();
  if (!people?.length) {
    // in the team already (their manager added this mobile) but never signed in: writing from that number proves it's
    // theirs, so this is their first sign-in, and the setup happens right here (onboarding release 3)
    const { data: invited } = await admin
      .from('profiles')
      .select('id, user_id, email, locale')
      .eq('phone', from)
      .neq('status', 'deleted')
      .eq('hidden', false)
      .order('created_at')
      .limit(1);
    if (invited?.length) {
      try {
        await sessionFor(admin, { ...invited[0], phone: from });
        ({ data: people } = await findPeople());
      } catch (e) {
        console.warn('whatsapp first sign-in', String(e));
      }
    }
    if (!people?.length && invited?.length) {
      await admin.from('profiles').update({ wa_last_inbound_at: new Date().toISOString() }).eq('id', invited[0].id);
      return void (await waText(
        from,
        invited[0].locale === 'en'
          ? 'Hi! 👋 Your team is already on Muntej. Install the app, choose "Sign in with my mobile number", and send me "Sign-in code" here: I reply with your code. Then talk to me here about your tasks anytime.'
          : 'هلا! 👋 فريقك موجود في منتج. نزّل التطبيق، اختر «ادخل برقم جوالي»، وأرسل لي هنا «رمز الدخول» وأرد عليك بالرمز. وبعدها كلّمني هنا عن مهامك أي وقت.',
      ));
    }
    if (!people?.length) {
      await waText(
        from,
        'هلا! 👋 رقمك مو مربوط بمنتج للحين. افتح منتج ← اربط أدواتك ← واتساب، وأضف رقمك. وبعدها كلّمني هنا مثل التطبيق بالضبط.\n\nHi! Your number isn’t linked to Muntej yet. Open Muntej → Connect your tools → WhatsApp and add it.',
      );
      return;
    }
  }
  // the 24 h window opens (or stays open) with every message they send
  // (writing to Muntej's number proves the number is theirs: WhatsApp counts as connected for alerts and reports)
  if (!dry)
    await admin
      .from('profiles')
      .update({ wa_last_inbound_at: new Date().toISOString(), whatsapp_connected: true })
      .in('id', people.map((p) => p.id));
  // the same pick as the reports (waProfileFor), so a report and its buttons talk about the same account
  const pick = people.length > 1 ? await waProfileFor(admin, from) : people[0].id;
  const me = (people.find((p) => p.id === pick) ?? people[0]) as Me;
  const ar = me.locale !== 'en';
  const lang = ar ? 'ar' : 'en';
  const rtl = (s: string) => rtlOf(ar, s);
  const say = (s: string) => waText(from, rtl(s));
  if (!dry) await waTyping(m.id).catch(() => false);
  // PostHog: how people use WhatsApp (what kind of message, never its words)
  if (!dry)
    await phCapture([
      {
        distinctId: me.id,
        event: 'whatsapp_message',
        properties: {
          type: m.type,
          tap: (m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? m.button?.payload ?? '').split(':')[0] || null,
          forwarded: !!m.context?.forwarded,
        },
      },
    ]);

  // an invited manager / employee who hasn't set up yet: the same short setup as the app's chat, right here
  const { data: ob } = await admin.from('onboarding').select('kind, account_named, finished_at').eq('profile_id', me.id).maybeSingle();
  const setupOpen = ob?.kind === 'member' && !ob.finished_at && !ob.account_named;

  // ── taps ──
  const tapped = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? (m.type === 'button' ? m.button?.payload : undefined);
  if (tapped) return void (await onTap(tapped));
  // the first message they send before setting up: Saree3 says hello and confirms what's filled in (once)
  if (setupOpen && !(await pendingKey(`obw:${me.id}`, 7 * 24 * 60))) return void (await obWelcome());

  // ── what they said: a text, or a voice note written down ──
  let text = '';
  if (m.type === 'text') text = m.text?.body ?? '';
  else if (m.type === 'audio' || m.type === 'voice') text = await transcribe((m.audio ?? m.voice)!.id, ar);
  else return void (await say(ar ? 'أرسل لي نص أو رسالة صوتية 🎤 وأنا أتصرف' : 'Send me a text or a voice note 🎤 and I’ll take it from there'));
  text = text.trim();
  if (!text) return void (await say(ar ? 'ما سمعت شي واضح في الرسالة 🤔 جرّب مرة ثانية؟' : 'I couldn’t hear anything clear 🤔 Try again?'));

  // "send it back": the next message is what needs changing
  const { data: note } = await admin
    .from('wa_pending')
    .select('body')
    .eq('key', `note:${me.id}`)
    .gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
    .maybeSingle();
  if (note) {
    await admin.from('wa_pending').delete().eq('key', `note:${me.id}`);
    const taskId = (note.body as { task_id: string }).task_id;
    const db = userDb(await userToken(admin, me.user_id));
    const { error } = await db.rpc('set_task_status', { p_task: taskId, p_status: 'returned', p_note: text });
    return void (await say(
      error
        ? (ar ? `ما قدرت أرجّعها 😕 ${error.message}` : `I couldn’t send it back 😕 ${error.message}`)
        : ar
          ? 'تم ↩️ رجّعتها له مع ملاحظتك، وأتابع معه لين يعدّلها 💪'
          : 'Done ↩️ Sent back with your note. I’ll follow up until it’s fixed 💪',
    ));
  }

  // "something's wrong" in their setup: this message says what, and goes to their manager as a task to fix it
  if (await pendingKey(`obfix:${me.id}`, 30)) {
    await admin.from('wa_pending').delete().eq('key', `obfix:${me.id}`);
    const f = await setupFacts();
    await chat({ message: ar ? `اطلب من ${f.boss ?? 'مديري'} يصحّح بياناتي في منتج: ${text}` : `Ask ${f.boss ?? 'my manager'} to fix my details in Muntej: ${text}`, source: 'text' });
    return void (await obOk());
  }

  // numbers after the list of tasks found in tools ("1 3 5", "تجاهل 2 6", "الكل"): approve / ignore in one go
  const chosen = parsePick(text);
  if (chosen && (await toolList())) return void (await applyPick(chosen));

  if (SAYS_HELP.test(text)) return void (await say(helpText(ar)));
  if (SAYS_NEEDS.test(text)) return void (await needsYou(10));
  if (SAYS_REPORT.test(text)) return void (await report('auto'));

  // someone else's message they forwarded: the tasks in it wait for their OK (Approve / Ignore), as before
  if (m.context?.forwarded || m.context?.frequently_forwarded) return void (await ingestForwarded(text));

  // everything else is a turn of their chat with Saree3, as them
  await chat({ message: text, source: m.type === 'text' ? 'text' : 'voice' });

  // ─── helpers (they share me / from / lang) ───

  async function chat(body: Record<string, unknown>) {
    try {
      const token = await userToken(admin, me.user_id);
      const out = await callAs<{ messages: ChatMsg[] }>(token, 'muntej-chat', { ...body, lang, channel: 'whatsapp' });
      const bot = [...(out.messages ?? [])].reverse().find((x) => x && (x as { role?: string }).role !== 'user') ?? out.messages?.at(-1);
      if (bot) await render(bot);
    } catch (e) {
      console.error('whatsapp chat', String(e));
      await say(ar ? `ما زبطت معي 😅 ${String((e as Error).message ?? e).slice(0, 160)}` : `That didn’t work 😅 ${String((e as Error).message ?? e).slice(0, 160)}`);
    }
  }

  /** Saree3's reply in WhatsApp: his words, then the card as buttons (or a list when there are more than 3 choices) */
  async function render(bot: ChatMsg) {
    const p = (bot.payload ?? {}) as Record<string, any>;
    const lines: string[] = [bot.content];
    const buttons: WaButton[] = [];
    let list: { button: string; rows: WaRow[] } | null = null;
    const act = async (title: string, body: Record<string, unknown>) => buttons.push({ id: `c:${await pend(admin, me.id, body)}`, title });
    const no = () => buttons.push({ id: 'x:', title: ar ? '✖️ لا، خلّها' : '✖️ No, leave it' });
    const confirm = ar ? '✅ أكّد' : '✅ Confirm';
    const card = (t: { title: string; owner_name?: string | null; due_at?: string | null }) =>
      [`📝 *${t.title}*`, `👤 ${t.owner_name ?? (ar ? 'ما لها أحد' : 'Nobody yet')}`, ...(t.due_at ? [`⏰ ${whenText(t.due_at, ar)}`] : [])].join('\n');

    if (p.confirm_update && p.proposed_patch && p.id) {
      await act(confirm, { chat: { apply: { task_id: p.id, patch: p.proposed_patch } } });
      no();
    } else if (p.confirm_delete && p.id) {
      await act(ar ? '🛑 ألغها' : '🛑 Cancel it', { rpc: 'cancel_task', args: { p_task: p.id }, done: ar ? 'ألغيتها 🛑 ووقفت متابعتها' : 'Cancelled 🛑 and stopped its follow-ups' });
      await act(ar ? '🗑 احذفها' : '🗑 Delete it', { rpc: 'delete_task', args: { p_task: p.id }, done: ar ? 'حذفتها 🗑' : 'Deleted 🗑' });
      no();
    } else if (Array.isArray(p.candidates)) {
      const rows: WaRow[] = [];
      for (const c of p.candidates.slice(0, 10))
        rows.push({
          id: `c:${await pend(admin, me.id, { chat: { message: p.original_message, focus_task_id: c.id } })}`,
          title: c.title,
          description: [c.owner_name, c.due_at ? whenText(c.due_at, ar) : null].filter(Boolean).join(' · '),
        });
      list = { button: ar ? 'اختر المهمة' : 'Pick the task', rows };
    } else if (p.bulk_proposal) {
      const b = p.bulk_proposal;
      lines.push('', ...b.items.slice(0, 8).map((i: any) => `• ${i.title}${i.owner_name ? ` (${i.owner_name})` : ''}`));
      if (b.items.length > 8) lines.push(ar ? `+${b.items.length - 8} غيرها` : `+${b.items.length - 8} more`);
      // no tick boxes on WhatsApp: leaving some out is one more message
      lines.push('', ar ? 'تبي تستثني وحدة؟ قل لي «كلها إلا …»' : 'Want to leave one out? Say "all except …"');
      await act(ar ? `✅ طبّقها (${b.items.length})` : `✅ Apply (${b.items.length})`, { chat: { apply_bulk: { ids: b.items.map((i: any) => i.id), change: b.change } } });
      no();
    } else if (p.people_choice) {
      const c = p.people_choice;
      const rows: WaRow[] = [];
      for (const person of c.people.slice(0, 9))
        rows.push({ id: `c:${await pend(admin, me.id, { chat: { apply_create: { task: c.task, owner_ids: [person.id] } } })}`, title: person.name ?? '…' });
      if (c.can_share)
        rows.push({
          id: `c:${await pend(admin, me.id, { chat: { apply_create: { task: c.task, owner_ids: c.people.map((x: any) => x.id), mode: 'shared' } } })}`,
          title: ar ? '👥 كلهم سوا' : '👥 All of them together',
        });
      if (rows.length <= 3) for (const r of rows) buttons.push({ id: r.id, title: r.title });
      else list = { button: ar ? 'اختر الشخص' : 'Pick the person', rows };
    } else if (p.duplicate) {
      const d = p.duplicate;
      lines.push('', card(d.existing));
      await act(ar ? '✏️ حدّث الموجودة' : '✏️ Update that one', { chat: { apply: { task_id: d.existing.id, patch: d.patch } } });
      await act(ar ? '➕ سوّ جديدة' : '➕ Make a new one', { chat: { apply_create: { task: d.task, force: true } } });
      no();
    } else if (p.team_draft) {
      const d = p.team_draft;
      lines.push('', ...(d.names as string[]).map((x) => `• ${x}`), ...(d.count > d.names.length ? [ar ? `+${d.count - d.names.length} غيرهم` : `+${d.count - d.names.length} more`] : []));
      lines.push('', ar ? 'تبي تعدّل؟ افتح منتج ← فريقك ← ابنِ فريقك' : 'Want to fix something first? Open Muntej → Team → Build your team');
      await act(ar ? '✅ أكّد الفريق' : '✅ Confirm the team', { team_apply: d.id });
      no();
    } else if (p.org_proposal || p.objective_proposal || p.recurring_proposal) {
      const o = p.org_proposal ?? p.objective_proposal ?? p.recurring_proposal;
      if (o.summary_lines?.length) lines.push('', ...o.summary_lines.map((l: string) => `• ${l}`));
      await act(
        confirm,
        p.org_proposal
          ? { chat: { apply_org: { patch: o.patch } } }
          : p.objective_proposal
            ? { chat: { apply_objective: { op: o.op, objective_id: o.objective_id, patch: o.patch } } }
            : { chat: { apply_recurring: { recurring_id: o.recurring_id, patch: o.patch } } },
      );
      no();
    } else if (p.brief) {
      const rows = (p.brief.rows ?? []) as any[];
      lines.push('', ...rows.slice(0, 10).map((r) => `• ${[r.person_name, r.task_title && `«${r.task_title}»`, r.metric].filter(Boolean).join(' · ')}${r.note ? `\n   ${r.note}` : ''}`));
      const fixes = rows.filter((r) => r.action);
      // what "Do all" will do, one line per fix
      if (fixes.length)
        lines.push(
          '',
          ar ? '⚡ اقتراحي:' : '⚡ My fixes:',
          ...fixes.map((r) =>
            r.action.kind === 'owner'
              ? `• «${r.task_title}» ← ${ar ? 'حوّلها لـ' : 'move to'} ${r.action.to_name ?? '…'}`
              : `• «${r.task_title}» ← ${ar ? 'موعدها' : 'due'} ${r.action.due_at ? whenText(r.action.due_at, ar) : '…'}`,
          ),
        );
      if (fixes.length)
        await act(ar ? `⚡ سوّها كلها (${fixes.length})` : `⚡ Do all (${fixes.length})`, {
          chat: {
            apply_brief: {
              source_id: bot.id,
              items: fixes.map((r) => ({ key: r.key, kind: r.action.kind, task_id: r.action.task_id, owner_id: r.action.owner_id, due_at: r.action.due_at })),
            },
          },
        });
    } else if (p.bulk_done?.log_id || p.bulk_done?.log_ids?.length) {
      await act(ar ? '↩️ تراجع' : '↩️ Undo', p.bulk_done.log_ids?.length ? { chat: { undo_log_ids: p.bulk_done.log_ids } } : { chat: { undo_log_id: p.bulk_done.log_id } });
    } else if (Array.isArray(p.created_list) && p.created_list.length) {
      lines.push('', ...p.created_list.map((t: any) => card(t)));
    } else if (typeof p.id === 'string' && (bot.action === 'created' || bot.action === 'updated')) {
      lines.push('', card(p as any));
      if (p.undo_log_id) await act(ar ? '↩️ تراجع' : '↩️ Undo', { chat: { undo_log_id: p.undo_log_id } });
    }
    // ideas for what to say next: a short list, only when nothing else is waiting for a tap
    if (!buttons.length && !list && Array.isArray(p.suggestions) && p.suggestions.length) {
      const rows: WaRow[] = [];
      for (const s of (p.suggestions as string[]).slice(0, 5)) rows.push({ id: `c:${await pend(admin, me.id, { chat: { message: s } })}`, title: s, description: s.length > 24 ? s : undefined });
      list = { button: ar ? '💡 وش بعد؟' : '💡 What next?', rows };
    }

    const body = rtl(lines.join('\n').trim());
    if (list) await waList(from, body, list.button, list.rows);
    else if (buttons.length) await waButtons(from, body, buttons);
    else await waText(from, body);
  }

  async function onTap(id: string) {
    const [verb, ...rest] = id.split(':');
    if (verb === 'x') return void (await say(ar ? 'تمام 👍 ما غيّرت شي' : 'OK 👍 nothing changed'));
    if (verb === 'c') {
      const action = await pending(admin, me.id, rest[0]);
      if (!action) return void (await say(ar ? 'هالزر قديم شوي ⌛ قل لي وش تبي من جديد' : 'That button is a bit old ⌛ Tell me again what you need'));
      await admin.from('wa_pending').delete().eq('key', rest[0]);
      if (action.chat) return void (await chat(action.chat as Record<string, unknown>));
      if (action.team_apply) {
        // confirm a team drawn from the chat, as them (same as Confirm on Review your team)
        const token = await userToken(admin, me.user_id);
        const { data: draft } = await userDb(token).from('team_drafts').select('people').eq('id', action.team_apply).maybeSingle();
        if (!draft) return void (await say(ar ? 'ما لقيت هالفريق 🤔' : 'I couldn’t find that team 🤔'));
        try {
          const r = await callAs<{ created: number; updated: number; failed: { name: string; error: string }[] }>(token, 'team-import', {
            action: 'apply',
            draft_id: action.team_apply,
            people: draft.people,
          });
          return void (await say(
            (ar ? `تم ✅ فريقك جاهز: ${r.created} انضافوا، ${r.updated} تحدّثوا` : `Done ✅ Your team is in: ${r.created} added, ${r.updated} updated`) +
              (r.failed.length ? `\n${ar ? 'يحتاجون نظرة' : 'Need a look'}: ${r.failed.map((f) => f.name).join('، ')}` : '') +
              `\n${ar ? 'ادعهم من منتج ← فريقك 💌' : 'Invite them from Muntej → Team 💌'}`,
          ));
        } catch (e) {
          return void (await say(ar ? `ما قدرت أبني الفريق 😕 ${(e as Error).message}` : `I couldn’t build the team 😕 ${(e as Error).message}`));
        }
      }
      if (action.rpc) {
        const db = userDb(await userToken(admin, me.user_id));
        const { error } = await db.rpc(action.rpc as string, action.args as Record<string, unknown>);
        return void (await say(error ? (ar ? `ما قدرت 😕 ${error.message}` : `I couldn’t 😕 ${error.message}`) : (action.done as string)));
      }
      return;
    }
    if (verb === 'rep') return void (await report((rest[0] as 'daily' | 'midday' | 'evening') ?? 'auto'));
    if (verb === 'act') return void (await needsYou(10));
    // "✅ تمام" under a report: the tap itself keeps the 24 h window open
    if (verb === 'ack') return void (await say(ar ? 'تمام 👍 أنا ماسك الباقي. اسألني أي وقت عن مهامك أو فريقك.' : 'Great 👍 I’ve got the rest. Ask me anytime about your tasks or team.'));
    if (verb === 'd') return void (await decide(rest[0] as 'ok' | 'no' | 'mv', rest[1]));
    if (verb === 'r') return void (await review(rest[0] as 'ok' | 'back', rest[1]));
    if (verb === 'h') return void (await checkin(rest[0], rest[1]));
    if (verb === 'ok' || verb === 'no') return void (await suggestion(verb, rest[0], Number(rest[1])));
    // the setup on WhatsApp: right / something's wrong / remind my team
    if (verb === 'ob') {
      if (rest[0] === 'ok') return void (await obOk());
      if (rest[0] === 'remind') return void (await obRemind());
      if (rest[0] === 'fix') {
        await admin.from('wa_pending').upsert({ key: `obfix:${me.id}`, profile_id: me.id, body: {}, created_at: new Date().toISOString() });
        const f = await setupFacts();
        return void (await say(
          ar ? `وش الغلط؟ اكتبه وأوصله لـ${f.boss ?? 'مديرك'} يعدّله ✍️` : `What’s wrong? Type it and I’ll pass it to ${f.boss ?? 'your manager'} to fix ✍️`,
        ));
      }
    }
    // under the numbered list: all, none, or "type the numbers"
    if (verb === 'ta' || verb === 'ti') {
      if (!(await toolList())) return void (await say(ar ? 'هالقائمة قديمة شوي ⌛ قل «وش يحتاجني» وأرسلها لك من جديد' : 'That list is a bit old ⌛ Say "what needs me" and I’ll send it again'));
      return void (await applyPick({ all: verb === 'ta' ? 'approve' : 'ignore' }));
    }
    if (verb === 'tp')
      return void (await say(
        ar
          ? 'اكتب أرقام اللي تبي أعتمدها، مثل: 1 3 5 أو 1-4 ✍️\nوالباقي أتجاهله.\nأو اكتب «تجاهل 2 6» وأعتمد الباقي.'
          : 'Type the numbers to approve, e.g. 1 3 5 or 1-4 ✍️\nI’ll ignore the rest.\nOr type "ignore 2 6" and I’ll approve the rest.',
      ));
  }

  /** a wa_pending row for this key, younger than `minutes` */
  async function pendingKey(key: string, minutes: number) {
    const { data } = await admin.from('wa_pending').select('key').eq('key', key).gte('created_at', new Date(Date.now() - minutes * 60_000).toISOString()).maybeSingle();
    return !!data;
  }

  // ── the setup on WhatsApp (onboarding release 3): the same as the app's member chat ──
  async function setupFacts() {
    const first = (p: { full_name: string; full_name_ar: string | null } | null | undefined) => (p ? ((ar && p.full_name_ar) || p.full_name).split(' ')[0] : null);
    const { data: p } = await admin.from('profiles').select('manager_id, title, role, full_name, full_name_ar').eq('id', me.id).maybeSingle();
    const [{ data: boss }, { data: reports }, { data: acc }] = await Promise.all([
      p?.manager_id ? admin.from('profiles').select('full_name, full_name_ar').eq('id', p.manager_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from('profiles').select('id, full_name, full_name_ar, user_id, phone, email').eq('manager_id', me.id).neq('status', 'deleted').eq('hidden', false),
      admin.from('accounts').select('name').eq('id', me.account_id).maybeSingle(),
    ]);
    const team = (reports ?? []) as { id: string; full_name: string; full_name_ar: string | null; user_id: string | null; phone: string | null; email: string | null }[];
    return {
      name: first(p as never) ?? '',
      title: (p?.title as string | null) ?? null,
      manager: p?.role !== 'employee' || team.length > 0,
      boss: first(boss as never),
      company: (acc?.name as string | undefined) ?? (ar ? 'شركتك' : 'your company'),
      team,
      first,
    };
  }
  async function obWelcome() {
    const f = await setupFacts();
    await admin.from('wa_pending').upsert({ key: `obw:${me.id}`, profile_id: me.id, body: {}, created_at: new Date().toISOString() });
    const names = f.team.map((x) => f.first(x)).join('، ');
    const hello = f.manager
      ? ar
        ? `أهلاً ${f.name}! ${f.boss ? `${f.boss} ضافك في ${f.company}` : `انضميت لـ${f.company}`}، ودورك: ${f.title ?? 'مدير'}.${names ? `\nفريقك: ${names}.` : ''}`
        : `Hi ${f.name}! ${f.boss ? `${f.boss} added you to ${f.company}` : `You joined ${f.company}`}. Your role: ${f.title ?? 'manager'}.${names ? `\nYour team: ${names}.` : ''}`
      : ar
        ? `أهلاً ${f.name}! أنت في ${f.company}${f.boss ? `، في فريق ${f.boss}` : ''}.`
        : `Hi ${f.name}! You’re in ${f.company}${f.boss ? `, on ${f.boss}’s team` : ''}.`;
    await phCapture([{ distinctId: me.id, event: 'setup_chat_open', properties: { role: f.manager ? 'manager' : 'employee', channel: 'whatsapp' } }]);
    await waButtons(
      from,
      rtl(`${hello}\n\n${ar ? 'أنا سريع: أوصلك شغلك هنا، وأذكّرك، وأوصل ردودك، كلها بضغطة. صح؟' : 'I’m Saree3: I bring you your work here, remind you and pass on your answers, all with one tap. Right?'}`),
      [
        { id: 'ob:ok', title: ar ? '✅ صح' : '✅ Right' },
        { id: 'ob:fix', title: ar ? '✏️ فيه غلط' : '✏️ Something’s wrong' },
      ],
    );
  }
  async function obOk() {
    await admin.from('onboarding').update({ account_named: true, finished_at: new Date().toISOString() }).eq('profile_id', me.id);
    // set up on WhatsApp: reached here (an existing choice of theirs is kept, only WhatsApp is switched on)
    const { data: np } = await admin.from('notification_prefs').select('channels').eq('profile_id', me.id).maybeSingle();
    if (np) await admin.from('notification_prefs').update({ channels: { ...((np.channels as Record<string, boolean>) ?? {}), whatsapp: true } }).eq('profile_id', me.id);
    await admin.from('activity_log').insert({
      actor_type: 'muntej',
      subject_id: me.id,
      action: 'setup_done_whatsapp',
      summary: 'Set up on WhatsApp: details confirmed, reached on WhatsApp',
      summary_ar: 'جهّز حسابه في الواتساب: أكّد بياناته، والتنبيهات توصله بالواتساب',
      reason: 'setup chat on WhatsApp',
      undoable: false,
    });
    await phCapture([{ distinctId: me.id, event: 'setup_chat_done', properties: { channel: 'whatsapp' } }]);
    await say(ar ? 'تمام 👍 أوصلك كل شي هنا في الواتساب، وفي التطبيق لو نزّلته.' : 'Great 👍 I’ll bring you everything here on WhatsApp, and in the app if you install it.');
    const f = await setupFacts();
    // work already waiting for them, with its buttons (Got it / Need time / Need help)
    const { data: t } = await admin
      .from('tasks')
      .select('id, title, due_at, assigner_id')
      .eq('owner_id', me.id)
      .eq('status', 'assigned')
      .neq('assigner_id', me.id)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (t) {
      const giver = t.assigner_id ? await nameOf(t.assigner_id as string) : null;
      await waButtons(
        from,
        rtl(`${ar ? 'وهذي أول مهمة' : 'Your first task'}${giver ? (ar ? ` من ${giver.split(' ')[0]}` : ` from ${giver.split(' ')[0]}`) : ''}:\n📝 *${t.title}*${t.due_at ? `\n⏰ ${whenText(t.due_at as string, ar)}` : ''}`),
        [
          { id: `h:got_it:${t.id}`, title: ar ? '✅ وصلت' : '✅ Got it' },
          { id: `h:need_time:${t.id}`, title: ar ? '⏳ أحتاج وقت' : '⏳ Need time' },
          { id: `h:blocked:${t.id}`, title: ar ? '🆘 مساعدة' : '🆘 Need help' },
        ],
      );
    }
    const waiting = f.team.filter((x) => !x.user_id);
    if (f.manager && waiting.length)
      return void (await waButtons(
        from,
        rtl(ar ? `فريقك: ${waiting.map((x) => f.first(x)).join('، ')} ما دخلوا للحين.` : `Your team: ${waiting.map((x) => f.first(x)).join(', ')} haven’t joined yet.`),
        [{ id: 'ob:remind', title: ar ? '🔔 ذكّرهم الحين' : '🔔 Remind them now' }],
      ));
    if (!t) await say(ar ? 'أول ما يجيك شغل أوصله لك هنا. وكلّمني أي وقت: قل «وش يحتاجني» أو عطني مهمة بصوتك 🎤' : 'When work comes in, I’ll bring it here. Talk to me any time: say "what needs me" or give me a task by voice 🎤');
  }
  async function obRemind() {
    const f = await setupFacts();
    const ids = f.team.filter((x) => !x.user_id && (x.phone || x.email)).map((x) => x.id);
    let sent = 0;
    if (ids.length) {
      try {
        const out = await callAs<{ results: { whatsapp?: string; email?: string }[] }>(await userToken(admin, me.user_id), 'invite', { send: { person_ids: ids, channel: 'auto' } });
        sent = (out.results ?? []).filter((r) => r.whatsapp === 'sent' || r.email === 'invited').length;
      } catch (e) {
        console.warn('whatsapp remind', String(e));
      }
    }
    await say(
      sent
        ? ar ? `أرسلت لهم تذكير (${sent}) 🔔 وأبلّغك أول ما يدخلون.` : `Sent them a reminder (${sent}) 🔔 I’ll tell you when they join.`
        : ar ? 'ما قدرت أذكّرهم: ما عندهم جوال ولا إيميل يوصلهم. أضفها لهم من منتج ← فريقك.' : 'I couldn’t remind them: no phone or email reaches them yet. Add one in Muntej → Team.',
    );
  }

  /** the numbered list I sent last (within a day): which suggestion each number is */
  async function toolList(): Promise<{ item: string; index: number }[] | null> {
    const { data } = await admin
      .from('wa_pending')
      .select('body')
      .eq('key', `tools:${me.id}`)
      .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString())
      .maybeSingle();
    const refs = (data?.body as { refs?: { item: string; index: number }[] } | undefined)?.refs;
    return refs?.length ? refs : null;
  }

  /** approve / ignore the numbered tasks in one go, then one line back (same as Approve / Ignore on each card) */
  async function applyPick(p: Pick) {
    const refs = (await toolList()) ?? [];
    const chosen = new Set('nums' in p ? p.nums : []);
    const wrong = [...chosen].filter((n) => n < 1 || n > refs.length);
    const { data: rows } = await admin.from('incoming_items').select('*').eq('owner_id', me.id).in('id', [...new Set(refs.map((r) => r.item))]);
    const items = new Map(((rows ?? []) as Item[]).map((it) => [it.id, it]));
    const touched = new Set<string>();
    let added = 0;
    let ignored = 0;
    let before = 0;
    let noOwner = 0;
    const failed: string[] = [];
    for (const [n, r] of refs.entries()) {
      const item = items.get(r.item);
      const s = item?.suggestions[r.index];
      if (!item || !s) continue;
      if (s.state !== 'new') {
        before++;
        continue;
      }
      const listed = chosen.has(n + 1);
      // "approve all" and "the rest" leave out what is already a task
      const approve = 'all' in p ? p.all === 'approve' && !s.duplicate_of : p.approve ? listed : !listed && !s.duplicate_of;
      touched.add(item.id);
      if (!approve) {
        s.state = 'ignored';
        ignored++;
        continue;
      }
      try {
        s.task_id = await createFromSuggestion(admin, me.id, item, s, creator());
        s.state = 'accepted';
        added++;
        if (!s.owner_id) noOwner++;
      } catch (e) {
        console.warn('pick add failed', (e as Error).message);
        failed.push(s.title);
      }
    }
    for (const id of touched) await saveItem(admin, items.get(id)!);
    await admin.from('wa_pending').delete().eq('key', `tools:${me.id}`);
    const lines = [
      ar ? `تم ✅ اعتمدت ${added} وتجاهلت ${ignored}` : `Done ✅ Approved ${added}, ignored ${ignored}`,
      ...(noOwner ? [ar ? `👤 ${noOwner} منها ما لها أحد للحين، اختر لها شخص من منتج` : `👤 ${noOwner} have nobody yet, pick someone in Muntej`] : []),
      ...(before ? [ar ? `✓ ${before} كانت محسومة قبل` : `✓ ${before} were already handled`] : []),
      ...(wrong.length ? [ar ? `🤔 ما فيه رقم ${wrong.join('، ')} في القائمة` : `🤔 No number ${wrong.join(', ')} in the list`] : []),
      ...(failed.length ? [ar ? `😕 ما قدرت أضيف: ${failed.join('، ')}` : `😕 Couldn’t add: ${failed.join(', ')}`] : []),
    ];
    await say(lines.join('\n'));
  }

  /** tasks found in tools: one numbered message + all / none / choose (the numbers are kept for the reply) */
  async function sendToolList(tools: WaCard[]) {
    const refs = tools.slice(0, MAX_LIST).map((c) => c.ref!).filter(Boolean);
    await admin.from('wa_pending').upsert({ key: `tools:${me.id}`, profile_id: me.id, body: { refs }, created_at: new Date().toISOString() });
    await waText(from, toolListText(tools, ar));
    const b = toolListButtons(ar);
    await waButtons(from, b.body, b.buttons);
  }

  async function needsYou(max: number) {
    const [cards, late] = await Promise.all([needsYouCards(admin, me.id, ar), lateTeamLines(admin, me.id, ar)]);
    // the team's late work: not a decision for them (Saree3 chases it), but never hidden behind "nothing needs you"
    const lateText = () =>
      [
        ar
          ? late.count === 1 ? 'فيه مهمة متأخرة عند فريقك، وأنا أتابعها:' : `فيه ${late.count} مهام متأخرة عند فريقك، وأنا أتابعهم:`
          : `${late.count} task${late.count > 1 ? 's are' : ' is'} late with your team. I’m following up:`,
        ...late.lines,
        ...(late.count > late.lines.length ? [ar ? `و${late.count - late.lines.length} غيرها في منتج` : `+${late.count - late.lines.length} more in Muntej`] : []),
      ].join('\n');
    if (!cards.length) {
      if (!late.count) return void (await say(ar ? 'ما فيه شي يحتاجك الحين 👌 أنا ماسك الباقي' : 'Nothing needs you right now 👌 I’ve got the rest'));
      return void (await say(`${ar ? 'ما فيه قرار ينتظرك 👌' : 'No decision needs you 👌'}\n\n${lateText()}`));
    }
    await say(ar ? (cards.length === 1 ? 'فيه شي واحد يحتاجك 👇' : cards.length === 2 ? 'فيه شيئين يحتاجونك 👇' : cards.length <= 10 ? `فيه ${cards.length} أشياء تحتاجك 👇` : `فيه ${cards.length} شي يحتاجك 👇`) : `${cards.length} thing${cards.length > 1 ? 's' : ''} need${cards.length > 1 ? '' : 's'} you 👇`);
    // decisions, reviews and your own work stay one card each (each needs its own answer); tasks found in tools
    // come as one numbered list
    const tools = cards.filter((c) => c.kind === 'tool' && c.ref);
    const others = cards.filter((c) => !(c.kind === 'tool' && c.ref));
    if (others.length) await sendCards(from, ar, others, max);
    if (tools.length) await sendToolList(tools);
    if (late.count) await say(lateText());
  }

  /** their report now, on WhatsApp only (the right one for the time of day, or the one the template button names) */
  async function report(kind: 'daily' | 'midday' | 'evening' | 'auto') {
    try {
      const token = await userToken(admin, me.user_id);
      const out = await callAs<{ sent?: string[]; skipped?: string; preview?: string }>(token, 'daily-summary', { test: true, kind, only: 'whatsapp', dry });
      if (dry) return void capture.out.push({ report: out });
      if (!out.sent?.includes('whatsapp')) await say(ar ? 'ما فيه شي جديد يستاهل تقرير الحين 👌 كل شي ماشي' : 'Nothing new worth a report right now 👌 all moving');
    } catch (e) {
      await say(ar ? `ما قدرت أجهّز التقرير 😕 ${String((e as Error).message ?? e).slice(0, 120)}` : `I couldn’t make the report 😕 ${String((e as Error).message ?? e).slice(0, 120)}`);
    }
  }

  /** a decision, exactly like the Decisions screen (useResolveDecision): optional move, resolve, new date, log */
  async function decide(how: 'ok' | 'no' | 'mv', decisionId: string) {
    const db = userDb(await userToken(admin, me.user_id));
    const { data: d } = await db.from('decisions').select('*, task:tasks(title, owner_id)').eq('id', decisionId).maybeSingle();
    if (!d) return void (await say(ar ? 'ما لقيت هالقرار 🤔' : 'I couldn’t find that decision 🤔'));
    if (d.status !== 'pending') return void (await say(ar ? 'سبق وانحسم هالقرار ✓' : 'That decision is already made ✓'));
    const det = (d.details ?? {}) as Record<string, unknown>;
    const task = d.task as { title: string; owner_id: string | null } | null;
    const outcome = how === 'no' ? 'declined' : 'approved';
    const fail = async (e: { message: string } | null) => (e ? (await say(ar ? `ما قدرت 😕 ${e.message}` : `I couldn’t 😕 ${e.message}`), true) : false);
    let moveTo: { id: string; full_name: string; full_name_ar: string | null } | null = null;
    if (how === 'mv' && d.task_id && typeof det.suggested_owner_id === 'string') {
      const { data: p } = await db.from('profiles').select('id, full_name, full_name_ar').eq('id', det.suggested_owner_id).maybeSingle();
      moveTo = p;
      if (moveTo) {
        if (await fail((await db.from('tasks').update({ owner_id: moveTo.id }).eq('id', d.task_id)).error)) return;
        await db.from('tasks').update({ status: 'assigned' }).eq('id', d.task_id).eq('status', 'draft');
      }
    }
    if (await fail((await db.from('decisions').update({ status: outcome, resolved_by: me.id, resolved_at: new Date().toISOString() }).eq('id', d.id)).error)) return;
    const newDue = typeof det.new_due_at === 'string' ? det.new_due_at : null;
    if (outcome === 'approved' && !moveTo && d.task_id && newDue) await db.from('tasks').update({ due_at: newDue, expected_close_at: newDue }).eq('id', d.task_id);
    const taskTitle = task?.title ?? d.title;
    await db.from('activity_log').insert({
      actor_type: 'user',
      actor_id: me.id,
      subject_id: d.requested_by ?? task?.owner_id ?? null,
      task_id: d.task_id,
      action: outcome === 'approved' ? 'decision_approved' : 'decision_declined',
      summary: moveTo ? `Moved “${taskTitle}” to ${moveTo.full_name.split(' ')[0]} (WhatsApp)` : `${outcome === 'approved' ? 'Approved' : 'Declined'}: ${d.title} (WhatsApp)`,
      summary_ar: moveTo
        ? `حوّلت «${taskTitle}» لـ${(moveTo.full_name_ar ?? moveTo.full_name).split(' ')[0]} (واتساب)`
        : `${outcome === 'approved' ? 'وافقت' : 'رفضت'}: ${d.title_ar ?? d.title} (واتساب)`,
      reason: d.recommendation_reason,
      undoable: !!moveTo,
      undo_payload: moveTo ? { task_id: d.task_id, owner_id: task?.owner_id ?? null, decision_id: d.id } : null,
    });
    await say(
      moveTo
        ? ar
          ? `تم 👤 حوّلتها لـ${(moveTo.full_name_ar ?? moveTo.full_name).split(' ')[0]}، وأبلّغه وأتابع معه`
          : `Done 👤 Moved to ${moveTo.full_name.split(' ')[0]}. I’ll tell them and follow up`
        : outcome === 'approved'
          ? ar
            ? `تم ✅ وافقت${newDue ? ` والموعد صار ${whenText(newDue, ar)}` : ''}، وأبلّغهم`
            : `Done ✅ Approved${newDue ? `, new due ${whenText(newDue, ar)}` : ''}. I’ll let them know`
          : ar
            ? 'تمام ✖️ رفضته، وأبلّغهم'
            : 'OK ✖️ Declined. I’ll let them know',
    );
  }

  async function review(how: 'ok' | 'back', taskId: string) {
    if (how === 'back') {
      await admin.from('wa_pending').upsert({ key: `note:${me.id}`, profile_id: me.id, body: { task_id: taskId }, created_at: new Date().toISOString() });
      return void (await say(ar ? 'وش اللي يحتاج تعديل؟ ✍️ اكتبه أو سجّله صوت، وأرجّعها له معه' : 'What needs changing? ✍️ Type it or say it, and I’ll send it back with your note'));
    }
    const db = userDb(await userToken(admin, me.user_id));
    const { error } = await db.rpc('set_task_status', { p_task: taskId, p_status: 'done', p_note: null });
    await say(error ? (ar ? `ما قدرت أعتمدها 😕 ${error.message}` : `I couldn’t approve it 😕 ${error.message}`) : ar ? 'تم ✅ اعتمدتها وقفلتها، وأشكره عنك 🌟' : 'Done ✅ Approved and closed. I’ll thank them for you 🌟');
  }

  async function checkin(reply: string, taskId: string) {
    const db = userDb(await userToken(admin, me.user_id));
    const { data, error } = await db.rpc('checkin_reply', { p_task: taskId, p_reply: reply, p_note: null });
    if (error) return void (await say(ar ? `ما قدرت 😕 ${error.message}` : `I couldn’t 😕 ${error.message}`));
    const said: Record<string, [string, string]> = {
      done: ['يا حلوك 🎉 سجّلتها خالصة', 'Nice 🎉 marked as done'],
      submitted: ['تمام 📥 وصلت للمراجعة، وأبلّغك أول ما يعتمدونها', 'Great 📥 sent for review, I’ll tell you when it’s approved'],
      need_time: ['وصلت ⏳ طلبت لك يوم زيادة من مديرك، وأرجع لك بقراره', 'Got it ⏳ I asked your manager for one more day, I’ll tell you what they decide'],
      blocked: ['وصلت 🆘 بلّغت مديرك إنك تحتاج مساعدة', 'Got it 🆘 I told your manager you need help'],
      busy: ['وصلت ✓ قلت لمديرك إنك مضغوط', 'Got it ✓ I told your manager you’re swamped'],
      got_it: ['وصلت 👍 عرفوا إنك شفتها. لما تخلص قل لي هنا.', 'Got it 👍 They know you’ve seen it. Tell me here when it’s done.'],
    };
    const s = said[String(data)] ?? said[reply] ?? ['تمام 👍', 'OK 👍'];
    await say(ar ? s[0] : s[1]);
  }

  /** Approve / Ignore under a task found in a message: same as in the app (Your tools) */
  async function suggestion(verb: 'ok' | 'no', itemId: string, idx: number) {
    const { data: row } = await admin.from('incoming_items').select('*').eq('id', itemId).eq('owner_id', me.id).maybeSingle();
    const item = row as Item | null;
    const s = item?.suggestions[idx];
    if (!item || !s) return void (await say(ar ? 'ما لقيت هالمهمة 🤔 شيّك عليها في منتج ← أدواتك' : 'I couldn’t find that task 🤔 Check Muntej → Your tools'));
    if (s.state !== 'new') return void (await say(ar ? `سبق وتعاملنا معها ✓ (${s.state === 'accepted' ? 'معتمدة' : 'متجاهلة'})\n📝 ${s.title}` : `Already handled ✓ (${s.state})\n📝 ${s.title}`));
    if (verb === 'no') {
      s.state = 'ignored';
      await saveItem(admin, item);
      return void (await say(ar ? `تمام 👍 تجاهلتها\n📝 ${s.title}` : `OK 👍 Ignored\n📝 ${s.title}`));
    }
    s.task_id = await createFromSuggestion(admin, me.id, item, s, creator());
    s.state = 'accepted';
    await saveItem(admin, item);
    const who = s.owner_id ? await nameOf(s.owner_id) : null;
    await say(
      ar
        ? `تم ✅ اعتمدتها\n📝 ${s.title}\n${who ? (s.owner_id === me.id ? '👤 هي عندك، وأذكّرك قبل الموعد ⏰' : `👤 وصلت لـ ${who}، وأنا أتابع معه لين يخلص 💪`) : '👤 ما لها أحد للحين، اختر لها شخص من منتج'}`
        : `Done ✅ Approved\n📝 ${s.title}\n${who ? (s.owner_id === me.id ? '👤 It’s yours, I’ll remind you before it’s due ⏰' : `👤 Sent to ${who}, I’ll follow up until it’s done 💪`) : '👤 Nobody owns it yet, pick someone in Muntej'}`,
    );
  }

  function creator(): Creator {
    return async (p) => {
      const { data, error } = await admin.rpc('create_task_as', { p, actor: me.id });
      if (error) throw new Error(error.message);
      return data as string;
    };
  }

  async function nameOf(id: string) {
    const { data: p } = await admin.from('profiles').select('full_name, full_name_ar').eq('id', id).maybeSingle();
    return p ? (ar && p.full_name_ar) || p.full_name : null;
  }

  /** a forwarded message: the reader finds the tasks in it and each waits for Approve / Ignore */
  async function ingestForwarded(text: string) {
    const { data: team } = await admin
      .from('profiles')
      .select('id, full_name, full_name_ar, title, skills')
      .eq('account_id', me.account_id)
      .eq('status', 'active')
      .eq('hidden', false);
    const label = (id: string | null) => {
      const p = (team ?? []).find((x) => x.id === id);
      return p ? (p.id === me.id ? (ar ? 'أنت' : 'You') : (ar && p.full_name_ar) || p.full_name) : null;
    };
    const ids = (team ?? []).map((p) => p.id as string);
    const { data: open } = await admin
      .from('tasks')
      .select('id, title, owner_id')
      .in('status', OPEN)
      .in('owner_id', ids.length ? ids : [me.id]);
    // their last forwarded request from the past 30 minutes that still waits: this message may only change it
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
      create: creator(),
      confirmFirst: true,
    });
    if (item.duplicate_message) return;
    const n = item.suggestions.length;
    const amended = !!earlier && earlierOpen.length > 0 && item.suggestions.some((s) => s.amends_earlier);
    if (amended) {
      for (const s of earlier!.suggestions) if (s.state === 'new') s.state = 'ignored';
      await saveItem(admin, earlier!);
    }
    const PROOF: Record<string, [string, string]> = { file: ['ملف', 'a file'], image: ['صورة', 'a photo'], link: ['رابط', 'a link'], any: ['أي إثبات', 'any proof'] };
    const card = (s: (typeof item.suggestions)[number]) => {
      const proof = PROOF[s.proof_required ?? 'none'];
      return [
        `📝 *${s.title}*`,
        `👤 ${ar ? 'لـ' : 'For'}: ${label(s.owner_id) ?? (ar ? 'ما حددت أحد، اختره من منتج' : 'Nobody yet, pick them in Muntej')}`,
        `⏰ ${ar ? 'الموعد' : 'Due'}: ${s.due_at ? whenText(s.due_at, ar) : ar ? 'بدون موعد' : 'No deadline'}`,
        ...(proof ? [`📎 ${ar ? 'يرسل لك' : 'Sends you'}: ${ar ? proof[0] : proof[1]}`] : []),
      ].join('\n');
    };
    const count = ar ? (n === 1 ? 'مهمة جديدة' : n === 2 ? 'مهمتين' : `${n} مهام`) : `${n} new task${n > 1 ? 's' : ''}`;
    if (!n) return void (await say(ar ? 'قريتها ✓ بس ما لقيت فيها مهمة 🤔' : 'Got it ✓ but I didn’t find a task in it 🤔'));
    const head = amended ? (ar ? 'تمام ✏️ عدّلتها، هذي النسخة الجديدة' : 'Done ✏️ I updated it, here’s the new version') : ar ? `تمام ✅ لقيت ${count}` : `Done ✅ I found ${count}`;
    if (n > 1) await say(ar ? `${head}، كل وحدة تحتها أزرارها 👇` : `${head}, each with its own buttons 👇`);
    for (const [i, s] of item.suggestions.entries())
      await waButtons(
        from,
        rtl(n === 1 ? `${head}:\n\n${card(s)}` : card(s)),
        [
          { id: `ok:${item.id}:${i}`, title: ar ? '✅ اعتمد' : '✅ Approve' },
          { id: `no:${item.id}:${i}`, title: ar ? '✖️ تجاهل' : '✖️ Ignore' },
        ],
        ar ? 'وأنا أتابع الباقي 💪' : 'I’ll handle the rest 💪',
      );
  }
}

function helpText(ar: boolean) {
  return ar
    ? [
        'أنا سريع 👋 كلّمني هنا مثل التطبيق بالضبط، بالكتابة أو بالصوت:',
        '• «وش المتأخر؟» أو «كيف فريقي اليوم؟»',
        '• «خل فيصل يسلّم التقرير بكرة الساعة ٣»',
        '• «أجّل مهمة العرض لبكرة» أو «حوّلها لنورة»',
        '• «وش يحتاجني» للقرارات والمراجعات',
        '• «تقرير» وأرسل لك تقريرك الحين',
        '• حوّل لي رسالة أحد، وأطلع لك المهام اللي فيها',
        '',
        'وأرسل لك ٣ تقارير باليوم: الصبح ☀️ الظهر 🌤️ وآخر الدوام 🌙',
      ].join('\n')
    : [
        'I’m Saree3 👋 Talk to me here just like in the app, by text or voice:',
        '• "What’s late?" or "How’s my team today?"',
        '• "Have Faisal hand in the report tomorrow at 3"',
        '• "Move the deck task to tomorrow" or "Give it to Noura"',
        '• "What needs me" for decisions and reviews',
        '• "Report" and I send your report now',
        '• Forward me someone’s message and I’ll pull out the tasks',
        '',
        'You also get 3 reports a day: morning ☀️ midday 🌤️ and end of day 🌙',
      ].join('\n');
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
