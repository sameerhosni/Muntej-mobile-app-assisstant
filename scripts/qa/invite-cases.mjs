// The owner's employee, 4 Nov: "I downloaded the app, but never found any notification to join". He already had a
// login, so nothing was sent and his new company sat silently in Settings. Someone in a second company plays him: the
// demo company's Faisal (every channel off there, so no real phone rings). Judged against the database, like cases.mjs.
export async function inviteCases({ check, expect, fn, sql, jwt, ids, jwtFor, rpc }) {
  const { QA_ACCOUNT, QA_BOSS } = ids;
  const DEMO = 'c0000000-0000-4000-b000-000000000001';
  const HIM = 'c0000000-0000-4000-b000-000000000011';
  const EMAIL = 'faisal@demo.muntej.test';
  const tidy = () =>
    sql(`delete from public.profiles where account_id = '${QA_ACCOUNT}' and (lower(email) in ('${EMAIL}', 'qa-nobody@qa.muntej.test') or full_name like 'QA invite %');
         delete from public.alerts where profile_id = '${HIM}' and kind = 'added_to_company';`);
  await tidy();
  const hisJwt = await jwtFor(HIM, DEMO);
  await rpc('switch_account', { p_account: DEMO }, hisJwt);
  let seat = null;
  let nobody = null;
  try {
    await check('invites', 'Someone with a login is told when added to a company', async () => {
      seat = await rpc('upsert_person', { p: { full_name: 'QA invite Faisal', email: EMAIL, role: 'employee', manager_id: QA_BOSS } }, jwt);
      const [a] = await sql(`select title, title_ar from public.alerts where profile_id = '${HIM}' and kind = 'added_to_company' and subject_id = '${seat}'`);
      expect(a, 'no alert reached his current company');
      expect(a.title_ar, 'no Arabic text');
      const [i] = await sql(`select channel, status from public.invites where profile_id = '${seat}' order by sent_at desc limit 1`);
      expect(i?.channel === 'app' && i?.status === 'sent', `the manager sees ${JSON.stringify(i)}, not "told in the app"`);
      return a.title;
    });
    await check('invites', 'His app offers the new company', async () => {
      const list = await rpc('my_new_companies', {}, hisJwt);
      expect(list.some((c) => c.account_id === QA_ACCOUNT), `offered ${JSON.stringify(list)}`);
      return 'offered';
    });
    await check('invites', 'Opening it makes him active and tells the manager', async () => {
      await rpc('switch_account', { p_account: QA_ACCOUNT }, hisJwt);
      const [p] = await sql(`select status from public.profiles where id = '${seat}'`);
      expect(p.status === 'active', `still ${p.status}`);
      const [i] = await sql(`select status from public.invites where profile_id = '${seat}' order by sent_at desc limit 1`);
      expect(i.status === 'joined', `invite is ${i.status}`);
      const told = await sql(`select id from public.alerts where profile_id = '${QA_BOSS}' and kind = 'member_joined' and subject_id = '${seat}'`);
      expect(told.length === 1, `the manager got ${told.length} joined alerts`);
      expect(!(await rpc('my_new_companies', {}, hisJwt)).length, 'still offered after opening it');
      return 'active';
    });
    await check('invites', 'An employee can’t get a colleague’s join link', async () => {
      nobody = await rpc('upsert_person', { p: { full_name: 'QA invite Nobody', role: 'employee', manager_id: QA_BOSS } }, jwt);
      const r = await fn('invite', { link: { person_id: nobody } }, hisJwt).catch((e) => e);
      expect(r instanceof Error && /403/.test(r.message), `answered ${r?.message ?? JSON.stringify(r)}`);
      return 'refused';
    });
    await check('invites', 'Someone with no email or mobile joins with a shared link', async () => {
      const { url } = await fn('invite', { link: { person_id: nobody } }, jwt);
      const token = new URL(url).searchParams.get('t');
      expect(token, `no token in ${url}`);
      const { token_hash } = await fn('phone-auth', { action: 'redeem', token });
      expect(token_hash, 'no sign-in');
      const [p] = await sql(`select status, email, user_id from public.profiles where id = '${nobody}'`);
      expect(p.user_id && p.status === 'active', `after the link: ${JSON.stringify(p)}`);
      expect(!p.email, 'the internal address leaked into their profile');
      const [n] = await sql(`select count(*)::int c from public.profiles where user_id = '${p.user_id}'`);
      expect(n.c === 1, `a stray company was made for them (${n.c} seats)`);
      const [i] = await sql(`select channel from public.invites where profile_id = '${nobody}' order by sent_at desc limit 1`);
      expect(i.channel === 'link', `invite channel ${i.channel}`);
      return 'joined';
    });
    await check('invites', 'No join link for someone we can reach', async () => {
      const id = await rpc('upsert_person', { p: { full_name: 'QA invite Reachable', email: 'qa-nobody@qa.muntej.test', role: 'employee', manager_id: QA_BOSS } }, jwt);
      const r = await fn('invite', { link: { person_id: id } }, jwt).catch((e) => e);
      expect(r instanceof Error && /400/.test(r.message), `answered ${r?.message ?? JSON.stringify(r)}`);
      return 'refused';
    });
  } finally {
    await rpc('switch_account', { p_account: DEMO }, hisJwt).catch(() => {});
    const users = nobody ? await sql(`select user_id from public.profiles where id = '${nobody}' and user_id is not null`) : [];
    await tidy().catch(() => {});
    for (const u of users) await sql(`delete from auth.users where id = '${u.user_id}'`).catch(() => {});
  }
}
