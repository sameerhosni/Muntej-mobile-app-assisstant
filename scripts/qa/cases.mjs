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

export async function cases({ check, expect, fn, sql, jwt, jwtFor, rpc, ids, ref, token }) {
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
  // The owner, 9 Nov: "you already suggested nouran and did not assign it… distribute tasks accurately more than 90%".
  // His DM to Nouran went to the look-alike "Nouranemira" login. In a DM, what you ask goes to the other person.
  await check('inbox', 'A direct message goes to the person in it, not a look-alike login', async () => {
    const [{ id: twin }] = await sql(`insert into public.profiles (account_id, full_name, role, status, manager_id) values ('${QA_ACCOUNT}', '${FAISAL_NAME.replace(/\s+/g, '')}', 'employee', 'active', '${QA_BOSS}') returning id`);
    try {
      const s = live(await ingest(dm([`[2026-11-09T13:42:10Z] ${BOSS_NAME}: ابعتلي تفاصيل الدخول على النظام الجديد لو سمحت`]), BOSS_NAME, 'Direct message'));
      expect(s.length >= 1, 'no task');
      expect(s.every((x) => x.owner_id === FAISAL), `went to ${s.map((x) => (x.owner_id === twin ? 'the look-alike login' : NAME[x.owner_id] ?? x.owner_id ?? 'nobody')).join(', ')}`);
      return s[0].title;
    } finally {
      await sql(`delete from public.profiles where id = '${twin}'`);
    }
  });
  await check('inbox', 'What they ask of you in a direct message stays yours', async () => {
    const s = live(await ingest(dm([`[2026-11-04T13:04:46Z] ${FAISAL_NAME}: ممكن تعتمد لي عرض السعر قبل بكرة؟`]), FAISAL_NAME, 'Direct message'));
    expect(s.length >= 1, 'no task');
    expect(s.every((x) => x.owner_id === QA_BOSS), `went to ${s.map((x) => NAME[x.owner_id] ?? x.owner_name ?? 'nobody').join(', ')}`);
    return s[0].title;
  });

  // ─── tools: only the user's work (Nouran, 10 Nov) ─────────────────────────────
  // "these are the tasks people ask me PLUS the tasks I ask to people, we need only the ones addressed to me … disregard
  // any task that is sent from my email to others … assign them to other users if they are already on Montej … auto
  // cancel the task if the user responded already". Read as from the QA manager's own (temporary) Google connection.
  {
    const [conn] = await sql(`insert into public.connections (profile_id, provider, account_label, import_on) values ('${QA_BOSS}', 'google', 'qa-manager@qa.muntej.test', false) returning id`);
    const via = async (text, sender, subject, source, conversation = null) =>
      (await fn('intake', { action: 'ingest', text: `${text}\n\n[qa ${Date.now()}]`, sender, subject, source, connection_id: conn.id, conversation }, jwt)).suggestions ?? [];
    const madeFor = async (who, t0) => sql(`select id, title, status from public.tasks where owner_id = '${who}' and assigner_id = '${QA_BOSS}' and created_at >= '${t0}' and status <> 'cancelled'`);
    try {
      await check('inbox', 'Tools: work other people ask each other is never yours', async () => {
        const s = live(await via(`Google Chat · QA marketing\n[2026-11-10T08:00:00Z] ${FAISAL_NAME}: عبدالله، جهّز عرض المبيعات قبل بكرة الظهر`, 'QA marketing', 'QA marketing', 'google_chat'));
        expect(!s.length, `listed ${s.length}: ${s.map((x) => x.title).join(' · ')}`);
        return 'nothing listed';
      });
      await check('inbox', 'Tools: your own mail asking a teammate becomes their task, not yours', async () => {
        const t0 = new Date(Date.now() - 2000).toISOString();
        const mail = [`From: ${BOSS_NAME} <qa-manager@qa.muntej.test>`, `To: ${FAISAL_NAME} <faisal@qa.muntej.test>`, '', `${FAISAL_NAME.split(' ')[0]}, please prepare the Q4 sales report by Thursday.`].join('\n');
        const s = await via(mail, BOSS_NAME, 'Q4 sales report', 'gmail');
        expect(!live(s).some((x) => x.owner_id === QA_BOSS || (x.state === 'new' && !x.owner_id)), 'it waits on your list');
        const made = await madeFor(FAISAL, t0);
        expect(made.length >= 1, `no task for ${FAISAL_NAME}: ${s.map((x) => `${x.title}/${x.state}/${NAME[x.owner_id] ?? x.owner_id}`).join(' · ') || 'nothing read'}`);
        return `${made[0].title} → ${NAME[FAISAL]}`;
      });
      await check('inbox', 'Tools: your chat ask to a teammate goes straight to them', async () => {
        const t0 = new Date(Date.now() - 2000).toISOString();
        const s = await via(dm([`[2026-11-10T08:05:00Z] ${BOSS_NAME}: ارفع العقد على الدرايف اليوم لو سمحت`]), BOSS_NAME, 'Direct message', 'google_chat');
        const made = await madeFor(FAISAL, t0);
        expect(made.length >= 1, `not handed to ${FAISAL_NAME}: ${s.map((x) => `${x.title}/${x.state}`).join(' · ') || 'nothing'}`);
        expect(!live(s).some((x) => x.state === 'new'), 'it also waits on your list');
        return `${made[0].title} → ${NAME[FAISAL]}`;
      });
      await check('inbox', 'Tools: asked, then answered in the next messages: it closes by itself', async () => {
        const head = `Google Chat · Direct message between: ${BOSS_NAME}, ${FAISAL_NAME} (qa ${Date.now()})`;
        const space = `gchat:spaces/qa-${Date.now()}`;
        const first = await via([head, `[2026-11-10T09:00:00Z] ${FAISAL_NAME}: ممكن تراجع لي عقد شركة الريان وترسل ملاحظاتك؟`].join('\n'), FAISAL_NAME, 'Direct message', 'google_chat', space);
        const mine = live(first).filter((x) => x.owner_id === QA_BOSS);
        expect(mine.length, `the ask wasn't yours: ${first.map((x) => `${x.title}/${x.state}`).join(' · ') || 'nothing'}`);
        await via([head, `[2026-11-10T09:30:00Z] ${BOSS_NAME}: راجعته وأرسلت لك الملاحظات على الإيميل ✅`].join('\n'), BOSS_NAME, 'Direct message', 'google_chat', space);
        const [row] = await sql(`select suggestions from public.incoming_items where owner_id = '${QA_BOSS}' and body like '${head.replace(/'/g, "''")}%' order by received_at limit 1`);
        const s0 = row.suggestions.find((x) => x.owner_id === QA_BOSS);
        const closedTask = s0?.task_id ? (await sql(`select status from public.tasks where id = '${s0.task_id}'`))[0]?.status === 'done' : false;
        expect(s0?.closed_by_reply || closedTask, `still open: ${s0?.state}${s0?.task_id ? ' (task)' : ''}`);
        return s0.closed_by_reply ? 'left the list' : 'task closed';
      });
      // reviewer, 10 Nov: a reply-close follows Done's rule: an employee with a manager → review, never a silent close
      await check('inbox', 'Tools: closed by a reply follows Done (an employee with a manager goes for review)', async () => {
        const [mine] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA reply close (employee)', '${FAISAL}', '${FAISAL}', 'in_progress') returning id`);
        try {
          const [{ r }] = await sql(`select public.close_by_reply('${mine.id}', '${FAISAL}', 'qa: the chat shows it done') r`);
          expect(r === 'submitted', `an employee's own task became «${r}»`);
          const [rv] = await sql(`select reviewer_id from public.reviews where task_id = '${mine.id}' and decision is null`);
          expect(rv?.reviewer_id === QA_BOSS, 'no review round for the manager');
          const [log] = await sql(`select undoable, actor_id from public.activity_log where task_id = '${mine.id}' and action = 'closed_by_reply'`);
          expect(log?.undoable && log.actor_id === FAISAL, 'not undoable by the person');
          // the manager approves the review; the employee's late undo must not override it (reviewer, 10 Nov)
          await sql(`update public.reviews set decision = 'approved', decided_at = now() + interval '1 second' where task_id = '${mine.id}' and decision is null`);
          const [l2] = await sql(`select id from public.activity_log where task_id = '${mine.id}' and action = 'closed_by_reply'`);
          let refused = false;
          try {
            await rpc('undo_task_changes', { p_log: l2.id }, await jwtFor(FAISAL, QA_ACCOUNT));
          } catch (e) {
            refused = /moved on since/.test(e.message);
          }
          expect(refused, 'a late undo overrode the manager’s approval');
          return 'sent for the manager’s review, undoable until someone acts';
        } finally {
          await sql(`delete from public.reviews where task_id = '${mine.id}'`);
          await sql(`delete from public.alerts where task_id = '${mine.id}'`);
          await sql(`delete from public.activity_log where task_id = '${mine.id}'`);
          await sql(`delete from public.tasks where id = '${mine.id}'`);
        }
      });
      // reviewer, 10 Nov: a tester is the login (any seat), as in the app
      await check('inbox', 'Tools: the testers switch reads the whole login, every seat the same', async () => {
        const rows = await sql(`select me.id, public.feature_on_for('tools_only_mine', me.id) on_,
            exists (select 1 from public.profiles p where p.user_id = me.user_id and p.tester and p.status <> 'deleted') tester
          from public.profiles me where me.user_id in (select user_id from public.profiles where user_id is not null group by user_id having count(*) > 1) and me.status <> 'deleted'`);
        const off = rows.filter((x) => x.tester && !x.on_);
        expect(!off.length, `${off.length} seats of testers are left out`);
        return `${rows.length} seats on shared logins agree`;
      });
      await check('inbox', 'Tools: nobody can read a message as someone else’s connection', async () => {
        const faisal = await jwtFor(FAISAL, QA_ACCOUNT);
        const r = await fn('intake', { action: 'ingest', text: `QA connection check ${Date.now()}`, source: 'gmail', connection_id: conn.id }, faisal);
        const [row] = await sql(`select connection_id, source from public.incoming_items where id = '${r.id}'`);
        expect(row && !row.connection_id && row.source === 'paste', `read as the other person's connection: ${JSON.stringify(row)}`);
        await sql(`delete from public.incoming_items where id = '${r.id}'`);
        return 'read as a plain paste';
      });
      // The owner, 10 Nov: "unclear" — the tools alert said «لقيت مهمة وحدة لك» with no name. Read as the user: it names
      // the task, and on WhatsApp it is the task's own card with Approve / Ignore
      await check('inbox', 'Tools: the “found tasks” alert names them, and comes as their cards on WhatsApp', async () => {
        const conn = readFileSync(new URL('../../supabase/functions/_shared/connections.ts', import.meta.url), 'utf8');
        const notify = readFileSync(new URL('../../supabase/functions/_shared/notify.ts', import.meta.url), 'utf8');
        expect(/title_ar: n === 1 \? `🔌 من أدواتك: \$\{named\[0\]\}`/.test(conn), 'the alert does not name the task');
        expect(/toolCardsFor\(admin, \[\.\.\.new Set\(about\('tools_found'\)\.flatMap\(\(a\) => foundItemIds\(a\.dedupe_key\)\)\)\]/.test(notify), 'on WhatsApp it is not the cards of the items it named');
        return 'named, with its card';
      });
      await check('inbox', 'Tools: the WhatsApp list says where they are in the app', async () => {
        const src = readFileSync(new URL('../../supabase/functions/_shared/wa-actions.ts', import.meta.url), 'utf8');
        expect(/وتلقاها كمان في تطبيق منتج/.test(src), 'no line pointing to the app');
        return 'every list points to Home → Needs you';
      });
    } finally {
      await sql(`delete from public.incoming_items where connection_id = '${conn.id}'`);
      await sql(`delete from public.connections where id = '${conn.id}'`);
    }
  }

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
    // the owner, 9 Nov: "Make it more funny like saree3 and keep the user attracted till you get the results"
    expect(/أفتّش في المهام/.test(src) && /أكتبها وأحطها/.test(src) && /أجمع لك الزبدة/.test(src), 'a Saree3 step line is missing');
    expect(/patiently\(callAs[^\n]*'muntej-chat'/.test(src) && /6_000/.test(src), 'no "still working" line when Saree3 takes long');
    // the owner, 9 Nov: allowed AI on T2, but WhatsApp answered as his other login (same number) and kept asking
    expect(/people\.length > 1 && !tappedAny && !\(await aiAllowed\(pick, admin\)\)/.test(src), 'one number in two logins doesn’t prefer the profile that allowed AI');
    return 'read + typing, Saree3 lines, a line if slow, the AI-allowed profile';
  });
  // The owner's screenshot, 9 Nov: "start hallucinating?". Nouran's chat: closed tasks "can't be shown", a "yes" told
  // to "press Confirm on the card" with no card, and asking her manager for a budget approval called out of scope.
  await check('chat', 'Closed tasks are answered, and no card is mentioned when there is none', async () => {
    const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status, closed_at) values ('QA closed quarterly report', '${QA_BOSS}', '${QA_BOSS}', 'done', now()) returning id`);
    try {
      const a = await talk('عطني كل مهامي حتى القديمة والمقفلة');
      // the list can come as words or as the chat's task card (its payload)
      expect(/QA closed quarterly report/.test(a.said + JSON.stringify(a.payload)), `closed task not listed: «${a.said.slice(0, 110)}»`);
      expect(!/المفتوحة بس|بس المفتوحة|only (show )?open/i.test(a.said), `said it can only show open tasks: «${a.said.slice(0, 90)}»`);
      const b = await talk('ايه');
      expect(!/بطاقة|card/i.test(b.said) || Object.keys(b.payload).some((k) => /proposal|choice|duplicate|confirm/.test(k)), `talked about a card that isn't there: «${b.said.slice(0, 90)}»`);
      return 'listed, no phantom card';
    } finally {
      await sql(`delete from public.tasks where id = '${t.id}'`);
    }
  });
  // reviewer, 10 Nov (R111): the closed-tasks list only for a request to see them, and only the asker's own
  await check('chat', 'The closed-tasks list never lands under another answer, and shows only your own', async () => {
    const [mine] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status, closed_at) values ('QA closed mine report', '${QA_BOSS}', '${QA_BOSS}', 'done', now()) returning id`);
    const [theirs] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status, closed_at) values ('QA closed teammate file', '${FAISAL}', '${FAISAL}', 'done', now()) returning id`);
    try {
      for (const q of ['what tasks are on hold?', 'هل مهمة التقرير خلصت؟', 'هل كل مهامي المقفلة لي؟', 'كم مهمة من مهامي المقفلة؟', 'وش المشكلة في المهام المقفلة؟']) {
        const a = await talk(q);
        // a direct answer may name the task («أيه، مهمة … مقفلة» to «هل مهمة التقرير خلصت؟» is right); what must not
        // appear is the server's closed-tasks LIST (its «• title · status» lines)
        expect(!/(^|\n)• .+ · /.test(a.said), `«${q}» got the closed list: «${a.said.slice(0, 100)}»`);
      }
      // a teammate whose Arabic name starts with «مها» (inside «مهامي»): still the asker's own list (reviewer, 10 Nov)
      const [{ full_name_ar: was }] = await sql(`select full_name_ar from public.profiles where id = '${FAISAL}'`);
      await sql(`update public.profiles set full_name_ar = 'مها كيو إيه' where id = '${FAISAL}'`);
      try {
        const b = await talk('عطني كل مهامي المقفلة');
        expect(/QA closed mine report/.test(b.said + JSON.stringify(b.payload)), `your closed task not listed: «${b.said.slice(0, 100)}»`);
        expect(!/QA closed teammate file/.test(b.said), 'a teammate’s closed task was listed as yours');
      } finally {
        await sql(`update public.profiles set full_name_ar = ${was === null ? 'null' : `'${was.replace(/'/g, "''")}'`} where id = '${FAISAL}'`);
      }
      // two teammates with one first name: the chat asks which one, never a bare «…:» (reviewer, 10 Nov)
      const twins = await sql(`select id, full_name_ar from public.profiles where id in ('${NOURA}', '${KHALID}')`);
      await sql(`update public.profiles set full_name_ar = 'مهند الأول' where id = '${NOURA}'`);
      await sql(`update public.profiles set full_name_ar = 'مهند الثاني' where id = '${KHALID}'`);
      try {
        const c = await talk('عطني كل مهام مهند المقفلة');
        expect(/مهند الأول/.test(c.said) && /مهند الثاني/.test(c.said), `didn't ask which one: «${c.said.slice(0, 110)}»`);
        expect(!/[:：]\s*$/.test(c.said.trim()), `a bare intro with nothing after it: «${c.said.slice(0, 110)}»`);
        // tapping a chip settles it: no which-one again, nothing of the other one (reviewer, 10 Nov)
        const d = await talk('مهام مهند الأول المقفلة كلها');
        expect(!/تقصد مين/.test(d.said), `asked which one again: «${d.said.slice(0, 110)}»`);
        expect(!/مهند الثاني/.test(d.said), `listed the other one: «${d.said.slice(0, 110)}»`);
        // one family name for both (common in family companies): the most name words wins, no loop (reviewer, 10 Nov)
        await sql(`update public.profiles set full_name_ar = 'مهند سعد العتيبي' where id = '${NOURA}'`);
        await sql(`update public.profiles set full_name_ar = 'مهند خالد العتيبي' where id = '${KHALID}'`);
        const e = await talk('مهام مهند سعد العتيبي المقفلة كلها');
        expect(!/تقصد مين/.test(e.said), `asked which one again with a shared family name: «${e.said.slice(0, 110)}»`);
        expect(!/خالد/.test(e.said), `listed the other one: «${e.said.slice(0, 110)}»`);
      } finally {
        for (const t of twins) await sql(`update public.profiles set full_name_ar = ${t.full_name_ar === null ? 'null' : `'${t.full_name_ar.replace(/'/g, "''")}'`} where id = '${t.id}'`);
      }
      return 'only on request, only yours, asks which one for two of a name';
    } finally {
      await sql(`delete from public.tasks where id in ('${mine.id}', '${theirs.id}')`);
    }
  });
  await check('chat', 'Asking your manager for a budget approval is in scope', async () => {
    const r = await fn('muntej-chat', { message: 'أنا عايزة موافقة من مديري بصرف الميزانية قبل موعدها بخمس أيام.', source: 'text', lang: 'ar' }, await jwtFor(FAISAL, QA_ACCOUNT));
    const said = r.messages?.at(-1)?.content ?? '';
    expect(!/برّا تخصصي|برا تخصصي|outside my lane/i.test(said), `called it out of scope: «${said.slice(0, 90)}»`);
    // N9 (owner, 9 Nov): "I thought I would ask over the chat for an approval from my manager so it would reach"
    const [d] = await sql(`select manager_id, recommendation_reason from public.decisions where requested_by = '${FAISAL}' and type = 'approval_request' and created_at > now() - interval '3 minutes'`);
    expect(d?.manager_id === QA_BOSS, 'no approval request reached his manager');
    expect(/الميزانية/.test(d.recommendation_reason ?? ''), `the request isn't in his words: «${d.recommendation_reason}»`);
    await sql(`delete from public.alerts where subject_id = '${FAISAL}' and kind = 'decision_waiting' and created_at > now() - interval '3 minutes'; delete from public.decisions where requested_by = '${FAISAL}' and type = 'approval_request' and created_at > now() - interval '3 minutes'; delete from public.tasks where assigner_id = '${FAISAL}' and created_at > now() - interval '3 minutes'; delete from public.chat_messages where profile_id = '${FAISAL}' and created_at > now() - interval '3 minutes'`);
    return said.slice(0, 80);
  });
  // N14 (owner, 9 Nov): "I asked him to create it and he said he did, but I asked to create a task under it and nothing
  // in the UI shows that this task belongs to this objective" (the objective was never saved)
  await check('chat', 'A task “under” an objective that doesn’t exist is never claimed linked', async () => {
    const r = await fn('muntej-chat', { message: 'سو لسعد مهمة تجهيز خطة الحملة تحت هدف «إطلاق منتج الشتاء QA»', source: 'text', lang: 'ar' }, jwt);
    const said = r.messages?.at(-1)?.content ?? '';
    expect(!/وحطيتها تحت هدف|added to objective/i.test(said), `claimed it's under the objective: «${said.slice(0, 90)}»`);
    expect(/ما ربطتها|isn't under an objective|أكّد/.test(said), `didn't say the objective isn't saved: «${said.slice(0, 90)}»`);
    await sql(`delete from public.tasks where assigner_id = '${QA_BOSS}' and title ilike '%حملة%' and created_at > now() - interval '3 minutes'`);
    return said.slice(0, 70);
  });
  // N10/N15 (owner, 9 Nov): «نوران» went to "Nouranemira" while Sameer meant "N Emira" (her first name is Nouran)
  await check('chat', 'A name that fits two people is asked, not guessed', async () => {
    const [{ id: twin }] = await sql(
      `insert into public.profiles (account_id, full_name, role, status, manager_id) values ('${QA_ACCOUNT}', 'F Qahtani', 'employee', 'active', '${QA_BOSS}') returning id`,
    );
    try {
      const before = await sql(`select count(*)::int n from public.tasks where assigner_id = '${QA_BOSS}'`);
      const r = await fn('muntej-chat', { message: 'عط فيصل مهمة تجهيز تقرير المبيعات الشهري', source: 'text', lang: 'ar' }, jwt);
      const said = r.messages?.at(-1)?.content ?? '';
      const after = await sql(`select count(*)::int n from public.tasks where assigner_id = '${QA_BOSS}'`);
      const peopleCard = !!r.messages?.at(-1)?.payload?.people_choice;
      expect(after[0].n === before[0].n || peopleCard, `it guessed and made the task: «${said.slice(0, 80)}»`);
      expect(peopleCard || /مين|which|أي واحد/i.test(said), `it didn't ask which Faisal: «${said.slice(0, 80)}»`);
      return said.slice(0, 70);
    } finally {
      await sql(`delete from public.tasks where owner_id = '${twin}'; delete from public.profiles where id = '${twin}'`);
    }
  });
  // The owner, 9 Nov: "I asked the chat who is my team and who is my boss, and he said you don't have any". Nouran's
  // login has an empty seat in another account; the chat answered from it. Faisal gets the same empty seat in Demo.
  await check('chat', 'Who is my boss? from an empty seat names the boss in the other account', async () => {
    const DEMO = 'c0000000-0000-4000-b000-000000000001';
    const [{ id: seat }] = await sql(
      `insert into public.profiles (account_id, user_id, full_name, role, status, ai_consent, ai_consent_at)
       select '${DEMO}', user_id, 'QA Faisal Seat', 'employee', 'active', true, now() from public.profiles where id = '${FAISAL}' returning id`,
    );
    const login = `(select user_id from public.profiles where id = '${FAISAL}')`;
    try {
      const theirs = await jwtFor(seat, DEMO);
      await sql(`insert into public.account_sessions (user_id, account_id) select ${login}, '${DEMO}' on conflict (user_id) do update set account_id = excluded.account_id`);
      const r = await fn('muntej-chat', { message: 'مين مديري ومين فريقي؟', source: 'text', lang: 'ar' }, theirs);
      const said = r.messages?.at(-1)?.content ?? '';
      const boss = BOSS_NAME.split(' ')[0];
      expect(said.includes(boss) || said.includes('أحمد'), `said «${said.slice(0, 120)}» (wanted his boss ${boss} from the QA company)`);
      return said.slice(0, 90);
    } finally {
      await sql(`delete from public.chat_messages where profile_id = '${seat}'; delete from public.alerts where profile_id = '${seat}' or subject_id = '${seat}'; delete from public.invites where profile_id = '${seat}'; delete from public.profiles where id = '${seat}'; update public.account_sessions set account_id = '${QA_ACCOUNT}' where user_id = ${login}`);
    }
  });
  // Nouran, 9 Nov (N17/N21): "I tried to answer it over WhatsApp, WhatsApp confirmed it is done but nothing changed on
  // the employee side" and the last message "doesn't say how to answer". Questions come with «💬 رد عليه»; the next
  // message is a comment on the task to the person who asked.
  await check('invites', 'A comment or call for help on WhatsApp has «💬 رد عليه», a question has «✍️ جاوب»', async () => {
    const notify = readFileSync(new URL('../../supabase/functions/_shared/notify.ts', import.meta.url), 'utf8');
    const wa = readFileSync(new URL('../../supabase/functions/whatsapp/index.ts', import.meta.url), 'utf8');
    expect(/REPLYABLE = new Set<AlertKind>\(answersOn \? \['task_comment', 'escalated'\]/.test(notify) && /id: `cm:\$\{a\.task_id\}`/.test(notify), 'comments go out without a reply button');
    expect(/id: `da:\$\{a\.task_id\}:\$\{askedWhat\(a\)\}`/.test(notify), 'questions go out without «جاوب»');
    expect(/verb === 'cm'/.test(wa) && /key', `cm:\$\{me\.id\}`[\s\S]{0,600}add_task_comment/.test(wa), 'the answer after «رد عليه» isn’t posted to the task');
    return 'reply button for comments, answer button for questions';
  });
  // The owner, 10 Nov: "those questions I want to be able to answer them over whats app". The answer fills the task,
  // the asker hears it, and the question leaves Needs you. Plus the leak in the same screenshot: internal notes
  // ("Owner, 9 Nov: …", "N is at 4 h of 40 h") reached her as alert text.
  await check('invites', 'Answering a question fills the task, tells who asked, and clears it', async () => {
    const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA question task', '${FAISAL}', '${QA_BOSS}', 'in_progress') returning id`);
    try {
      const faisal = await jwtFor(FAISAL, QA_ACCOUNT);
      await rpc('ask_task_detail', { p_task: t.id, p_what: 'doneDef' }, faisal);
      const [asked] = await sql(`select id from public.alerts where profile_id = '${QA_BOSS}' and kind = 'detail_asked' and task_id = '${t.id}' and read_at is null`);
      expect(asked, 'the question never reached the giver');
      await rpc('answer_task_detail', { p_task: t.id, p_what: 'doneDef', p_text: 'التقرير مرفوع على الدرايف ومعتمد' }, jwt);
      const [task] = await sql(`select definition_of_done from public.tasks where id = '${t.id}'`);
      expect(/الدرايف/.test(task.definition_of_done ?? ''), 'the definition of done wasn’t saved');
      const [still] = await sql(`select id from public.alerts where id = '${asked.id}' and read_at is null`);
      expect(!still, 'the question still waits in Needs you');
      const [told] = await sql(`select title_ar from public.alerts where profile_id = '${FAISAL}' and kind = 'request_answered' and task_id = '${t.id}'`);
      expect(told, 'whoever asked wasn’t told');
      // answered in the app instead (a direct edit): the question clears too
      await rpc('ask_task_detail', { p_task: t.id, p_what: 'budget' }, faisal);
      await sql(`update public.tasks set budget = '5,000 SAR' where id = '${t.id}'`);
      const [left] = await sql(`select id from public.alerts where profile_id = '${QA_BOSS}' and kind = 'detail_asked' and task_id = '${t.id}' and dedupe_key like '%:budget:%' and read_at is null`);
      expect(!left, 'a question answered in the app still waits');
      return `${told.title_ar}`;
    } finally {
      await sql(`delete from public.alerts where task_id = '${t.id}'`);
      await sql(`delete from public.activity_log where task_id = '${t.id}'`);
      await sql(`delete from public.tasks where id = '${t.id}'`);
    }
  });
  // The owner, 10 Nov: "AI should be allowed by default … no need to ask for permissions except the user stopped it so
  // give him clear notification of this" (iPhone keeps its one-time screen: Apple 5.1.2).
  await check('invites', 'AI is on unless the person turned it off, and turning it off says so clearly', async () => {
    const [{ ai_consent: before }] = await sql(`select ai_consent from public.profiles where id = '${NOURA}'`);
    try {
      await sql(`update public.profiles set ai_consent = null where id = '${NOURA}'`);
      const [{ ok: onByDefault }] = await sql(`select public.ai_allowed('${NOURA}') ok`);
      expect(onByDefault === true, 'someone who never answered has AI off');
      await sql(`update public.profiles set ai_consent = false where id = '${NOURA}'`);
      const [{ ok: off }] = await sql(`select public.ai_allowed('${NOURA}') ok`);
      expect(off === false, 'turned off, but AI still reads for them');
      const [note] = await sql(`select title_ar from public.alerts where profile_id = '${NOURA}' and dedupe_key like 'ai_off:%' and created_at > now() - interval '1 minute'`);
      expect(note, 'no clear notice when it was turned off');
      return `on by default · off says «${note.title_ar}»`;
    } finally {
      await sql(`delete from public.alerts where profile_id = '${NOURA}' and dedupe_key like 'ai_off:%'`);
      await sql(`update public.profiles set ai_consent = ${before === null ? 'null' : before} where id = '${NOURA}'`);
    }
  });
  await check('invites', 'Internal notes never reach people as alert text', async () => {
    const [log] = await sql(`insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, reason, undoable)
      values ('user', '${QA_BOSS}', '${FAISAL}', 'task_assigned', 'QA leak check', 'فحص التسريب', 'Owner, 9 Nov: internal note', false) returning id`);
    const [a] = await sql(`select body, body_ar from public.alerts where dedupe_key = 'change:${log.id}'`);
    await sql(`delete from public.alerts where dedupe_key = 'change:${log.id}'`);
    await sql(`delete from public.activity_log where id = '${log.id}'`);
    expect(a, 'no alert at all');
    expect(!/Owner, 9 Nov/.test(`${a.body} ${a.body_ar}`), `the note reached them: «${a.body}»`);
    return 'the note stays in the log';
  });
  // The owner, 9 Nov: "tasks to non added users should be still on their side till they be active and remind them"
  await check('invites', 'Someone invited but not active, with a task, is reminded until they join', async () => {
    const [{ id: p }] = await sql(`insert into public.profiles (account_id, full_name, role, status, manager_id, email) values ('${QA_ACCOUNT}', 'QA Waiting Person', 'employee', 'pending', '${QA_BOSS}', 'qa.waiting@qa.muntej.test') returning id`);
    const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA waits for them', '${p}', '${QA_BOSS}', 'assigned') returning id`);
    try {
      const [{ s }] = await sql("select decrypted_secret as s from vault.decrypted_secrets where name='cron_secret'");
      const r = await fn('onboarding-nudges', { dry: true }, null, { 'x-cron-secret': s });
      const line = (r.waiting ?? []).find((x) => x.startsWith('QA Waiting Person'));
      expect(line, `not on the reminder list: ${(r.waiting ?? []).length} others`);
      const [still] = await sql(`select owner_id from public.tasks where id = '${t.id}'`);
      expect(still.owner_id === p, 'the task left them');
      return line;
    } finally {
      await sql(`delete from public.tasks where id = '${t.id}'; delete from public.profiles where id = '${p}'`);
    }
  });
  // N21 (owner, 9 Nov): review requests sent at 2:48 pm waited for Asr and arrived together at 3:12. "Send them at once."
  await check('invites', 'Work waiting on someone isn’t held for prayer time', async () => {
    const notify = readFileSync(new URL('../../supabase/functions/_shared/notify.ts', import.meta.url), 'utf8');
    const kinds = /PRAYER_SKIP_KINDS = new Set<AlertKind>\(\[([^\]]+)\]\)/.exec(notify)?.[1] ?? '';
    expect(['new_submission', 'detail_asked', 'decision_waiting'].every((k) => kinds.includes(`'${k}'`)), `prayer-skip kinds: ${kinds || 'none'}`);
    expect(/actNow && p\?\.quiet_hours \? \{ \.\.\.p\.quiet_hours, prayer_times: false \}/.test(notify), 'the prayer hold still applies to them');
    return 'reviews, questions and decisions go through prayer time';
  });
  // The owner, 10 Nov: "Super admin should not receive notifications here. It should be a dashboard in the app" — two
  // morning reports on one phone (Super account on WhatsApp, T2 as a push) with different numbers.
  await check('delivery', 'The super admin’s console seat sends nothing; one phone gets one company’s report', async () => {
    const since = '2026-11-10T14:00:00Z'; // after the fix went out
    const [{ n: alerts }] = await sql(`select count(*)::int n from public.alerts a join public.profiles p on p.id = a.profile_id
      where p.role = 'super_admin' and a.delivered_at >= '${since}' and (a.sent_push or a.sent_whatsapp)`);
    expect(!alerts, `${alerts} alerts pushed or sent on WhatsApp to a super admin seat`);
    const [{ n: reports }] = await sql(`select count(*)::int n from public.daily_summaries d join public.profiles p on p.id = d.profile_id
      where p.role = 'super_admin' and d.day >= '2026-11-11' and cardinality(d.channels) > 0`);
    expect(!reports, `${reports} reports went to a super admin seat`);
    // a phone shared by two seats: WhatsApp reports only from one of them each day, never the console seat
    const twice = await sql(`select p.phone, d.day, d.kind, count(*)::int n from public.daily_summaries d join public.profiles p on p.id = d.profile_id
      where d.day >= '2026-11-11' and 'whatsapp' = any(d.channels) and p.phone is not null group by 1, 2, 3 having count(*) > 1`);
    expect(!twice.length, `${twice.length} phones got two WhatsApp reports for the same time`);
    const src = (f) => readFileSync(new URL(`../../supabase/functions/${f}`, import.meta.url), 'utf8');
    expect(/neq\('role', 'super_admin'\)/.test(src('_shared/wa-actions.ts')), 'WhatsApp can still pick the console seat');
    expect(/consoleSeats\(admin, ids\)/.test(src('_shared/push.ts')), 'pushes still reach the console seat');
    const report = src('daily-summary/index.ts');
    expect(/short: say\(lang, `pulse_\$\{kind\}`, v\)/.test(report), 'the push and the WhatsApp message start with different numbers');
    // outside the 24 h window WhatsApp is the template: its line must be the push's own line
    expect(/s\.counts = \[company, `\$\{say\(lang, `label_\$\{kind\}`\)\}: \$\{s\.short\}`\]/.test(report), 'the WhatsApp template line isn’t the push’s line');
    expect(/pre\(c\.taskId, c\.body\)/.test(src('_shared/notify.ts')), 'WhatsApp cards don’t say which company / whose task');
    expect(/rtl\(ar, `\*\$\{head/.test(src('_shared/notify.ts')), 'the company line flips Arabic WhatsApp messages left to right');
    return 'no push, WhatsApp or report to the console seat; one report per phone, same numbers';
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
