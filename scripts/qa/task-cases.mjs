// The owner's screenshot, 4 Nov: on a task, "Request proof" answered `column "account_id" does not exist`. The function
// looked for a company on the task, and tasks have none; Postgres only finds that when the function runs, so it was
// broken for every manager since 29 Oct. The last check finds this whole kind of mistake in every database function.
export async function taskCases({ check, expect, sql, jwt, ids, jwtFor, rpc, insert }) {
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
