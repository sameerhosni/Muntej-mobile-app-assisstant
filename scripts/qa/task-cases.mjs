// The owner's screenshot, 4 Nov: on a task, "Request proof" answered `column "account_id" does not exist`. The function
// looked for a company on the task, and tasks have none; Postgres only finds that when the function runs, so it was
// broken for every manager since 29 Oct. The last check finds this whole kind of mistake in every database function.
export async function taskCases({ check, expect, fn, sql, jwt, ids, jwtFor, rpc, insert, get }) {
  const { QA_ACCOUNT, QA_BOSS } = ids;
  const QA_FAISAL = 'a0000000-0000-4000-b000-000000000011';
  const DEMO = 'c0000000-0000-4000-b000-000000000001';
  const STRANGER = 'c0000000-0000-4000-b000-000000000011';
  const [them] = await sql(`select id from public.profiles where account_id = '${QA_ACCOUNT}' and id <> '${QA_BOSS}' and status = 'active' and manager_id = '${QA_BOSS}' limit 1`);
  const [task] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA proof task', '${them.id}', '${QA_BOSS}', 'in_progress') returning id`);
  const ruleNow = async () => (await sql(`select proof_required from public.tasks where id = '${task.id}'`))[0].proof_required;
  try {
    await check('tasks', 'Whoever gave the task can ask for proof, and make it optional again', async () => {
      await rpc('set_proof_required', { task: task.id, kind: 'any' }, jwt);
      expect((await ruleNow()) === 'any', `the task still needs "${await ruleNow()}"`);
      const logged = await sql(`select id from public.activity_log where task_id = '${task.id}' and action = 'proof_rule_changed'`);
      expect(logged.length === 1, `logged ${logged.length} times`);
      await rpc('set_proof_required', { task: task.id, kind: 'none' }, jwt);
      expect((await ruleNow()) === 'none', 'could not make it optional again');
      return 'asked, then optional';
    });
    await check('tasks', 'Someone in another company can’t change it', async () => {
      const theirs = await jwtFor(STRANGER, DEMO);
      await rpc('switch_account', { p_account: DEMO }, theirs);
      const r = await rpc('set_proof_required', { task: task.id, kind: 'any' }, theirs).catch((e) => e);
      expect(r instanceof Error && /Task not found/.test(r.message), `answered ${r?.message ?? 'OK'}`);
      expect((await ruleNow()) === 'none', 'the rule changed');
      return 'refused';
    });
    await check('tasks', 'A link can be added as proof', async () => {
      await insert('evidence', { task_id: task.id, type: 'link', url: 'https://example.com/qa', title: 'QA link', uploaded_by: QA_BOSS }, jwt);
      const rows = await sql(`select id from public.evidence where task_id = '${task.id}'`);
      expect(rows.length === 1, `${rows.length} proofs on the task`);
      return 'added';
    });
  } finally {
    await sql(`delete from public.tasks where id = '${task.id}'`);
  }
  // A customer, 5 Nov: "send task in english, but the recipient gets it in arabic". Tasks stayed in the words they were
  // written in, for everyone. Judged in the database, with the real translator.
  const ARABIC = /[\u0600-\u06FF]/;
  // the sweep runs each minute, so a lost request can take a little over one
  const until = async (ask, ms = 100000) => {
    const end = Date.now() + ms;
    for (;;) {
      const got = await ask();
      if (got || Date.now() > end) return got;
      await new Promise((res) => setTimeout(res, 2000));
    }
  };
  const [en] = await sql(`insert into public.tasks (title, description, definition_of_done, owner_id, assigner_id, status)
    values ('Send the quarterly sales report to the finance team', 'Include the northern region numbers', 'Finance confirms they received it', '${them.id}', '${QA_BOSS}', 'assigned') returning id`);
  const [step] = await sql(`insert into public.subtasks (task_id, title) values ('${en.id}', 'Collect the numbers from each branch') returning id`);
  const [mine] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('جهّز تقرير المبيعات لهذا الربع', '${them.id}', '${them.id}', 'assigned') returning id`);
  const tr = async (id = en.id) => (await sql(`select translations -> 'ar' as ar from public.tasks where id = '${id}'`))[0]?.ar ?? null;
  try {
    await check('translation', 'A task written in English reaches an Arabic reader in Arabic, steps too', async () => {
      const ok = await until(async () => {
        const x = await tr();
        return x?.title && x?.description && x?.definition_of_done && x?.steps?.[step.id] ? x : null;
      });
      expect(ok, `translated so far: ${JSON.stringify(await tr())}`);
      expect(ARABIC.test(ok.title) && ARABIC.test(ok.steps[step.id]), `not Arabic: ${ok.title}`);
      const [orig] = await sql(`select title, source_language from public.tasks where id = '${en.id}'`);
      expect(orig.title.startsWith('Send the quarterly') && orig.source_language === 'en', 'the original words were changed');
      return ok.title;
    });
    await check('translation', 'Their alerts carry the Arabic title', async () => {
      const [a] = await sql(`insert into public.alerts (profile_id, kind, task_id, title, body, title_ar, body_ar, delivered_at, dedupe_key)
        values ('${them.id}', 'task_assigned', '${en.id}', 'New: Send the quarterly sales report to the finance team', 'x',
                'جديدة: Send the quarterly sales report to the finance team', 'x', now(), 'qa-tr-${en.id}') returning title_ar`);
      expect(ARABIC.test(a.title_ar.replace('جديدة: ', '')) && !a.title_ar.includes('Send the quarterly'), `alert says: ${a.title_ar}`);
      return a.title_ar;
    });
    await check('translation', 'An edit clears the old translation at once, then a new one arrives', async () => {
      const before = (await tr()).title;
      // read in the edit itself: the new translation can be back before a second question gets here
      const [{ ar: after }] = await sql(`update public.tasks set title = 'Send the yearly sales report to the finance team' where id = '${en.id}' returning translations -> 'ar' as ar`);
      expect(!after?.title, `still shows the old translation: ${after?.title}`);
      expect(after?.description, 'the part that did not change lost its translation');
      const fresh = await until(async () => (await tr())?.title);
      expect(fresh && fresh !== before && ARABIC.test(fresh), `got: ${fresh}`);
      return fresh;
    });
    await check('translation', 'A task already in the reader’s language costs nothing', async () => {
      const [{ langs }] = await sql(`select public.task_translation_targets('${mine.id}') as langs`);
      expect(!langs?.length, `would translate into ${JSON.stringify(langs)}`);
      await new Promise((res) => setTimeout(res, 4000));
      const [row] = await sql(`select source_language, translations from public.tasks where id = '${mine.id}'`);
      expect(row.source_language === 'ar', `read as ${row.source_language}`);
      expect(!Object.keys(row.translations ?? {}).length, 'it was translated anyway');
      return 'not translated';
    });
    await check('translation', 'A request that comes during a translation isn’t lost', async () => {
      // already in their language, so the real translator stays out of this
      const [held] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('احجز قاعة التدريب', '${them.id}', '${them.id}', 'assigned') returning id`);
      const call = async (name) => (await sql(`select public.${name}('${held.id}') as r`))[0].r;
      expect((await call('claim_task_translation')) === true, 'the first one could not start');
      expect((await call('claim_task_translation')) === false, 'two translators at once');
      expect((await call('release_task_translation')) === true, 'the request during the translation was forgotten');
      expect((await call('release_task_translation')) === false, 'it never finishes');
      expect((await call('claim_task_translation')) === true, 'the task stayed locked');
      await call('release_task_translation');
      await sql(`delete from public.tasks where id = '${held.id}'`);
      return 'looked again';
    });
    await check('translation', 'A request that never arrived gets picked up again', async () => {
      const [lost] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('Renew the office internet contract', '${them.id}', '${QA_BOSS}', 'assigned') returning id`);
      const done = await until(async () => (await tr(lost.id))?.title);
      expect(done, 'not translated');
      await sql(`update public.tasks set translations = '{}'::jsonb where id = '${lost.id}'`);
      expect((await sql(`select public.task_translation_missing('${lost.id}') as m`))[0].m === true, 'nothing noticed it was missing');
      const [{ jobs }] = await sql(`select count(*)::int as jobs from cron.job where jobname = 'translate-tasks-sweep' and active`);
      expect(jobs === 1, 'the sweep is not scheduled');
      const back = await until(async () => (await tr(lost.id))?.title);
      await sql(`delete from public.tasks where id = '${lost.id}'`);
      expect(back && ARABIC.test(back), 'the sweep did not bring it back');
      return back;
    });
    await check('translation', 'A failed translation still delivers: messages wait 2 minutes at most, with the original words', async () => {
      const [late] = await sql('select gen_random_uuid() as id');
      const waits = async () => (await sql(`select public.task_translation_pending('${late.id}', 'ar') as p`))[0].p;
      // asked in the same transaction as the insert: the translator can't answer until it commits
      const [fresh] = await sql(`insert into public.tasks (id, title, owner_id, assigner_id, status) values ('${late.id}', 'Check the delivery schedule today', '${them.id}', '${QA_BOSS}', 'assigned');
        select public.task_translation_pending('${late.id}', 'ar') as p`);
      expect(fresh.p === true, 'a new task did not wait for its translation');
      // as if the translator never answered
      await sql(`update public.tasks set created_at = now() - interval '3 minutes', translations = '{}'::jsonb where id = '${late.id}'`);
      expect((await waits()) === false, 'a message waits forever when the translation fails');
      await sql(`delete from public.tasks where id = '${late.id}'`);
      return 'sent with the original';
    });
  } finally {
    await sql(`delete from public.tasks where id in ('${en.id}', '${mine.id}')`);
  }
  // The owner, 5 Nov: "add indian language in the whole app as an option". Arabic stays the default; Hindi is chosen.
  const DEVANAGARI = /[\u0900-\u097F]/;
  await check('hindi', 'Choosing Hindi is saved, and new people still start in Arabic', async () => {
    await rpc('set_my_locale', { p_locale: 'hi' }, jwt);
    const [boss] = await sql(`select locale from public.profiles where id = '${QA_BOSS}'`);
    expect(boss.locale === 'hi', `saved as ${boss.locale}`);
    await rpc('set_my_locale', { p_locale: 'ar' }, jwt);
    const invited = await rpc('upsert_person', { p: { full_name: 'QA Hindi Default', email: 'qa-hindi@qa.muntej.test', role: 'employee', manager_id: QA_BOSS } }, jwt);
    const [fresh] = await sql(`select locale from public.profiles where id = '${invited}'`);
    await sql(`delete from public.profiles where id = '${invited}'`);
    expect(fresh.locale === 'ar', `a new person starts in ${fresh.locale}`);
    return 'saved; default stays Arabic';
  });
  await check('hindi', 'A task reaches someone who chose Hindi in Hindi', async () => {
    await sql(`update public.profiles set locale = 'hi' where id = '${them.id}'`);
    const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('Prepare the monthly safety checklist', '${them.id}', '${QA_BOSS}', 'assigned') returning id`);
    try {
      const hi = await until(async () => (await sql(`select translations -> 'hi' ->> 'title' as t from public.tasks where id = '${t.id}'`))[0]?.t);
      expect(hi && DEVANAGARI.test(hi), `got: ${hi}`);
      return hi;
    } finally {
      await sql(`delete from public.tasks where id = '${t.id}'; update public.profiles set locale = 'ar' where id = '${them.id}'`);
    }
  });
  await check('hindi', 'Muntej’s own words come back in Hindi and are remembered', async () => {
    const line = `QA: Your report is ready to read ${Date.now() % 1000}`;
    const { texts } = await fn('localize-text', { lang: 'hi', texts: [line, 'Hello {{name}}, your task is due'] }, jwt);
    expect(DEVANAGARI.test(texts[0]), `got: ${texts[0]}`);
    expect(texts[1].includes('{{name}}'), `lost the name: ${texts[1]}`);
    const saved = await sql(`select lang from public.text_translations where lang = 'hi' and source = '${line}'`);
    expect(saved.length === 1, 'not remembered');
    await sql(`delete from public.text_translations where source = '${line}'`);
    return texts[0];
  });
  await check('hindi', 'Saree3 answers Hindi in Hindi', async () => {
    const r = await fn('muntej-chat', { message: 'मेरे कितने काम बाकी हैं?', lang: 'hi' }, jwt);
    const bot = (r.messages ?? []).at(-1);
    expect(bot && DEVANAGARI.test(bot.content), `answered: ${bot?.content}`);
    return bot.content.slice(0, 60);
  });
  await check('hindi', 'Someone can’t use the translator without signing in', async () => {
    const r = await fn('localize-text', { lang: 'hi', texts: ['Hello'] }, null).catch((e) => e);
    expect(r instanceof Error && /401/.test(r.message), `answered ${r?.message ?? JSON.stringify(r)}`);
    return 'refused';
  });
  // The owner, 5 Nov: "You added 3 active but no one received the invitation yet and no one accept it neither login".
  // Sending an email invitation makes the login, and that alone said "active" and told the manager they joined.
  const INVITED = 'qa-invited@qa.muntej.test';
  const LOGIN = 'a0000000-0000-4000-b000-0000000000e1';
  const tidyInvited = () =>
    sql(`delete from public.alerts where subject_id in (select id from public.profiles where lower(email) = '${INVITED}')
           or profile_id in (select id from public.profiles where lower(email) = '${INVITED}');
         delete from public.tasks where owner_id in (select id from public.profiles where lower(email) = '${INVITED}');
         delete from public.profiles where lower(email) = '${INVITED}';
         delete from auth.users where id = '${LOGIN}';`);
  await tidyInvited();
  let invited = null;
  const seat = async () => (await sql(`select status, user_id from public.profiles where id = '${invited}'`))[0];
  const joinedAlerts = async () => (await sql(`select id from public.alerts where subject_id = '${invited}' and kind = 'member_joined'`)).length;
  try {
    await check('invites', 'Sending the invitation doesn’t make them active', async () => {
      invited = await rpc('upsert_person', { p: { full_name: 'QA Invited', email: INVITED, role: 'employee', manager_id: QA_BOSS } }, jwt);
      // what Supabase does on an email invitation: a login nobody has used
      await sql(`insert into auth.users (id, instance_id, aud, role, email, invited_at, created_at, updated_at)
                 values ('${LOGIN}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${INVITED}', now(), now(), now())`);
      const p = await seat();
      expect(p.user_id === LOGIN, 'the login was not linked');
      expect(p.status === 'pending', `shows "${p.status}" before they ever signed in`);
      expect(!(await joinedAlerts()), 'the manager was told they joined');
      return 'still waiting';
    });
    await check('invites', 'A manager can share a join link with someone who never signed in', async () => {
      const r = await fn('invite', { link: { person_id: invited } }, jwt);
      expect(r?.url, `answered ${JSON.stringify(r)}`);
      return 'link made';
    });
    await check('invites', 'Their first sign-in makes them active and tells the manager', async () => {
      await sql(`update public.profiles set status = 'pending' where id = '${invited}'`);
      // the owner, 8 Nov: "Notify me if anyone I invited joined the account and remind him of his tasks once joined"
      await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA waiting for you', '${invited}', '${QA_BOSS}', 'assigned')`);
      await sql(`update auth.users set email_confirmed_at = now(), last_sign_in_at = now() where id = '${LOGIN}'`);
      const p = await seat();
      expect(p.status === 'active', `still "${p.status}"`);
      expect((await joinedAlerts()) === 1, 'the manager was not told');
      const reminded = await sql(`select title_ar from public.alerts where profile_id = '${invited}' and dedupe_key = 'joined_tasks:${invited}'`);
      expect(reminded.length === 1, 'the person who joined wasn’t reminded of the task waiting for them');
      return `active, reminded: ${reminded[0].title_ar}`;
    });
  } finally {
    await tidyInvited();
  }
  await check('invites', 'Delete then restore doesn’t mark someone as joined', async () => {
    const theirs = await jwtFor(STRANGER, DEMO);
    await rpc('switch_account', { p_account: DEMO }, theirs);
    const id = await rpc('upsert_person', { p: { full_name: 'QA Restored', email: 'faisal@demo.muntej.test', role: 'employee', manager_id: QA_BOSS } }, jwt);
    try {
      await rpc('delete_people', { ids: [id], with_branch: false }, jwt);
      await rpc('restore_person', { person: id, with_batch: false }, jwt);
      const [p] = await sql(`select status from public.profiles where id = '${id}'`);
      expect(p.status === 'pending', `came back "${p.status}" though they never opened this company`);
      return 'still waiting';
    } finally {
      await sql(`delete from public.alerts where subject_id = '${id}' or profile_id = '${STRANGER}' and kind = 'added_to_company'; delete from public.profiles where id = '${id}'`);
    }
  });
  // The owner, 5 Nov: "+ Add Nouran" opened an empty box, "without nouran email which you can get it from chat".
  await check('tasks', 'Adding the person a task names: email found, and the task goes to them', async () => {
    const email = 'qa.nouran@qa.muntej.test';
    const [item] = await sql(`insert into public.incoming_items (owner_id, source, external_id, sender, subject, body, status, suggestions)
      values ('${QA_BOSS}', 'paste', 'qa-add-person', 'QA', 'QA add person', 'Nouran will watch the box. Reach her on ${email}', 'new',
        jsonb_build_array(jsonb_build_object('title', 'QA watch the box', 'owner_id', null, 'owner_name', 'QA Nouran', 'outside', true, 'state', 'new', 'confidence', 0.9, 'priority', 'medium', 'quote', 'x', 'task_id', null, 'duplicate_of', null))) returning id`);
    try {
      const found = await fn('intake', { action: 'find_email', id: item.id, index: 0 }, jwt);
      expect(found.email === null, `"QA Nouran" matched ${found.email}: the first word isn't in the address, so it must not guess`);
      await sql(`update public.incoming_items set suggestions = jsonb_set(suggestions, '{0,owner_name}', '"Nouran Emira"') where id = '${item.id}'`);
      const named = await fn('intake', { action: 'find_email', id: item.id, index: 0 }, jwt);
      expect(named.email === email && named.from === 'message', `found ${JSON.stringify(named)}`);
      await fn('intake', { action: 'set_owner', id: item.id, index: 0, owner_id: them.id }, jwt);
      const [after] = await sql(`select suggestions->0->>'owner_id' o from public.incoming_items where id = '${item.id}'`);
      expect(after.o === them.id, `the task's owner is ${after.o}`);
      return email;
    } finally {
      await sql(`delete from public.incoming_items where id = '${item.id}'`);
    }
  });
  // The owner, 6 Nov: "once we connect Google tools, saree3 should import all users email found in tasks and suggest to
  // add it to the account org structure under one of the existing users or skip the user".
  // Nouran, 8 Nov: "This is a task assigned from me to sameer, why would I have cta 'send nouran' and when I click it
  // twice why does it turn the task to 100%?". «اسأل» showed to the giver and only ticked the item on the screen.
  await check('tasks', '“Ask” sends the giver a real question and fills nothing in', async () => {
    const [mine] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA ask the giver', '${QA_BOSS}', '${them.id}', 'assigned') returning id`);
    const [given] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA ask myself', '${them.id}', '${QA_BOSS}', 'assigned') returning id`);
    try {
      await rpc('ask_task_detail', { p_task: mine.id, p_what: 'budget' }, jwt);
      const asked = await sql(`select title_ar from public.alerts where profile_id = '${them.id}' and task_id = '${mine.id}' and kind = 'detail_asked'`);
      expect(asked.length === 1, `${asked.length} question(s) reached the one who gave it`);
      const [t] = await sql(`select budget from public.tasks where id = '${mine.id}'`);
      expect(t.budget == null, 'asking filled the budget in');
      const self = await rpc('ask_task_detail', { p_task: given.id, p_what: 'budget' }, jwt).catch((e) => e);
      expect(self instanceof Error, 'the one who gave the task could “ask” themselves');
      return asked[0].title_ar;
    } finally {
      await sql(`delete from public.alerts where task_id in ('${mine.id}', '${given.id}'); delete from public.tasks where id in ('${mine.id}', '${given.id}')`);
    }
  });
  // The owner, 6 Nov: "Let's create a new version for testing before going live and once updates approved we can go
  // live". A feature in testing (features.testing) is only for testers, on the one live server.
  await check('testing', 'A feature in testing is hidden from people who aren’t testers', async () => {
    // put back exactly as it was: once live, a QA run must never take the feature away from everyone (8 Nov it did)
    const [was] = await sql(`select testing from public.features where key = 'team_from_mail'`);
    await sql(`update public.features set testing = true where key = 'team_from_mail'`);
    const seen = async () => (await rpc('feature_on', { p_key: 'team_from_mail' }, jwt));
    try {
      expect((await seen()) === true, 'the tester (QA manager) can’t see it');
      await sql(`update public.profiles set tester = false where id = '${QA_BOSS}'`);
      expect((await seen()) === false, 'someone who isn’t a tester sees it');
      const r = await fn('team-import', { action: 'from_mail', count_only: true }, jwt).catch((e) => e);
      expect(r instanceof Error && /403/.test(r.message), `its server action answered ${r?.message ?? JSON.stringify(r)}`);
    } finally {
      await sql(`update public.profiles set tester = true where id = '${QA_BOSS}'; update public.features set testing = ${was?.testing === true} where key = 'team_from_mail'`);
    }
    return 'testers only';
  });
  const MAIL_IDS = ['qa-mail-1', 'qa-mail-2', 'qa-mail-3', 'qa-mail-4'];
  const REEM = 'qa-reem@qa.muntej.test';
  const CLIENT = 'buyer@client-co.test';
  const tidyMail = () =>
    sql(`delete from public.incoming_items where owner_id = '${QA_BOSS}' and external_id like 'qa-mail-%';
         delete from public.team_mail_skips where created_by = '${QA_BOSS}';
         delete from public.team_drafts where created_by = '${QA_BOSS}' and source = 'mail';
         delete from public.profiles where lower(email) = '${REEM}';`);
  await tidyMail();
  try {
    const mail = (id, from, to, cc, words) =>
      sql(`insert into public.incoming_items (owner_id, source, external_id, sender, subject, received_at, body, status, suggestions)
           values ('${QA_BOSS}', 'gmail', '${id}', 'QA', 'QA mail', now(), ${`'Subject: QA mail\nFrom: ${from}\nTo: ${to}\n${cc ? `Cc: ${cc}\n` : ''}\n${words}'`}, 'nothing', '[]'::jsonb)`);
    await mail(MAIL_IDS[0], `"Reem Salem" <${REEM}>`, `"Ahmed QA" <qa-manager@qa.muntej.test>`, `"Faisal QA" <qa-faisal@qa.muntej.test>`, 'The sales sheet is ready');
    // a real exchange both ways (owner, 8 Nov: only people you actually deal with, not everyone on a Cc)
    await mail(MAIL_IDS[1], `"Ahmed QA" <qa-manager@qa.muntej.test>`, `"Reem Salem" <${REEM}>`, `"Faisal QA" <qa-faisal@qa.muntej.test>, no-reply@notifications.qa.muntej.test`, 'Thanks Reem, send it to the client');
    await mail(MAIL_IDS[2], `"Client Buyer" <${CLIENT}>`, `"Ahmed QA" <qa-manager@qa.muntej.test>`, '"Cc Only" <cc.only@qa.muntej.test>', 'Please share the offer');
    await mail(MAIL_IDS[3], `"Client Buyer" <${CLIENT}>`, `"Ahmed QA" <qa-manager@qa.muntej.test>`, null, 'Any news on the offer?');
    // the owner's screenshot, 8 Nov: "Sameer Hosni" (him, as a chat names him) was suggested to him. A chat gives only names:
    // «A. QA» is the QA manager ("Ahmed QA") the way «Sameer Hosni» is "S Hosni"
    await sql(`insert into public.incoming_items (owner_id, source, external_id, sender, subject, received_at, body, status, suggestions)
         values ('${QA_BOSS}', 'google_chat', 'qa-mail-5', 'Reem Salem', 'QA chat', now(), 'Direct message between: A. QA, Reem Salem\n\n[10:00] Reem Salem: the sheet is ready\n[10:01] A. QA: thanks', 'nothing', '[]'::jsonb)`);
    let draft = null;
    let before = null;
    await check('team', 'People found in your mail are suggested for the team', async () => {
      before = await fn('team-import', { action: 'from_mail', count_only: true }, jwt);
      const r = await fn('team-import', { action: 'from_mail' }, jwt);
      draft = r.draft;
      const people = draft?.people ?? [];
      const reem = people.find((p) => p.email === REEM);
      const client = people.find((p) => p.email === CLIENT);
      expect(reem, `Reem wasn't suggested: ${people.map((p) => p.email ?? p.full_name).join(', ') || 'nobody'}`);
      expect(reem.manager_id === QA_FAISAL && !reem.skip, `Reem goes under ${reem.manager_id ?? 'you'}${reem.skip ? ', skipped' : ''}, not Faisal, who mails with her`);
      expect(client?.skip && client.outside, `the client is ${client ? 'not set to skip' : 'missing'}`);
      expect(!people.some((p) => /qa-faisal|qa-manager|no-reply/.test(p.email ?? '')), 'you, a teammate or a no-reply address is in the list');
      expect(!people.some((p) => /^(a\.? ?qa|ahmed qa)$/i.test((p.full_name ?? '').trim())), 'you were suggested to yourself, by the name a chat gives you');
      return `${people.length} found, Reem under Faisal`;
    });
    // owner, 8 Nov: "approve or reject one by one": Add adds, No is never asked again, and someone you didn't decide on
    // yet is left out now but comes back next time (the app sends them as pending)
    await check('team', 'Add adds them, someone not decided yet comes back next time', async () => {
      const people = draft.people.map((p) =>
        p.email === REEM ? { ...p, is_new: true, decided: 'yes', skip: false, pending: false } : p.decided ? p : { ...p, skip: true, pending: true },
      );
      const r = await fn('team-import', { action: 'apply', draft_id: draft.id, people }, jwt);
      expect(r.created >= 1, `created ${r.created}: ${JSON.stringify(r.failed).slice(0, 120)}`);
      const [p] = await sql(`select manager_id from public.profiles where lower(email) = '${REEM}'`);
      expect(p?.manager_id === QA_FAISAL, `Reem is under ${p?.manager_id ?? 'nobody'}`);
      const again = await fn('team-import', { action: 'from_mail', count_only: true }, jwt);
      expect(again.count === before.count - 1 && again.outside === before.outside, `before ${before.count} + ${before.outside} outside, after ${again.count} + ${again.outside}: the undecided client didn't come back`);
      return 'Reem added, the client asked again';
    });
    await check('team', 'A No is never asked again', async () => {
      const r = await fn('team-import', { action: 'from_mail' }, jwt);
      const people = r.draft.people.map((p) => (p.email === CLIENT ? { ...p, decided: 'no', skip: true, pending: false } : { ...p, skip: true, pending: true }));
      expect(people.some((p) => p.email === CLIENT), 'the client is not in the list');
      await fn('team-import', { action: 'apply', draft_id: r.draft.id, people }, jwt);
      const again = await fn('team-import', { action: 'from_mail', count_only: true }, jwt);
      expect(again.outside === 0, `the client you said No to is asked again (${again.outside} outside)`);
      return 'not asked again';
    });
  } finally {
    await tidyMail();
  }
  // owner, 8 Nov: "Budget should be optional": who, when and what "done" means make a task fully clear
  await check('tasks', 'A task without a budget is fully clear', async () => {
    const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status, due_at, definition_of_done)
      values ('QA budget optional', '${QA_BOSS}', '${QA_BOSS}', 'assigned', now() + interval '2 days', 'Sent to the client') returning id, clarity_score`);
    await sql(`delete from public.tasks where id = '${t.id}'`);
    expect(t.clarity_score === 100, `clarity ${t.clarity_score}% without a budget`);
    return '100%';
  });

  // ─── who sees a task, who may give one (owner, 8 Nov) ─────────────────────────
  // "Everyone should see his tasks and his team tasks only and other tasks he is mentioned in and tasks assigned from
  // his side to other teams, and can give tasks to his team and users in the same level of other teams" (admins: all).
  // QA company: Ahmed (admin) → Faisal, Noura (managers), Saad; Faisal → Abdullah; Noura → Khalid.
  {
    const P = { FAISAL: QA_FAISAL, ABDULLAH: 'a0000000-0000-4000-b000-000000000012', NOURA: 'a0000000-0000-4000-b000-000000000013', KHALID: 'a0000000-0000-4000-b000-000000000014', SAAD: 'a0000000-0000-4000-b000-000000000015' };
    const tokens = {};
    const as = async (who) => (tokens[who] ??= await jwtFor(P[who], QA_ACCOUNT));
    const give = async (who, owner, title) =>
      insert('tasks', { title, owner_id: owner, assigner_id: P[who], status: 'assigned' }, await as(who)).then(() => 'ok', (e) => e);
    const sees = async (who, title) => (await get(`tasks?select=id&title=eq.${encodeURIComponent(title)}`, await as(who))).length > 0;
    const tidy = () => sql(`delete from public.tasks where title like 'QA rule %'`);
    await tidy();
    // while the rule is in testing only testers are held to it: these five are testers for the checks
    const people = Object.values(P).map((x) => `'${x}'`).join(',');
    const [{ was }] = await sql(`select coalesce(bool_or(tester), false) as was from public.profiles where id in (${people})`);
    await sql(`update public.profiles set tester = true where id in (${people})`);
    try {
      await check('rules', 'You can give tasks to your team and to people at your level in other teams', async () => {
        expect((await give('ABDULLAH', P.KHALID, 'QA rule same level')) === 'ok', 'Abdullah could not give Khalid (same level, other team) a task');
        expect((await give('FAISAL', P.ABDULLAH, 'QA rule my team')) === 'ok', 'Faisal could not give his own Abdullah a task');
        expect((await give('FAISAL', P.NOURA, 'QA rule peer manager')) === 'ok', 'Faisal could not give Noura (same level) a task');
        return 'team and same level: allowed';
      });
      await check('rules', 'You can’t give tasks upward or to another level of another team', async () => {
        const up = await give('ABDULLAH', P.FAISAL, 'QA rule upward');
        expect(up instanceof Error && /your level|مستواك/.test(up.message), `Abdullah gave his manager a task: ${up?.message ?? 'allowed'}`);
        const other = await give('FAISAL', P.KHALID, 'QA rule other level');
        expect(other instanceof Error, 'Faisal gave Khalid (in Noura’s team, a level below) a task');
        const [n] = await sql(`select count(*)::int as n from public.tasks where title in ('QA rule upward', 'QA rule other level')`);
        expect(n.n === 0, `${n.n} refused tasks were saved anyway`);
        return 'refused';
      });
      await check('rules', 'Your team’s tasks, tasks your team gave, tasks naming you: seen; others: not', async () => {
        // Abdullah gave Khalid «QA rule same level»: Faisal (Abdullah's manager) and Noura (Khalid's) see it, Saad doesn't
        expect(await sees('FAISAL', 'QA rule same level'), 'Faisal can’t see the task his team gave to another team');
        expect(await sees('NOURA', 'QA rule same level'), 'Noura can’t see her team’s task');
        expect(!(await sees('SAAD', 'QA rule same level')), 'Saad sees a task that is nothing to do with him');
        await sql(`insert into public.tasks (title, description, owner_id, assigner_id, status)
                   values ('QA rule mention', 'Check the numbers with Khalid QA first', '${P.SAAD}', '${QA_BOSS}', 'assigned')`);
        expect(await sees('KHALID', 'QA rule mention'), 'Khalid can’t see a task that names him');
        expect(!(await sees('ABDULLAH', 'QA rule mention')), 'Abdullah sees a task that doesn’t name him');
        expect(await sees('SAAD', 'QA rule mention'), 'Saad can’t see his own task');
        return 'right people only';
      });
      await check('rules', 'Admins still see everything', async () => {
        expect((await get(`tasks?select=id&title=like.QA%20rule%25`, jwt)).length >= 4, 'the admin misses tasks');
        return 'all';
      });
      await check('rules', 'The people pickers offer only who you may give a task to', async () => {
        const ids = (await rpc('assignable_people', {}, await as('ABDULLAH'))).map((x) => x.assignable_people ?? x);
        expect(ids.includes(P.KHALID) && ids.includes(P.ABDULLAH), 'Khalid or Abdullah himself missing');
        expect(!ids.includes(P.FAISAL) && !ids.includes(QA_BOSS) && !ids.includes(P.NOURA), 'a manager is offered to Abdullah');
        return `${ids.length} people`;
      });
      // The owner, 9 Nov: "I should not be able to cancel a task I didn't create" and "make it only one option"
      await check('rules', 'Only whoever gave a task (or above) can cancel it; the chat says who', async () => {
        const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA rule cancel', '${P.ABDULLAH}', '${P.FAISAL}', 'assigned') returning id`);
        const mine = await rpc('cancel_task', { p_task: t.id }, await as('ABDULLAH')).then(() => 'ok', (e) => e);
        expect(mine instanceof Error, 'Abdullah cancelled a task Faisal gave him');
        const r = await fn('muntej-chat', { message: 'ألغ مهمة QA rule cancel', focus_task_id: t.id, source: 'text', lang: 'ar' }, await as('ABDULLAH'));
        const last = r.messages?.at(-1) ?? {};
        expect(!last.payload?.confirm_delete, 'the chat offered Abdullah a Cancel button');
        expect(/فيصل|Faisal/.test(last.content ?? ''), `the chat didn't say only Faisal can: «${(last.content ?? '').slice(0, 90)}»`);
        const [still] = await sql(`select status from public.tasks where id = '${t.id}'`);
        expect(still.status !== 'cancelled', 'it was cancelled anyway');
        const giver = await rpc('cancel_task', { p_task: t.id }, await as('FAISAL')).then(() => 'ok', (e) => e);
        expect(giver === 'ok', `Faisal couldn't cancel his own task: ${giver?.message}`);
        await sql(`delete from public.chat_messages where profile_id = '${P.ABDULLAH}' and created_at > now() - interval '5 minutes'`);
        return 'owner refused, giver allowed';
      });
      // The owner, 9 Nov (N2): "ask for deadline extension, or add a comment to the owner", in her own words
      await check('rules', 'The doer’s comment and “more time” reach whoever gave the task', async () => {
        const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status, due_at) values ('QA rule comment', '${P.ABDULLAH}', '${P.FAISAL}', 'in_progress', now() + interval '1 day') returning id`);
        await rpc('add_task_comment', { p_task: t.id, p_body: 'محتاج ملف العميل قبل ما أبدأ' }, await as('ABDULLAH'));
        const [a] = await sql(`select count(*)::int n from public.alerts where profile_id = '${P.FAISAL}' and kind = 'task_comment' and task_id = '${t.id}'`);
        expect(a.n === 1, 'Faisal got no alert for the comment');
        const [c] = await sql(`select body from public.task_comments where task_id = '${t.id}'`);
        expect(c?.body === 'محتاج ملف العميل قبل ما أبدأ', 'the comment wasn’t saved in her words');
        const sent = await rpc('request_more_time', { p_task: t.id, p_new_due: new Date(Date.now() + 4 * 86_400_000).toISOString(), p_reason: 'العميل تأخر بالملف' }, await as('ABDULLAH'));
        expect(sent === true, 'more time was not sent');
        const [d] = await sql(`select manager_id, details->>'reason' reason from public.decisions where task_id = '${t.id}' and type = 'extension_request' and status = 'pending'`);
        expect(d?.manager_id === P.FAISAL && d.reason === 'العميل تأخر بالملف', `the ask went to ${d?.manager_id ?? 'nobody'} with «${d?.reason}»`);
        await sql(`delete from public.decisions where task_id = '${t.id}'; delete from public.alerts where task_id = '${t.id}'`);
        return 'comment + more time with her reason';
      });
      // The owner, 9 Nov (N6): "I said I was busy, the manager approved, and it's still on my tasks with «استلمت»"
      await check('rules', 'Agreeing to “busy” takes the task back off her list', async () => {
        const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA rule busy', '${P.ABDULLAH}', '${P.FAISAL}', 'assigned') returning id`);
        const [d] = await sql(`insert into public.decisions (task_id, manager_id, requested_by, type, title, recommendation, recommendation_reason)
                               values ('${t.id}', '${P.FAISAL}', '${P.ABDULLAH}', 'priority_question', 'QA busy', 'عندي تسليم', 'عندي تسليم') returning id`);
        await sql(`update public.decisions set status = 'approved', resolved_by = '${P.FAISAL}', resolved_at = now() where id = '${d.id}'`);
        const [after] = await sql(`select owner_id, status from public.tasks where id = '${t.id}'`);
        expect(after.owner_id === P.FAISAL, 'the task is still hers after the giver agreed');
        const [a] = await sql(`select title_ar from public.alerts where profile_id = '${P.ABDULLAH}' and kind = 'request_answered' and task_id = '${t.id}'`);
        expect(/أخذها منك/.test(a?.title_ar ?? ''), `she heard «${a?.title_ar ?? 'nothing'}»`);
        await sql(`delete from public.alerts where task_id = '${t.id}'; delete from public.decisions where id = '${d.id}'`);
        return 'back with the giver, she was told';
      });
      // The owner, 9 Nov (N3): "when you create a task you get to choose if it is auto close or sent for review"
      await check('rules', '“Closes by itself” closes on the doer’s Done; otherwise it goes for review', async () => {
        const [a] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA rule review', '${P.ABDULLAH}', '${P.FAISAL}', 'in_progress') returning id`);
        const [b] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status, closes_itself) values ('QA rule selfclose', '${P.ABDULLAH}', '${P.FAISAL}', 'in_progress', true) returning id`);
        const ra = await rpc('set_task_status', { p_task: a.id, p_status: 'done' }, await as('ABDULLAH'));
        const rb = await rpc('set_task_status', { p_task: b.id, p_status: 'done' }, await as('ABDULLAH'));
        expect(ra === 'submitted', `the review task became ${ra}`);
        expect(rb === 'done', `the self-closing task became ${rb}`);
        // the giver can switch it: «أراجعها أنا» ↔ «تنقفل لحالها»
        await rpc('set_task_status', { p_task: a.id, p_status: 'reopen' }, await as('ABDULLAH'));
        return 'review → submitted, closes by itself → done';
      });
    } finally {
      await tidy();
      if (!was) await sql(`update public.profiles set tester = false where id in (${people})`);
    }
  }

  await check('tasks', 'No database function points at a column or table that isn’t there', async () => {
    // plpgsql_check is installed only inside this block: the final raise rolls everything back, and carries the answer
    const r = await sql(`do $do$
      declare r record; e record; found text := ''; rel oid;
      begin
        create extension plpgsql_check;
        for r in select p.oid, p.proname, p.prorettype = 'trigger'::regtype as is_trigger
                   from pg_proc p join pg_language l on l.oid = p.prolang
                  where p.pronamespace = 'public'::regnamespace and l.lanname = 'plpgsql'
        loop
          rel := 0;
          if r.is_trigger then
            select t.tgrelid into rel from pg_trigger t where t.tgfoid = r.oid and not t.tgisinternal limit 1;
            continue when rel is null;
          end if;
          for e in select * from plpgsql_check_function_tb(r.oid, rel, fatal_errors := false, other_warnings := false, extra_warnings := false, performance_warnings := false) where level = 'error'
          loop
            found := found || r.proname || ': ' || e.message || '; ';
          end loop;
        end loop;
        raise exception 'SWEEP[%]', found;
      end $do$;`).catch((e) => e);
    const m = /SWEEP\[(.*?)\]/s.exec(r?.message ?? '');
    expect(m, `the check itself failed: ${r?.message ?? 'no answer'}`);
    expect(!m[1], m[1]);
    return 'all clean';
  });
}
