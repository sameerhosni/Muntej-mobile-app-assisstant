// The owner's screenshot, 4 Nov: on a task, "Request proof" answered `column "account_id" does not exist`. The function
// looked for a company on the task, and tasks have none; Postgres only finds that when the function runs, so it was
// broken for every manager since 29 Oct. The last check finds this whole kind of mistake in every database function.
export async function taskCases({ check, expect, fn, sql, jwt, ids, jwtFor, rpc, insert }) {
  const { QA_ACCOUNT, QA_BOSS } = ids;
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
  // The owner, 5 Nov: "You added 3 active but no one received the invitation yet and no one accept it neither login".
  // Sending an email invitation makes the login, and that alone said "active" and told the manager they joined.
  const INVITED = 'qa-invited@qa.muntej.test';
  const LOGIN = 'a0000000-0000-4000-b000-0000000000e1';
  const tidyInvited = () =>
    sql(`delete from public.alerts where subject_id in (select id from public.profiles where lower(email) = '${INVITED}');
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
      await sql(`update auth.users set email_confirmed_at = now(), last_sign_in_at = now() where id = '${LOGIN}'`);
      const p = await seat();
      expect(p.status === 'active', `still "${p.status}"`);
      expect((await joinedAlerts()) === 1, 'the manager was not told');
      return 'active';
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
