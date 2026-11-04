// Real-case checks (owner, 4 Nov: "enhance the testing tool to be more accurate and mature"): every complaint the
// owner sends becomes a case here BEFORE it is fixed, so it can never come back. Unlike the smoke checks in run.mjs,
// these judge the RESULT against the database: the right tasks, owners, dates and numbers, and that Saree3 never
// says he did something that didn't happen. Runs in the QA test company only (run.mjs resets it first).
//   inbox     messages that must (not) become tasks: the owner's 4 Nov screenshots
//   chat      Hoda's 2 Nov conversation: one task per person, "make it Thursday", "update X's task", "what did I make"
//   numbers   Home, Saree3, the morning report and the chat must give the same counts as the database
//   delivery  every channel a report can go out on is really able to send
const DAY = 86_400_000;
const riyadh = (ms) => new Date(ms + 3 * 3_600_000);

export async function cases({ check, expect, fn, sql, jwt, ids, ref, token }) {
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
  await check('numbers', 'Saree3’s answer counts match the database', async () => {
    await sql(`delete from public.chat_messages where profile_id = '${QA_BOSS}'`);
    const { said } = await talk('كم مهمة متأخرة عند الفريق الحين؟ بالرقم');
    const nums = (said.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/\d+/g) ?? []).map(Number);
    const WORDS = { 'مهمة واحدة': 1, وحدة: 1, واحدة: 1, مهمتين: 2, ثنتين: 2, اثنتين: 2, ثلاث: 3, أربع: 4, خمس: 5, 'ما فيه': 0, 'ولا وحدة': 0 };
    for (const [w, n] of Object.entries(WORDS)) if (said.includes(w)) nums.push(n);
    expect(nums.includes(db.late), `answer «${said.slice(0, 140)}», the database has ${db.late} late`);
    return `${db.late} late`;
  });

  // ─── delivery ───────────────────────────────────────────────────────────────
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
  await check('delivery', 'Morning reports went out on every channel people chose', async () => {
    const rows = await sql(
      `select p.full_name, d.channels::text got, (n.rules->'daily_summary'->'channels')::text want
         from public.daily_summaries d join public.profiles p on p.id = d.profile_id
         left join public.notification_prefs n on n.profile_id = p.id
        where d.kind = 'daily' and d.day = (now() at time zone 'Asia/Riyadh')::date and p.account_id <> '${QA_ACCOUNT}'`,
    );
    const missed = rows.filter((x) => (x.want ?? '').includes('email') && !(x.got ?? '').includes('email'));
    expect(!missed.length, `${missed.length} of ${rows.length} people chose email but got none today (${missed.map((x) => x.full_name).slice(0, 3).join(', ')})`);
    return `${rows.length} checked`;
  });

  return transcript;
}
