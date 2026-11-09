// Real-case checks (owner, 4 Nov: "enhance the testing tool to be more accurate and mature"): every complaint the
// owner sends becomes a case here BEFORE it is fixed, so it can never come back. Unlike the smoke checks in run.mjs,
// these judge the RESULT against the database: the right tasks, owners, dates and numbers, and that Saree3 never
// says he did something that didn't happen. Runs in the QA test company only (run.mjs resets it first).
//   inbox     messages that must (not) become tasks: the owner's 4 Nov screenshots
//   chat      Hoda's 2 Nov conversation: one task per person, "make it Thursday", "update X's task", "what did I make"
//   numbers   Home, Saree3, the morning report and the chat must give the same counts as the database
//   delivery  every channel a report can go out on is really able to send
import { readFileSync } from 'node:fs';

const DAY = 86_400_000;
const riyadh = (ms) => new Date(ms + 3 * 3_600_000);

export async function cases({ check, expect, fn, sql, jwt, jwtFor, ids, ref, token }) {
  const { QA_ACCOUNT, QA_BOSS, FAISAL, ABDULLAH, NOURA, KHALID, SAAD } = ids;
  const NAME = { [FAISAL]: 'فيصل', [ABDULLAH]: 'عبدالله', [NOURA]: 'نورة', [KHALID]: 'خالد', [SAAD]: 'سعد' };
  const inQa = `(select id from public.profiles where account_id = '${QA_ACCOUNT}')`;

  // ─── inbox ──────────────────────────────────────────────────────────────────
  await sql(`delete from public.incoming_items where owner_id = '${QA_BOSS}'`);
  const ingest = async (text, sender, subject) =>
    (await fn('intake', { action: 'ingest', text: `${text}\n\n[qa ${Date.now()}]`, sender, subject }, jwt)).suggestions ?? [];
  // waiting for an OK, or added by itself because Muntej was sure
  const live = (s) => s.filter((x) => x.state === 'new' || x.state === 'accepted');
  const NOT_TASKS = [
    [
      'an agent’s status report',
      'sales muntej',
      'Canary not sent – hold Wave 1',
      'Muntej CDP run summary. Canary not sent — none of the 66 Brevo campaigns are named "Muntej C3 - B01". Hold Wave 1 and either send/check canary or update the scheduled check. Next steps: send and verify the C3 canary campaign; update or disable the scheduled canary-check task; validate the email list before any C2/C3 resend.',
    ],
    [
      'a vendor’s sales pitch with a demo invite',
      'Khalil ibrahim',
      'عرض نظام Avialo Point',
      'السلام عليكم، يسعدنا نقدم لكم نظام Avialo Point لنقاط الولاء. مرفق ملف تعريفي وفيديو. الميزانية المقترحة 10,000-20,000 ريال سنوياً ورصيد نقاط 250,000-600,000 نقطة. نتشرف بترتيب اجتماع عرض توضيحي معكم في الوقت المناسب لكم، ونتطلع لردكم.',
    ],
    [
      'cold outreach asking for a reply',
      'Zoe Miller',
      'Quick question about your launch video',
      'Hi Ahmed, is the hardest part of making a launch video the script? I made a one-page starter that helps founders write it in 20 minutes. Want me to send it over? Best, Zoe (Guideless)',
    ],
  ];
  for (const [what, sender, subject, text] of NOT_TASKS)
    await check('inbox', `Not a task: ${what}`, async () => {
      const s = live(await ingest(text, sender, subject));
      expect(!s.length, `made ${s.length} task(s): ${s.map((x) => x.title).join(' · ')}`);
      return 'no task';
    });
  await check('inbox', 'A direct ask to you becomes your task', async () => {
    const s = live(await ingest('Hi Ahmed, please approve the Q4 discount sheet by Sunday so we can send it to the client. Thanks, Faisal', 'Faisal QA', 'Approval needed: Q4 discounts'));
    expect(s.length >= 1, 'no task');
    expect(s.some((x) => x.owner_id === QA_BOSS), `owner was ${s.map((x) => NAME[x.owner_id] ?? x.owner_id).join(', ')}, not you (an approval is yours)`);
    return s[0].title;
  });
  await check('inbox', 'A client request reaches your list', async () => {
    const s = live(await ingest('مرحبا أحمد، ممكن ترسلون لنا قائمة الأسعار المحدثة بكرة؟ شكراً', 'شركة الريان', 'قائمة الأسعار'));
    expect(s.length >= 1, 'no task');
    return `${s[0].title} → ${NAME[s[0].owner_id] ?? (s[0].owner_id === QA_BOSS ? 'you' : 'nobody yet')}`;
  });

  // the owner, 5 Nov: "These 2 tasks are assigned to nouran I am sure". Sameer told Nouran in a direct message, and the
  // cards said Sameer. The same message, with the header the Google Chat reader now writes.
  const [{ full_name: BOSS_NAME }] = await sql(`select full_name from public.profiles where id = '${QA_BOSS}'`);
  const [{ full_name: FAISAL_NAME }] = await sql(`select full_name from public.profiles where id = '${FAISAL}'`);
  const dm = (lines) => ['Google Chat · Direct message between: ' + BOSS_NAME + ', ' + FAISAL_NAME, ...lines].join('\n');
  await check('inbox', 'A direct message telling someone goes to them, not you', async () => {
    const s = live(await ingest(dm([`[2026-11-04T13:04:46Z] ${BOSS_NAME}: Check for explee every 10 min pls`]), BOSS_NAME, 'Direct message'));
    expect(s.length >= 1, 'no task');
    expect(s.every((x) => x.owner_id === FAISAL), `went to ${s.map((x) => NAME[x.owner_id] ?? x.owner_name ?? (x.owner_id === QA_BOSS ? 'you' : 'nobody')).join(', ')}`);
    return s[0].title;
  });
  // The owner, 8 Nov: "Still you are reading all emails regardless if it us task for me or not... You should get only
  // tasks for me or assigned to me". An agent's report to him came back as tasks for a teammate it never names.
  await check('inbox', 'A report to you never becomes a teammate’s task', async () => {
    const mail = [
      'From: sales muntej <sales@muntej.test>',
      'To: qa-manager@qa.muntej.test',
      '',
      'Taplio LinkedIn drafts need scheduling. 3 drafts are ready in Taplio (account: Muntej).',
      'Your one action: design the cover images for the 3 posts in Canva and schedule them into Sun 8, Tue 10 and Thu 12 at 9:30.',
    ].join('\n');
    const s = live(await ingest(mail, 'sales muntej', 'Taplio LinkedIn drafts need scheduling'));
    const wrong = s.filter((x) => x.owner_id && x.owner_id !== QA_BOSS);
    expect(!wrong.length, `went to ${wrong.map((x) => NAME[x.owner_id] ?? x.owner_id).join(', ')}, who the mail never names`);
    return s.length ? `${s.length} for you` : 'nothing for anyone else';
  });
  // The owner, 8 Nov: "You set tasks in this meeting to nouran but this meeting was with Mohamed badawy... any meeting you
  // should read the attendees and get tasks for them not any other persons".
  await check('inbox', 'Meeting tasks go only to people in the meeting', async () => {
    const meeting = [
      'Google Meet meeting: QA marketing weekly (2026-11-08T11:07:09Z → 2026-11-08T11:29:36Z)',
      'Organiser: Ahmed QA',
      'Invited: Meeting Room - QA (5), Ahmed QA, mbadawy.qa@gmail.com',
      'Lines are "speaker: words". Whoever asks someone to do something is who assigned it.',
      '',
      // real transcripts rarely say who: the work has to follow who was in the meeting
      'Ahmed QA: This week I need the social media content plan for our pages.',
      'Mohamed Badawy: OK.',
      'Ahmed QA: And design the banners for the campaign, plus the newsletter for current clients.',
      'Mohamed Badawy: Sure, I will send them by Thursday.',
    ].join('\n');
    const s = live(await ingest(meeting, 'Google Meet', 'QA marketing weekly'));
    expect(s.length >= 1, 'no task from the meeting');
    const wrong = s.filter((x) => x.owner_id && x.owner_id !== QA_BOSS);
    expect(!wrong.length, `went to ${wrong.map((x) => NAME[x.owner_id] ?? x.owner_id).join(', ')}, who wasn't in the meeting`);
    expect(s.every((x) => x.owner_id === QA_BOSS || /badawy|mohamed|محمد/i.test(x.owner_name ?? '')), `owners: ${s.map((x) => x.owner_name ?? NAME[x.owner_id] ?? 'nobody').join(', ')}`);
    return `${s.length} for Mohamed`;
  });
  await check('inbox', 'What they ask of you in a direct message stays yours', async () => {
    const s = live(await ingest(dm([`[2026-11-04T13:04:46Z] ${FAISAL_NAME}: ممكن تعتمد لي عرض السعر قبل بكرة؟`]), FAISAL_NAME, 'Direct message'));
    expect(s.length >= 1, 'no task');
    expect(s.every((x) => x.owner_id === QA_BOSS), `went to ${s.map((x) => NAME[x.owner_id] ?? x.owner_name ?? 'nobody').join(', ')}`);
    return s[0].title;
  });

  // ─── chat: Hoda's conversation ──────────────────────────────────────────────
  const snapshot = async () =>
    (await sql(`select coalesce(max(updated_at), 'epoch')::text u, count(*)::int n from public.tasks where assigner_id in ${inQa} or owner_id in ${inQa}`))[0];
  // claims an action, so something must have changed
  const CLAIM = /^(تم|سويت|سوّيت|عدّلت|عدلت|حطيت|أضفت|ضفت|جهزت|غيرت|غيّرت|done|created|updated|added|i(’|')ve (made|added|set|moved))/i;
  const transcript = [];
  /** one turn, tapping what a person would tap on its card (one task each, Apply, Confirm) */
  async function talk(message) {
    const before = await snapshot();
    let r = await fn('muntej-chat', { message, source: 'text', lang: 'ar' }, jwt);
    const replies = [r.messages?.at(-1)?.content ?? ''];
    for (let i = 0; i < 3; i++) {
      const p = r.messages?.at(-1)?.payload ?? {};
      let next = null;
      if (p.people_choice) next = { apply_create: { task: p.people_choice.task, owner_ids: p.people_choice.people.map((x) => x.id), mode: 'separate' } };
      else if (p.bulk_proposal) next = { apply_bulk: { ids: p.bulk_proposal.items.map((x) => x.id), change: p.bulk_proposal.change } };
      else if (p.confirm_update && p.proposed_patch) next = { apply: { task_id: p.id, patch: p.proposed_patch } };
      if (!next) break;
      r = await fn('muntej-chat', { ...next, lang: 'ar' }, jwt);
      replies.push(r.messages?.at(-1)?.content ?? '');
    }
    const after = await snapshot();
    transcript.push(`👤 ${message}`, ...replies.map((x) => `🤖 ${x}`));
    const said = replies.join(' ').trim();
    expect(said.length > 3, `no reply to «${message}»`);
    expect(!(CLAIM.test(replies[0].trim()) && before.u === after.u && before.n === after.n), `said «${replies[0].slice(0, 80)}» but nothing changed`);
    return { said, payload: r.messages?.at(-1)?.payload ?? {} };
  }
  const createdSince = async (t0) =>
    sql(
      `select id, title, owner_id, due_at, coalesce(description, '') description from public.tasks where assigner_id = '${QA_BOSS}' and status <> 'cancelled' and created_at >= '${t0}' order by created_at`,
    );
  const isThursday = (iso) => {
    if (!iso) return false;
    const d = riyadh(Date.parse(iso));
    return d.getUTCDay() === 4 && Date.parse(iso) > Date.now() - DAY && Date.parse(iso) < Date.now() + 8 * DAY;
  };
  const JUNK = /حسب تخصص|بتخصص|by (their )?special|^مشروع جديد: ?\S+$/i;

  await sql(`delete from public.chat_messages where profile_id = '${QA_BOSS}'`);
  // the database's clock (this PC's may differ)
  const dbNow = async () => (await sql('select now()::text t'))[0].t;
  const t0 = await dbNow();
  await check('chat', 'One task for each person, each in their field', async () => {
    await talk('سوّ لفيصل ونورة وسعد كل واحد مهمة في مشروع جديد اسمه «المشروع الأول»، كل واحد حسب تخصصه، والتسليم الخميس');
    const made = await createdSince(t0);
    const owners = new Set(made.map((x) => x.owner_id));
    expect([FAISAL, NOURA, SAAD].every((p) => owners.has(p)), `tasks went to ${[...owners].map((x) => NAME[x] ?? x).join(', ') || 'nobody'} (wanted فيصل، نورة، سعد)`);
    const junk = made.filter((x) => JUNK.test(x.title.trim()));
    expect(!junk.length, `title is not real work: «${junk[0]?.title}»`);
    expect(new Set(made.map((x) => x.title)).size === made.length, `same title for everyone: «${made[0]?.title}» (each should fit their field)`);
    const undated = made.filter((x) => !isThursday(x.due_at));
    expect(!undated.length, `not due Thursday: «${undated[0]?.title}» (${undated[0]?.due_at ?? 'no date'})`);
    return made.map((x) => `${NAME[x.owner_id]}: ${x.title}`).join(' · ');
  });
  const t1 = await dbNow();
  await check('chat', '“Make it Thursday” dates every task just made', async () => {
    await talk('عط عبدالله وخالد مهمة تجهيز ملف المشروع الثاني');
    await talk('خلها تسليم الخميس');
    const made = await createdSince(t1);
    expect(made.length >= 2, `${made.length} task(s) made for عبدالله وخالد`);
    const undated = made.filter((x) => !isThursday(x.due_at));
    expect(!undated.length, `${undated.length} of ${made.length} still not due Thursday (${undated.map((x) => NAME[x.owner_id]).join(', ')})`);
    return `${made.length} due Thursday`;
  });
  await check('chat', '“Update Saad’s task” changes it, no duplicate', async () => {
    const before = (await sql(`select count(*)::int n from public.tasks where owner_id = '${SAAD}' and status not in ('done','cancelled')`))[0].n;
    await talk('المطلوب من سعد في المشروع الأول يصمم الشعار والهوية');
    const after = (await sql(`select count(*)::int n from public.tasks where owner_id = '${SAAD}' and status not in ('done','cancelled')`))[0].n;
    expect(after === before, `Saad had ${before} open tasks, now ${after}: a new task instead of changing the existing one`);
    const [t] = await sql(`select title, coalesce(description,'') d, coalesce(definition_of_done,'') dod from public.tasks where owner_id = '${SAAD}' and created_at >= '${t0}' and status <> 'cancelled' order by created_at limit 1`);
    expect(t && /شعار|هوي/.test(`${t.title} ${t.d} ${t.dod}`), 'the logo / identity ask is not on Saad’s task');
    return t.title;
  });
  await check('chat', '“What did I make today?” lists them', async () => {
    const made = await createdSince(t0);
    const { said: text, payload } = await talk('وش المهام اللي سويتها اليوم؟');
    // the list may come as text or as rows on a card
    const said = [text, ...(payload.brief?.rows ?? []).map((r) => `${r.note ?? ''} ${r.title ?? ''}`), ...(payload.created_list ?? []).map((r) => r.title)].join(' ');
    const named = made.filter((x) => said.includes(x.title) || said.includes(NAME[x.owner_id]));
    expect(named.length >= Math.min(3, made.length), `named ${named.length} of the ${made.length} tasks made today: «${said.slice(0, 160)}»`);
    return `${named.length}/${made.length} named`;
  });

  // ─── numbers ────────────────────────────────────────────────────────────────
  const [db] = await sql(
    `select count(*) filter (where status in ('draft','assigned','in_progress','blocked','submitted','returned'))::int open,
            count(*) filter (where status in ('draft','assigned','in_progress','blocked','returned') and due_at < now())::int late
       from public.tasks where (assigner_id in ${inQa} or owner_id in ${inQa})`,
  );
  await check('numbers', 'Morning report counts match the database', async () => {
    const r = await fn('daily-summary', { test: true, kind: 'daily', dry: true }, jwt);
    expect(r.preview, `no report: ${r.skipped ?? ''}`);
    const m = r.preview.match(/(\d+)\s*متأخرة|(\d+)\s*late/);
    expect(m, `no late count in: ${r.preview.slice(0, 160)}`);
    const n = Number(m[1] ?? m[2]);
    expect(n === db.late, `report says ${n} late, the database has ${db.late}: «${r.preview.split(String.fromCharCode(10)).slice(0, 2).join(' / ')}»`);
    return `${n} late`;
  });
  // The owner's screenshot, 5 Nov: «ما يحتاج شي تانى» (nothing else needed) got "I couldn't do that, nothing changed":
  // a polite «تمام» looked like a claim of «تم» (done) to the false-claim guard.
  await check('chat', 'Saying nothing else is needed gets no error', async () => {
    // the model only sometimes starts with «تمام», so the guard itself is checked too
    const src = readFileSync(new URL('../../supabase/functions/muntej-chat/index.ts', import.meta.url), 'utf8');
    const guard = new RegExp(/const CLAIMS_DONE = \/(.+)\/i;/.exec(src)[1], 'i');
    expect(!guard.test('تمام، على راحتك') && guard.test('تم، سويتها'), 'the false-claim guard reads «تمام» as «تم»');
    for (const message of ['ما يحتاج شي ثاني', 'تمام شكرا']) {
      const r = await fn('muntej-chat', { message, source: 'text', lang: 'ar' }, jwt);
      const said = r.messages?.at(-1)?.content ?? '';
      expect(said.length > 1, `no reply to «${message}»`);
      expect(!/ما قدرت|ولا تغيّر شي/.test(said), `«${message}» got «${said.slice(0, 70)}»`);
    }
    return 'answered';
  });
  await check('numbers', 'Saree3’s answer counts match the database', async () => {
    await sql(`delete from public.chat_messages where profile_id = '${QA_BOSS}'`);
    const { said } = await talk('كم مهمة متأخرة عند الفريق الحين؟ بالرقم');
    const nums = (said.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/\d+/g) ?? []).map(Number);
    const WORDS = { 'مهمة واحدة': 1, وحدة: 1, واحدة: 1, مهمتين: 2, ثنتين: 2, اثنتين: 2, ثلاث: 3, أربع: 4, خمس: 5, 'ما فيه': 0, 'ولا وحدة': 0 };
    for (const [w, n] of Object.entries(WORDS)) if (said.includes(w)) nums.push(n);
    expect(nums.includes(db.late), `answer «${said.slice(0, 140)}», the database has ${db.late} late`);
    return `${db.late} late`;
  });

  // ─── AI permission ──────────────────────────────────────────────────────────
  // Apple, 8 Nov (5.1.1(i) / 5.1.2(i)): nothing of a person's may reach OpenAI before they allowed it in the app. The QA
  // manager is a tester, so this is checked while the feature is in testing too.
  await check('ai', 'Nothing goes to the AI before the person allows it', async () => {
    const refused = async (name, body) => {
      try {
        await fn(name, body, jwt);
        return false;
      } catch (e) {
        return /403/.test(String(e)) && /ai_consent_required/.test(String(e));
      }
    };
    await sql(`update public.profiles set ai_consent = false where account_id = '${QA_ACCOUNT}'`);
    try {
      expect(await refused('parse-task', { text: 'Ask Faisal to send the report tomorrow' }), 'parse-task read it without permission');
      expect(await refused('muntej-chat', { message: 'What is late today?', lang: 'en' }), 'the chat read it without permission');
      expect(await refused('intake', { action: 'ingest', text: `Please send me the Q4 numbers by Sunday. [qa ${Date.now()}]`, sender: 'Faisal', subject: 'Q4' }), 'intake read it without permission');
    } finally {
      await sql(`update public.profiles set ai_consent = true where account_id = '${QA_ACCOUNT}'`);
    }
    const parsed = await fn('parse-task', { text: 'Ask Faisal to send the report tomorrow' }, jwt);
    expect(parsed?.title, `after allowing, parse-task still refused: ${JSON.stringify(parsed).slice(0, 200)}`);
    return 'refused before, works after';
  });

  // ─── store review login ─────────────────────────────────────────────────────
  // The owner, 5 Nov: recording with this login showed no decisions. An admin can stay in the employee view, which
  // hides the Decisions tab, so the login must stay a manager with a decision to show.
  await check('review', 'The store review login is a manager with a decision to show', async () => {
    const boss = 'c0000000-0000-4000-b000-000000000010';
    const [row] = await sql(`select p.role, (select count(*)::int from public.decisions d where d.manager_id = p.id) decisions from public.profiles p where p.id = '${boss}'`);
    expect(row?.role === 'manager', `the review login is ${row?.role ?? 'missing'}`);
    expect(row.decisions > 0, 'the demo company has no decision for it');
    return `${row.decisions} decision(s)`;
  });

  // ─── account deletion ───────────────────────────────────────────────────────
  // Apple needs every account deletable in the app, admins too (5 Nov), and a company must keep an admin afterwards.
  await check('deletion', 'An admin can delete their account and the next person takes over', async () => {
    const co = 'd0000000-0000-4000-b000-000000000001';
    const [boss, lead, member] = ['10', '11', '12'].map((n) => `d0000000-0000-4000-b000-0000000000${n}`);
    await sql(`
      delete from public.profiles where account_id = '${co}';
      insert into public.accounts (id, name) values ('${co}', 'QA deletion') on conflict (id) do nothing;
      insert into public.profiles (id, account_id, full_name, email, role, manager_id, status) values
        ('${boss}', '${co}', 'QA Boss', 'qa-delete-boss@demo.muntej.test', 'admin', null, 'active'),
        ('${lead}', '${co}', 'QA Lead', 'qa-delete-lead@demo.muntej.test', 'manager', '${boss}', 'active'),
        ('${member}', '${co}', 'QA Member', 'qa-delete-member@demo.muntej.test', 'employee', '${boss}', 'active');
    `);
    const r = await fn('delete-account', {}, await jwtFor(boss, co));
    expect(r.deleted === true, `refused: ${JSON.stringify(r)}`);
    const rows = await sql(`select id, role, status, user_id, manager_id from public.profiles where account_id = '${co}'`);
    const by = Object.fromEntries(rows.map((p) => [p.id, p]));
    expect(by[boss].status === 'deleted' && !by[boss].user_id, 'the admin is still there');
    expect(by[lead].role === 'admin' && !by[lead].manager_id, `nobody took over: the lead is ${by[lead].role}`);
    expect(by[member].manager_id === lead, 'the direct report still points to the deleted admin');
    await sql(`delete from public.profiles where account_id = '${co}'; delete from public.accounts where id = '${co}'`);
    return 'lead is admin, report moved';
  });

  // ─── delivery ───────────────────────────────────────────────────────────────
  // The owner's screenshot, 5 Nov: the invitation still sent people to an Expo build. "We should on stores now and links should be changed".
  await check('invites', 'Invitations send people to the store, not an old build', async () => {
    const PLAY = 'https://play.google.com/store/apps/details?id=sa.muntej.app';
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${token}` } });
    const email = (await r.json()).mailer_templates_invite_content ?? '';
    const places = { 'the invitation email': email };
    for (const f of ['src/features/invite/api.ts', 'supabase/functions/muntej-chat/index.ts', 'supabase/templates/invite.html', 'website/index.html', 'support-web/join.html'])
      places[f] = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    for (const [where, text] of Object.entries(places)) {
      expect(!/expo\.dev\/(accounts|artifacts)/.test(text), `${where} still links to an Expo build`);
      expect(text.includes(PLAY), `${where} has no store link`);
    }
    return 'Google Play in all 6';
  });
  // The owner's screenshot, 5 Nov: "whatsapp stopped working", "no longer on WhatsApp". The dry WhatsApp checks all
  // passed for two days, because they never touch Meta. This asks Meta about the number itself.
  // The owner's screenshot, 5 Nov: "Why iam receiving this". «هلا Sameer 👋 Nouran عطاك مهمة» was for him, but two English
  // names with only an emoji between them display swapped: it read as "Hi Nouran, Sameer gave you a task".
  await check('invites', 'Arabic messages keep a word between two names, so they can’t swap', async () => {
    for (const f of ['supabase/functions/_shared/followup-plan.ts', 'supabase/functions/muntej-chat/index.ts']) {
      const text = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
      const swapped = text.split('\n').filter((l) => /هلا/.test(l) && /\$\{[^}]*\}!?\s*\}?[^\p{L}\n]{0,6}\p{Extended_Pictographic}\s*\$\{/u.test(l.replace(/\$\{name \? ` \$\{name\}` : ''\}/, '${name}')));
      expect(!swapped.length, `${f}: ${swapped[0]?.trim().slice(0, 70)}`);
    }
    return 'no greeting has two names side by side';
  });
  // The owner's screenshot, 9 Nov: "I need some indication here that WhatsApp is working or thinking or reading": every
  // message gets blue ticks and "typing…" before Muntej starts on the answer
  await check('invites', 'WhatsApp shows read and typing while Muntej works', async () => {
    const src = readFileSync(new URL('../../supabase/functions/whatsapp/index.ts', import.meta.url), 'utf8');
    const wa = readFileSync(new URL('../../supabase/functions/_shared/wa.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('async function handle('), src.indexOf('async function handle(') + 500);
    expect(/status: 'read'[\s\S]{0,80}typing_indicator/.test(wa), 'no read + typing call to Meta');
    expect(/waTyping\(m\.id\)/.test(body), 'handle() does not show read + typing first');
    // the owner, 9 Nov: "Need more than typing in the chat itself, something like Claude" (option 2: read it, then the step)
    const steps = src.indexOf('await say(workingSteps(');
    const toChat = src.indexOf("await chat({ message: text");
    expect(steps > 0 && steps < toChat, 'no «👀 قريت رسالتك» + step line before Saree3 works on it');
    expect(/!SAYS_THANKS\.test\(text\)[^\n]*workingSteps/.test(src), 'a thanks would get the steps too');
    expect(/أشوف المهام/.test(src) && /أسجّل المهمة/.test(src) && /أجهّز تقريرك/.test(src), 'a step line is missing');
    return 'read + typing first, then the steps';
  });
  await check('delivery', 'Muntej’s WhatsApp number is alive at Meta', async () => {
    const [{ s }] = await sql("select decrypted_secret as s from vault.decrypted_secrets where name='cron_secret'");
    const r = await fn('whatsapp', { template_status: true }, null, { 'x-cron-secret': s });
    expect(r.number?.ok, `Meta can't find the number: ${r.number?.body?.error?.message?.slice(0, 90) ?? 'no answer'}`);
    expect(r.number.body.status !== 'DISCONNECTED', 'Meta shows the number as disconnected');
    return `${r.number.body.display_phone_number} · ${r.number.body.status ?? 'ok'}`;
  });
  await check('delivery', 'Email can reach people (a real sender is set)', async () => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, { headers: { Authorization: `Bearer ${token}` } });
    const names = new Set((await r.json()).map((x) => x.name));
    expect(names.has('RESEND_API_KEY'), 'RESEND_API_KEY is missing: no email goes out');
    expect(
      names.has('RESEND_FROM'),
      'RESEND_FROM is not set: emails go from Resend’s test sender, which delivers only to the Resend account owner (verify muntej.app in Resend, then set RESEND_FROM)',
    );
    return 'sender set';
  });
  // The owner, 5 Nov: "i don't need email notifications for tasks, only the invitation to join the account for now".
  // Reports stay off email until the secret REPORT_EMAILS is 'on'; the sender being set must not switch them on.
  await check('emails', 'Reports send no email for now, only invitations do', async () => {
    // the test manager has email off, which would pass this for the wrong reason: on for the check, then back as it was
    const [was] = await sql(`select channels from public.notification_prefs where profile_id = '${QA_BOSS}'`);
    await sql(`update public.notification_prefs set channels = coalesce(channels, '{}'::jsonb) || '{"email": true, "push": true}' where profile_id = '${QA_BOSS}'`);
    try {
      const r = await fn('daily-summary', { test: true, kind: 'daily' }, jwt);
      expect(Array.isArray(r.tried), `the report didn't say which channels it tried: ${JSON.stringify(Object.keys(r))}`);
      expect(r.tried.includes('push'), `the report tried only ${r.tried.join(', ') || 'nothing'}, so this proves nothing`);
      expect(!r.tried.includes('email'), `the report tried ${r.tried.join(', ')}`);
      return r.tried.join(', ');
    } finally {
      if (was) await sql(`update public.notification_prefs set channels = '${JSON.stringify(was.channels)}'::jsonb where profile_id = '${QA_BOSS}'`);
    }
  });

  return transcript;
}
