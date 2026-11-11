// Muntej QA — the check that runs before every update is published (owner, 28 Oct: "create a tool to test any
// enhancement before applying it, tell you the bugs, fix, and loop until everything is correct").
//   node scripts/qa/run.mjs            everything
//   node scripts/qa/run.mjs --no-ui    code + server only (no browser)
//   node scripts/qa/run.mjs --only ui  only the screens
//   node scripts/qa/run.mjs --only cases  only the real cases
//   node scripts/qa/run.mjs --only tasks  only the task cases
// What it does:
//   1. code: app type-check, every edge function type-check
//   2. resets the separate test company "Muntej QA" (scripts/qa/seed.sql; real companies are never touched) and signs
//      in as its manager with a one-time test link (no shared code, no real person)
//   3. server: Saree3 chat, the three reports, reading a team, confirming it, WhatsApp turns (dry, nothing sent),
//      WhatsApp sign-in, ideas
//   3b. real cases (scripts/qa/cases.mjs): the owner's complaints as tests, judged against the database: inbox
//      messages that must (not) become tasks, Hoda's chat replayed, counts that must match, channels that must send
//   4. screens: runs the app in a browser on this PC, opens every screen (errors, blank screens, crashes) and the key
//      flows (build a team → review → edit someone; send an idea; Customize Home), with screenshots
// Writes qa-out/report.md and qa-out/*.png; exits 1 when anything failed.
// Needs: SUPABASE_ACCESS_TOKEN (user env var, as db-apply), .env (public URL + key), Playwright's Chromium.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cases } from './cases.mjs';
import { inviteCases } from './invite-cases.mjs';
import { taskCases } from './task-cases.mjs';
import { areasFor, CORE } from './core.mjs';

// the company network re-signs HTTPS; without the system certificates every call to Supabase fails ("fetch failed")
if (!process.execArgv.includes('--use-system-ca') && !(process.env.NODE_OPTIONS ?? '').includes('--use-system-ca')) {
  const r = spawnSync(process.execPath, ['--use-system-ca', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'qa-out');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const want = (part) => !only || only === part;
const noUi = args.includes('--no-ui');

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const REF = env.SUPABASE_PROJECT_REF || 'katwiedukkvssuxbjbqf';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const QA_ACCOUNT = 'a0000000-0000-4000-b000-000000000001';
const QA_BOSS = 'a0000000-0000-4000-b000-000000000010';
const QA_PHONE = '966500000010';

// ─── results ──────────────────────────────────────────────────────────────────
const results = [];
const ok = (area, name, detail = '') => results.push({ area, name, pass: true, detail });
const bad = (area, name, detail = '') => results.push({ area, name, pass: false, detail: String(detail).slice(0, 600) });
// setup only the owner can do (a DNS record, an account): shown as a warning, doesn't stop a release
const WARN_ONLY = new Set(['delivery']);

// ─── which checks run (owner, 11 Nov: "choose the most important test cases and run it every time … the other minor
// and low priority cases … if we are testing anything related to it"): the core ones always; an area's others when a
// file of that area changed since the last test release (tag `testing`); a check added or edited since then; all of
// them with --full (ship --live runs --full) ─────────────────────────────────
const full = args.includes('--full') || !!only;
const since = (() => {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'testing'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? 'testing' : null;
})();
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }).stdout ?? '';
// everything since the test release, the working tree and new files included
const changedFiles = since
  ? [...new Set([...git('diff', '--name-only', since).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].map((f) => f.trim()).filter(Boolean))]
  : [];
const changedAreas = areasFor(changedFiles);
// a QA check added or edited (any line of it, the working tree too) runs its whole area, with the checks that set up and
// undo its data (reviewer, 11 Nov, R146)
if (since)
  for (const f of changedFiles.filter((x) => /^scripts\/qa\/.*\.mjs$/.test(x) && existsSync(join(ROOT, x)))) {
    const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
    // each check's span: from its `check('area'` line until its braces close (reviewer, 11 Nov). A changed line inside
    // a span selects that area; one outside every span (a helper, a shared list, setup) selects every area the file has
    const spans = [];
    lines.forEach((l, i) => {
      const m = /check\('(\w+)'/.exec(l);
      if (!m) return;
      let depth = 0;
      let opened = false;
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j].slice(j === i ? m.index : 0)) {
          if (ch === '{') (depth++, (opened = true));
          else if (ch === '}') depth--;
        }
        if (opened && depth <= 0) return void spans.push({ area: m[1], from: i, to: j });
      }
      spans.push({ area: m[1], from: i, to: lines.length - 1 });
    });
    const fileAreas = [...new Set(spans.map((s) => s.area))];
    const diff = git('diff', '-U0', since, '--', f);
    const touched = diff ? [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].flatMap((m) => Array.from({ length: Math.max(1, Number(m[2] ?? 1)) }, (_, k) => Number(m[1]) - 1 + k)) : lines.map((_, i) => i);
    for (const n of touched) {
      const inside = spans.filter((s) => n >= s.from && n <= s.to);
      for (const a of inside.length ? inside.map((s) => s.area) : fileAreas) changedAreas.add(a);
    }
  }
// exact names; one ending in * matches by its start
const isCore = (name) => CORE.some((c) => (c.endsWith('*') ? name.startsWith(c.slice(0, -1)) : name === c));
const runs = (area, name) => full || !since || isCore(name) || changedAreas.has(area);
const skipped = [];
const secondTry = [];

// checks the AI judges (inbox: each reads its own fresh message and the suggestions it returns), and network blips:
// one second try before they stop a release. Never a 500 from our own functions (a crash in our code, R137)
const RETRY_AREAS = new Set(['inbox']);
const blip = (m) => /fetch failed|ECONNRESET|socket hang up|\b(502|503|504|52[0-4])\b/i.test(m);
async function check(area, name, fn) {
  if (!runs(area, name)) return void skipped.push({ area, name });
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const d = await fn();
      if (attempt > 1) secondTry.push(name);
      ok(area, name, `${d ?? ''} (${Math.round((Date.now() - t0) / 100) / 10}s)${attempt > 1 ? ' · on the second try' : ''}`);
      return;
    } catch (e) {
      const m = String(e?.message ?? e);
      if (attempt === 1 && (RETRY_AREAS.has(area) || blip(m))) continue;
      bad(area, name, m);
      return;
    }
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ─── helpers ──────────────────────────────────────────────────────────────────
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`sql ${r.status}: ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** a one-time test link for the QA manager (an invites row with only its hash; used once) */
async function qaLinkToken() {
  const token = randomBytes(24).toString('base64url');
  await sql(
    `insert into public.invites (account_id, profile_id, channel, token_hash, status) values ('${QA_ACCOUNT}', '${QA_BOSS}', 'email', '${sha(token)}', 'sent')`,
  );
  return token;
}

async function fn(name, body, jwt, extra = {}) {
  const r = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt ?? ANON}`, apikey: ANON, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not json
  }
  if (!r.ok) throw new Error(`${name} ${r.status}: ${text.slice(0, 300)}`);
  return json;
}

/** sign in as anyone in a test company through a one-time link → access token */
async function jwtFor(profile, account) {
  const token = randomBytes(24).toString('base64url');
  await sql(`insert into public.invites (account_id, profile_id, channel, token_hash, status) values ('${account}', '${profile}', 'email', '${sha(token)}', 'sent')`);
  const { token_hash } = await fn('phone-auth', { action: 'redeem', token });
  const r = await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash }),
  });
  const s = await r.json();
  expect(s.access_token, `verify failed: ${JSON.stringify(s).slice(0, 200)}`);
  return s.access_token;
}

/** a database function, as a signed-in person */
async function rpc(name, args, jwt) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name} ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function insert(table, row, jwt) {
  const r = await fetch(`${URL_}/rest/v1/${table}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`${table} ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

/** a REST read as someone (their row-level rules decide what comes back) */
async function get(path, jwt) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { Authorization: `Bearer ${jwt}`, apikey: ANON } });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/** sign in as the QA manager through the test link → access token */
async function signIn() {
  const token = await qaLinkToken();
  const { token_hash } = await fn('phone-auth', { action: 'redeem', token });
  const r = await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash }),
  });
  const s = await r.json();
  expect(s.access_token, `verify failed: ${JSON.stringify(s).slice(0, 200)}`);
  return s.access_token;
}

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { cwd: ROOT, shell: true, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--use-system-ca' }, ...opts });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// ─── 1. code ──────────────────────────────────────────────────────────────────
async function code() {
  await check('code', 'App type-check (tsc)', async () => {
    const r = run('npx', ['tsc', '--noEmit']);
    expect(r.code === 0, r.out.split('\n').filter((l) => /error TS/.test(l)).slice(0, 8).join('\n') || r.out.slice(-500));
    return 'no errors';
  });
  await check('code', 'Every app string has Hindi', async () => {
    const r = run('node', ['scripts/i18n/hi.mjs', '--check']);
    expect(r.code === 0, `${r.out.slice(0, 500)} Run: npm run i18n:hi`);
    return r.out.split('\n')[0];
  });
  // Nouran, 11 Nov (iOS): the Alerts screen kept a spinner on top and sat pushed down after every save and each return
  // to the app — `refreshing` followed the query, not a pull. R141: no spinner unless you pulled
  await check('code', 'No pull-to-refresh spinner unless you pulled', async () => {
    const files = [...readdirSync(join(ROOT, 'app'), { recursive: true }), ...readdirSync(join(ROOT, 'src'), { recursive: true }).map((f) => join('..', 'src', String(f)))]
      .map(String)
      .filter((f) => f.endsWith('.tsx'));
    // (a pull flag in it is fine: «pulled && q.isRefetching»); comments are not code; a name set from isRefetching and
    // then used as `refreshing={name}` counts too (reviewer, 11 Nov, R140)
    const bad = files.filter((f) => {
      const code = readFileSync(join(ROOT, 'app', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/refreshing=\{(?![^}]*pull)[^}]*(isRefetching|isFetching)/.test(code)) return true;
      const names = [...code.matchAll(/const\s+(\w+)\s*=\s*[^;\n]*\b(isRefetching|isFetching)\b/g)].map((m) => m[1]);
      return names.some((n) => new RegExp(`refreshing=\\{\\s*${n}\\s*\\}`).test(code));
    });
    expect(!bad.length, `refreshing follows the query in: ${bad.join(', ')}`);
    return `${files.length} screens checked`;
  });
  await check('code', 'Edge functions type-check (deno)', async () => {
    const fns = readdirSync(join(ROOT, 'supabase', 'functions')).filter((d) => existsSync(join(ROOT, 'supabase', 'functions', d, 'index.ts')));
    const r = run('npx', ['-y', 'deno', 'check', '--node-modules-dir=none', ...fns.map((f) => `${f}/index.ts`)], { cwd: join(ROOT, 'supabase', 'functions'), timeout: 900_000 });
    expect(r.code === 0, r.out.split('\n').filter((l) => /ERROR|error:/.test(l)).slice(0, 8).join('\n') || r.out.slice(-500));
    return `${fns.length} functions`;
  });
}

// ─── 2–3. server ──────────────────────────────────────────────────────────────
let JWT = null;
async function server() {
  await check('server', 'Reset the test company', async () => {
    await sql(readFileSync(join(ROOT, 'scripts', 'qa', 'seed.sql'), 'utf8'));
    return '6 people, 7 tasks, 1 decision';
  });
  await check('server', 'Test sign-in (one-time link)', async () => {
    JWT = await signIn();
    return 'signed in as the QA manager';
  });
  if (!JWT) return;

  await check('server', 'Saree3 chat answers a question', async () => {
    const r = await fn('muntej-chat', { message: 'وش المتأخر عند الفريق؟', source: 'text' }, JWT);
    const bot = r.messages?.at(-1);
    expect(bot?.content?.length > 10, 'empty reply');
    return bot.content.slice(0, 80);
  });
  for (const kind of ['daily', 'midday', 'evening'])
    await check('server', `Report: ${kind}`, async () => {
      const r = await fn('daily-summary', { test: true, kind, dry: true }, JWT);
      expect(r.preview || r.skipped, 'no preview and no reason');
      if (r.preview) expect(!/undefined|NaN|\{\w+\}/.test(r.preview), `bad text in report: ${r.preview.match(/undefined|NaN|\{\w+\}/)?.[0]}`);
      return r.preview ? `${r.preview.split('\n').length} lines` : `skipped: ${r.skipped}`;
    });
  let draft = null;
  await check('server', 'Read a team from a sentence', async () => {
    const r = await fn('team-import', { action: 'read', text: 'عندنا ماجد مدير التسويق وتحته ريم وسلطان، ولينا مسؤولة الموارد البشرية' }, JWT);
    draft = r.draft;
    expect(draft?.people?.length >= 4, `expected 4 people, got ${draft?.people?.length}`);
    const kids = draft.people.filter((p) => p.manager_ref).length;
    expect(kids >= 2, 'managers not linked');
    return `${draft.people.length} people, ${kids} under a manager`;
  });
  if (draft)
    await check('server', 'Confirm the team', async () => {
      const r = await fn('team-import', { action: 'apply', draft_id: draft.id, people: draft.people }, JWT);
      expect(r.created >= 4 && !r.failed.length, `created ${r.created}, failed ${JSON.stringify(r.failed)}`);
      return `${r.created} added`;
    });
  await check('server', 'Ideas: send one', async () => {
    const r = await fetch(`${URL_}/rest/v1/ideas`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${JWT}`, apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ profile_id: QA_BOSS, account_id: QA_ACCOUNT, kind: 'idea', body: 'QA test idea', screen: 'qa' }),
    });
    expect(r.ok, `${r.status} ${await r.text()}`);
    return 'saved';
  });

  // deleting people (owner, 27 Oct): a manager takes their team, someone under a deleted manager can still be
  // changed, and Restore brings everyone back
  const QA_FAISAL = 'a0000000-0000-4000-b000-000000000011';
  const QA_ABDULLAH = 'a0000000-0000-4000-b000-000000000012';
  const rpc = async (name, body) => {
    const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${JWT}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${name} ${r.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const statusOf = async (id) => (await sql(`select status from public.profiles where id = '${id}'`))[0]?.status;
  await check('server', 'Delete a manager with their team', async () => {
    const r = await rpc('delete_people', { ids: [QA_FAISAL], with_branch: true });
    expect(r.deleted >= 2, `deleted ${r.deleted}`);
    expect((await statusOf(QA_ABDULLAH)) === 'deleted', 'the person under the manager was not deleted');
    return `${r.deleted} deleted in one step`;
  });
  await check('server', 'Change someone whose manager was deleted', async () => {
    // this failed with "Manager not found" before the fix
    await sql(`update public.profiles set status = 'active' where id = '${QA_ABDULLAH}'`);
    await rpc('upsert_person', { p: { id: QA_ABDULLAH, title: 'Sales Rep (QA)' } });
    await rpc('upsert_person', { p: { id: QA_ABDULLAH, status: 'deleted' } });
    return 'edited and deleted';
  });
  await check('server', 'Restore brings the team back', async () => {
    await sql(`update public.profiles set deleted_batch = (select deleted_batch from public.profiles where id = '${QA_FAISAL}') where id = '${QA_ABDULLAH}'`);
    const n = await rpc('restore_person', { person: QA_FAISAL, with_batch: true });
    expect(n >= 2, `restored ${n}`);
    expect((await statusOf(QA_ABDULLAH)) !== 'deleted', 'the person under the manager stayed deleted');
    return `${n} back`;
  });
  await check('server', 'Proof: adding it re-checks the work', async () => {
    const [task] = await sql("select t.id, r.ai_check->>'at' as at from public.tasks t join public.reviews r on r.task_id = t.id where t.title = 'Send the signed contract' and t.assigner_id = '" + QA_BOSS + "' order by r.created_at desc limit 1");
    expect(task, 'seeded task missing');
    const r = await fetch(`${URL_}/rest/v1/evidence`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${JWT}`, apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ task_id: task.id, type: 'link', url: 'https://example.com/signed-contract.pdf', title: 'signed-contract.pdf', uploaded_by: QA_BOSS }),
    });
    expect(r.ok, `${r.status} ${await r.text()}`);
    for (let i = 0; i < 30; i++) {
      await new Promise((ok) => setTimeout(ok, 2000));
      const [now] = await sql(`select ai_check->>'at' as at, ai_check->>'verdict' as v from public.reviews where task_id = '${task.id}' order by created_at desc limit 1`);
      if (now?.at && now.at !== task.at) return `checked again: ${now.v}`;
    }
    throw new Error('the check did not run again after adding proof (60 s)');
  });
  await check('server', 'Proof is optional by default', async () => {
    const [x] = await sql(`select count(*)::int as n from public.tasks where proof_required <> 'none' and assigner_id = '${QA_BOSS}'`);
    expect(x.n === 0, `${x.n} QA tasks require proof`);
    return 'none required';
  });

  // WhatsApp, dry (the server answers into the test, nothing is sent)
  const secret = (await sql("select decrypted_secret as s from vault.decrypted_secrets where name='cron_secret'"))[0]?.s;
  await sql(`update public.profiles set phone = '${QA_PHONE}' where id = '${QA_BOSS}'`);
  const wa = async (text) => (await fn('whatsapp', { simulate: { from: QA_PHONE, text } }, null, { 'x-cron-secret': secret })).sent ?? [];
  const texts = (msgs) => msgs.map((m) => m.text?.body ?? m.interactive?.body?.text ?? JSON.stringify(m)).join(' | ');
  for (const [say, need] of [
    ['مساعدة', /سريع|Saree3/],
    ['وش يحتاجني', /يحتاج|تحتاج|need/],
    ['وش المتأخر؟', /.{10}/],
    ['رمز الدخول', /رمز|code/],
  ])
    await check('whatsapp', `“${say}”`, async () => {
      const msgs = await wa(say);
      expect(msgs.length, 'no reply');
      expect(need.test(texts(msgs)), `unexpected reply: ${texts(msgs).slice(0, 200)}`);
      return `${msgs.length} message(s)`;
    });
  await check('whatsapp', 'Sign in with WhatsApp (key flow)', async () => {
    const s = await fn('phone-auth', { action: 'wa_start' });
    const before = await fn('phone-auth', { action: 'wa_poll', token: s.nonce });
    expect(before.waiting, 'should wait before the message');
    await sql(`update public.wa_logins set profile_id = '${QA_BOSS}', phone = '${QA_PHONE}', approved_at = now() where nonce = '${s.nonce}'`);
    const after = await fn('phone-auth', { action: 'wa_poll', token: s.nonce });
    expect(after.token_hash, 'no sign-in after the message');
    return 'waits, then signs in';
  });
  // The owner, 10 Nov: Nouran tapped «↩️ رجّعها» on one seat, typed why, and the answer reached her other seat on the
  // same number, which didn't know which task. Two seats on one number: the typed answer goes to the seat that asked.
  await check('whatsapp', 'A typed answer goes to the seat that asked for it (two seats, one number)', async () => {
    // the second seat is in another company (one number holds one seat per company): the demo company's person
    const DEMO = 'c0000000-0000-4000-b000-000000000001';
    const OTHER = 'c0000000-0000-4000-b000-000000000011';
    const [{ ai_consent: otherAi, phone: otherPhone }] = await sql(`select ai_consent, phone from public.profiles where id = '${OTHER}'`);
    // the QA seed removes test logins: the second seat needs one to be found on WhatsApp (reviewer, 10 Nov, R100)
    await jwtFor(OTHER, DEMO);
    const [task] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA two seats answer', '${OTHER}', '${OTHER}', 'in_progress') returning id`);
    // Nouran's state: other cards came after her tap (a newer pending row on the other seat), and the asking seat may
    // not have allowed AI (reviewer, 10 Nov: without these the case passed on the old code too)
    const newer = `qa${Date.now().toString(36)}`;
    await sql(`update public.profiles set phone = '${QA_PHONE}' where id = '${OTHER}'`);
    try {
      const answerAs = async (consent) => {
        await sql(`update public.profiles set ai_consent = ${consent} where id = '${OTHER}'`);
        await sql(`insert into public.wa_pending (key, profile_id, body, created_at) values ('cm:${OTHER}', '${OTHER}', '{"task_id":"${task.id}"}', now())
                   on conflict (key) do update set body = excluded.body, created_at = now()`);
        await sql(`insert into public.wa_pending (key, profile_id, body, created_at) values ('${newer}', '${QA_BOSS}', '{}', now() + interval '1 second')
                   on conflict (key) do update set created_at = now() + interval '1 second'`);
        const word = `QA جواب ${Date.now()}`;
        const msgs = await wa(word);
        const [c] = await sql(`select author_id from public.task_comments where task_id = '${task.id}' and body = '${word}'`);
        expect(c, `${consent ? 'with' : 'without'} AI: the answer didn’t land on the task: ${texts(msgs).slice(0, 140)}`);
        expect(c.author_id === OTHER, 'the answer landed as the other seat');
      };
      await answerAs(true);
      await answerAs(false);
      return 'answered as the seat that asked, with or without AI consent, after other cards';
    } finally {
      await sql(`update public.profiles set phone = ${otherPhone ? `'${otherPhone}'` : 'null'}, ai_consent = ${otherAi === null ? 'null' : otherAi} where id = '${OTHER}'`);
      await sql(`delete from public.wa_pending where key in ('cm:${OTHER}', '${newer}')`);
      await sql(`delete from public.tasks where id = '${task.id}'`);
    }
  });
  // The owner, 10 Nov: "Muntej must understand whatever you type or say («بكرة»، «الخميس الساعة 3»)". «✍️ جاوب» on a
  // due-date question, then the words: the task's due date is set from them.
  await check('whatsapp', 'A due date answered in words («بكرة الساعة 3») is set on the task', async () => {
    const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA due by words', '${QA_FAISAL}', '${QA_BOSS}', 'in_progress') returning id`);
    try {
      await sql(`insert into public.wa_pending (key, profile_id, body, created_at) values ('da:${QA_BOSS}', '${QA_BOSS}', '{"task_id":"${t.id}","what":"due"}', now())
                 on conflict (key) do update set body = excluded.body, created_at = now()`);
      const msgs = await wa('بكرة الساعة 3');
      const [row] = await sql(`select to_char(due_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24') d from public.tasks where id = '${t.id}'`);
      const tomorrow = new Date(Date.now() + 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
      expect(row.d === `${tomorrow} 15`, `due is ${row.d ?? 'not set'}: ${texts(msgs).slice(0, 140)}`);
      return `${row.d}:00 · ${texts(msgs).slice(0, 60)}`;
    } finally {
      await sql(`delete from public.wa_pending where key = 'da:${QA_BOSS}'`);
      await sql(`delete from public.alerts where task_id = '${t.id}'`);
      await sql(`delete from public.tasks where id = '${t.id}'`);
    }
  });
  // The owner, 10 Nov: "unclear" — Nouran got «من أدواتك: لقيت مهمة وحدة لك، تنتظر موافقتك» (no name, no buttons), asked
  // «ايه هي؟», and the chat answered about another task. Read as the user: the next «ايه هي؟» shows that task's card.
  await check('whatsapp', 'After «found a task in your tools», «ايه هي؟» shows exactly that task with Approve / Ignore', async () => {
    const sug = (title) => `[{"title":"${title}","owner_id":null,"due_at":null,"priority":"medium","state":"new","task_id":null,"duplicate_of":null,"confidence":0.9,"quote":"please confirm the push status today","description":null,"definition_of_done":null,"proof_required":"none","budget":null,"estimate_hours":null,"requested_by":"Mohammed QA","amends_earlier":false,"owner_name":null,"outside":false,"asked_by_user":false,"asked_of_user":true}]`;
    const item = async (owner, title, ago) =>
      (await sql(`insert into public.incoming_items (owner_id, source, external_id, body, summary, status, suggestions, received_at)
        values ('${owner}', 'gmail', 'qa-${Math.random().toString(36).slice(2)}', 'QA', 'QA', 'new', '${sug(title)}'::jsonb, now() - interval '${ago}') returning id`))[0];
    const alert = async (owner, itemId) =>
      (await sql(`insert into public.alerts (profile_id, kind, title, body, title_ar, body_ar, dedupe_key, delivered_at)
        values ('${owner}', 'tools_found', 'From your tools', 'x', 'من أدواتك', 'x', 'tools_found:qa:${Date.now()}:${itemId}', now()) returning id`))[0];
    const made = { items: [], alerts: [], tasks: [] };
    let bossSession = null;
    const DEMO = 'c0000000-0000-4000-b000-000000000001';
    const OTHER = 'c0000000-0000-4000-b000-000000000011';
    const [{ phone: otherPhone }] = await sql(`select phone from public.profiles where id = '${OTHER}'`);
    try {
      // the alert's task is older than another waiting one: the reply must show the alert's, not the newest
      const tag = Date.now().toString(36);
      const found = await item(QA_BOSS, `QA found ${tag}`, '3 days');
      const newer = await item(QA_BOSS, `QA newer other ${tag}`, '1 minute');
      made.items.push(found.id, newer.id);
      made.alerts.push((await alert(QA_BOSS, found.id)).id);
      const msgs = await wa('ايه هي؟');
      const all = JSON.stringify(msgs);
      expect(all.includes(`QA found ${tag}`), `the alert's task wasn't shown: ${texts(msgs).slice(0, 140)}`);
      expect(!all.includes(`QA newer other ${tag}`), 'showed another waiting task instead');
      // Approve and a way to say no: «✖️ تجاهل», or «⋯ خيارات» (found_task_choices, testers first)
      expect(all.includes(`ok:${found.id}:0`) && (all.includes(`no:${found.id}:0`) || all.includes(`tx:${found.id}:0`)), 'no Approve / Ignore on it');
      // enough to decide right there (owner, 10 Nov: "from whom and when or any other important things"): who, their words
      expect(all.includes('Mohammed QA') && all.includes('please confirm the push status today'), `the card doesn't say who asked or what they wrote: ${texts(msgs).slice(0, 160)}`);
      // …and when (the day it was sent, as the card writes it)
      const sentDay = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(Date.now() - 3 * 86_400_000));
      expect(all.includes(sentDay), `the card doesn't say when it was sent (${sentDay}): ${texts(msgs).slice(0, 160)}`);
      // a chat space / DM in the sender field is a place, never "who asked" (reviewer, 10 Nov)
      const placeItem = (await sql(`insert into public.incoming_items (owner_id, source, external_id, body, summary, status, sender, subject, suggestions, received_at)
        values ('${QA_BOSS}', 'google_chat', 'qa-${Math.random().toString(36).slice(2)}', 'QA', 'QA', 'new', 'QA Space ${tag}', 'QA Space ${tag}',
        '${sug(`QA place ${tag}`).replace('"requested_by":"Mohammed QA"', '"requested_by":null')}'::jsonb, now() - interval '2 days') returning id`))[0];
      made.items.push(placeItem.id);
      made.alerts.push((await alert(QA_BOSS, placeItem.id)).id);
      const pm = JSON.stringify(await wa('ايه هي؟'));
      expect(pm.includes(`QA place ${tag}`), 'the place item’s card wasn’t shown');
      expect(!pm.includes(`من QA Space ${tag}`) && !pm.includes('من Direct message'), 'a chat space was shown as the person who asked');
      // the alert's items are settled: it says so, and shows nothing else (R117)
      // (the place item's alert is the newest now: settle both, so either way the answer is "nothing waiting")
      await sql(`update public.incoming_items set status = 'done' where id in ('${found.id}', '${placeItem.id}')`);
      const settled = await wa('ايه هي؟');
      const sj = JSON.stringify(settled);
      expect(/ما عاد فيه شي ينتظرك|nothing from them is waiting/.test(texts(settled)), `settled items, but: ${texts(settled).slice(0, 120)}`);
      expect(!sj.includes('ok:') && !sj.includes('no:') && !sj.includes(`QA newer other ${tag}`), 'showed other waiting items');
      // the alert on the number's OTHER seat (two companies): still found
      await jwtFor(OTHER, DEMO);
      await sql(`update public.profiles set phone = '${QA_PHONE}' where id = '${OTHER}'`);
      // QA_BOSS is the seat WhatsApp picks (its session is the newest, no pending answers): the alert sits on the other
      // one, so only the across-seats lookup can find it (reviewer, 10 Nov, R99)
      await sql(`delete from public.wa_pending where profile_id in ('${QA_BOSS}', '${OTHER}') and created_at > now() - interval '2 hours'`);
      bossSession = (await sql(`select s.account_id, s.updated_at from public.account_sessions s join public.profiles p on p.user_id = s.user_id where p.id = '${QA_BOSS}'`))[0] ?? null;
      await sql(`insert into public.account_sessions (user_id, account_id, updated_at) select user_id, account_id, now() + interval '1 minute' from public.profiles where id = '${QA_BOSS}'
                 on conflict (user_id) do update set account_id = excluded.account_id, updated_at = excluded.updated_at`);
      const theirs = await item(OTHER, `QA other seat ${tag}`, '2 days');
      made.items.push(theirs.id);
      made.alerts.push((await alert(OTHER, theirs.id)).id);
      const msgs2 = await wa('ايه هي؟');
      expect(JSON.stringify(msgs2).includes(`QA other seat ${tag}`), `the other seat's alert was missed: ${texts(msgs2).slice(0, 140)}`);
      await sql(`update public.profiles set phone = ${otherPhone ? `'${otherPhone}'` : 'null'} where id = '${OTHER}'`);
      // no card for the alert's task: the task itself. Their own open task → its buttons; one they gave → its line
      const mineT = (await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA wii m${tag}', '${QA_BOSS}', '${QA_BOSS}', 'in_progress') returning id`))[0];
      const gaveT = (await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA wii g${tag}', '${QA_FAISAL}', '${QA_BOSS}', 'in_progress') returning id`))[0];
      // a task with a card of its own (waiting for their review): that card
      const reviewT = (await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA wii r${tag}', '${QA_FAISAL}', '${QA_BOSS}', 'submitted') returning id`))[0];
      made.tasks.push(mineT.id, gaveT.id, reviewT.id);
      for (const [t, own] of [[mineT, true], [gaveT, false], [reviewT, 'card']]) {
        made.alerts.push((await sql(`insert into public.alerts (profile_id, kind, task_id, title, body, title_ar, body_ar, dedupe_key, delivered_at)
          values ('${QA_BOSS}', 'task_comment', '${t.id}', 'QA comment', 'x', 'تعليق', 'x', 'qa-wii-${t.id}', now() + interval '5 seconds') returning id`))[0].id);
        const r = await wa('ايه هي؟');
        const j = JSON.stringify(r);
        if (own === 'card') {
          expect(j.includes(`r:ok:${t.id}`) && j.includes(`r:back:${t.id}`), `no review card: ${texts(r).slice(0, 140)}`);
          expect(!j.includes('h:done:') && !/تفاصيلها في منتج/.test(texts(r)), 'the card branch fell through');
          continue;
        }
        // titles get translated for the reader («سوي QA: what is it mine …»): match the unique tag, not the words
        expect(j.includes(`${own ? 'm' : 'g'}${tag}`), `the task wasn't shown (${own ? 'own' : 'given'}): ${texts(r).slice(0, 140)}`);
        if (own) expect(j.includes(`h:done:${t.id}`), 'no Done / Need time / Need help on their own task');
        else expect(!j.includes('h:done:') && /تفاصيلها في منتج|Details in Muntej/.test(texts(r)), `a given task should just say where to see it: ${texts(r).slice(0, 120)}`);
      }
      return 'that exact task, on either seat; the task itself when there is no card';
    } finally {
      await sql(`update public.profiles set phone = ${otherPhone ? `'${otherPhone}'` : 'null'} where id = '${OTHER}'`);
      if (bossSession) await sql(`update public.account_sessions s set account_id = '${bossSession.account_id}', updated_at = '${bossSession.updated_at}' from public.profiles p where p.user_id = s.user_id and p.id = '${QA_BOSS}'`);
      else await sql(`delete from public.account_sessions s using public.profiles p where p.user_id = s.user_id and p.id = '${QA_BOSS}'`);
      if (made.tasks.length) {
        await sql(`delete from public.alerts where task_id in (${made.tasks.map((x) => `'${x}'`).join(',')})`);
        await sql(`delete from public.tasks where id in (${made.tasks.map((x) => `'${x}'`).join(',')})`);
      }
      if (made.alerts.length) await sql(`delete from public.alerts where id in (${made.alerts.map((x) => `'${x}'`).join(',')})`);
      if (made.items.length) await sql(`delete from public.incoming_items where id in (${made.items.map((x) => `'${x}'`).join(',')})`);
    }
  });  // The owner, 10 Nov (option 2): the tools list as WhatsApp's drop-down — one row per task with who · when, a row
  // opens that task's full card. Read as the person: rows say who asked, and the tap shows that task with its buttons
  await check('whatsapp', 'The tools list is a drop-down: each row says who asked, and a tap shows that task', async () => {
    const tag = Date.now().toString(36);
    const [it] = await sql(`insert into public.incoming_items (owner_id, source, external_id, body, summary, status, suggestions, received_at)
      values ('${QA_BOSS}', 'gmail', 'qa-list-${tag}', 'QA', 'QA', 'new',
      '[{"title":"QA list row ${tag}","short_title":"QA list row ${tag}","owner_id":null,"due_at":null,"priority":"medium","state":"new","task_id":null,"duplicate_of":null,"confidence":0.9,"quote":"send the signed contract","description":null,"definition_of_done":null,"proof_required":"none","budget":null,"estimate_hours":null,"requested_by":"Khalid QA","amends_earlier":false,"owner_name":null,"outside":false,"asked_by_user":false,"asked_of_user":true}]'::jsonb, now()) returning id`);
    try {
      const msgs = await wa('وش يحتاجني');
      const list = msgs.find((m) => m.interactive?.type === 'list');
      expect(list, `no drop-down list: ${texts(msgs).slice(0, 120)}`);
      const row = list.interactive.action.sections.flatMap((s) => s.rows).find((r) => r.id === `tc:${it.id}:0`);
      expect(row, 'the task has no row in the list');
      expect(/QA list row/.test(row.title) && /Khalid QA/.test(row.description ?? ''), `the row doesn't say what and who: ${JSON.stringify(row)}`);
      const tapped = await fn('whatsapp', { simulate: { from: QA_PHONE, tap: row.id } }, null, { 'x-cron-secret': secret });
      const card = JSON.stringify(tapped.sent ?? []);
      expect(card.includes(`QA list row ${tag}`) && card.includes(`ok:${it.id}:0`) && card.includes('send the signed contract'), `the tap didn't show the card: ${card.slice(0, 160)}`);
      // a row of a task handled meanwhile: says so (R117)
      await sql(`update public.incoming_items set status = 'done' where id = '${it.id}'`);
      const gone = await fn('whatsapp', { simulate: { from: QA_PHONE, tap: row.id } }, null, { 'x-cron-secret': secret });
      expect(/انحسمت قبل|already handled/.test(texts(gone.sent ?? [])), `a handled row: ${texts(gone.sent ?? []).slice(0, 120)}`);
      return 'rows with who and when; a tap opens the card; a handled one says so';
    } finally {
      await sql(`delete from public.incoming_items where id = '${it.id}'`);
    }
  });
  // The owner, 11 Nov: "how can I agree or approve any task without any details of it? … I need to have multiple actions
  // on it". Read as the person: a short name in the row, the full card with three buttons, and every choice does what it
  // says and replies with «↩️ تراجع»
  await check('whatsapp', 'A found task shows all its details, three buttons, and every choice works (and undoes)', async () => {
    const tag = Date.now().toString(36);
    const sug = (title, extra = {}) => ({ title, owner_id: null, due_at: null, priority: 'urgent', state: 'new', task_id: null, duplicate_of: null, confidence: 0.9, quote: 'please look at it', description: `Details for ${title}: new users get no tasks`, definition_of_done: 'every new user gets their tasks within a minute', proof_required: 'image', budget: null, estimate_hours: null, requested_by: 'Khalid QA', amends_earlier: false, owner_name: null, outside: false, asked_by_user: false, asked_of_user: true, ...extra });
    const sugs = [sug(`QA details ${tag} investigate AI assignment failing for new users`), sug(`QA give ${tag}`, { short_title: 'QA give' }), sug(`QA done ${tag}`, { short_title: 'QA done' })];
    const [it] = await sql(`insert into public.incoming_items (owner_id, source, external_id, sender, subject, body, summary, status, suggestions, received_at)
      values ('${QA_BOSS}', 'gmail', 'qa-details-${tag}', 'Khalid QA', 'Re: AI assignment', 'Hi Ahmed, the full message about AI assignment ${tag}.', 'QA', 'new', '${JSON.stringify(sugs).replace(/'/g, "''")}'::jsonb, now()) returning id`);
    const tap = async (id) => (await fn('whatsapp', { simulate: { from: QA_PHONE, tap: id } }, null, { 'x-cron-secret': secret })).sent ?? [];
    const state = async (i) => (await sql(`select suggestions->${i}->>'state' st, suggestions->${i}->>'task_id' task, suggestions->${i}->>'due_at' due from public.incoming_items where id = '${it.id}'`))[0];
    try {
      // the row: a name that reads whole (never cut mid-word), ≤24
      const msgs = await wa('وش يحتاجني');
      const rows = msgs.find((m) => m.interactive?.type === 'list')?.interactive.action.sections.flatMap((s) => s.rows) ?? [];
      const row = rows.find((r) => r.id === `tc:${it.id}:0`);
      expect(row && row.title.length <= 24, `no row, or too long: ${JSON.stringify(row)}`);
      // Muntej's own short name, or the title cut where a word ends
      const shown = row.title.replace(/^\d+\.\s/, '');
      const base = shown.replace(/…$/, '').trim();
      expect(!shown.endsWith('…') || (sugs[0].title.startsWith(base) && sugs[0].title[base.length] === ' '), `the row is cut mid-word: «${row.title}»`);
      // the card: what, who, what's needed, when it's done, flags, for whom; three distinct buttons
      const card = (await tap(row.id)).find((m) => m.interactive?.type === 'button');
      const body = card?.interactive.body.text ?? '';
      const ids = (card?.interactive.action.buttons ?? []).map((b) => b.reply.id);
      expect(/Details for/.test(body) && /every new user/.test(body) && /عاجلة|urgent/.test(body) && /صورة|photo/.test(body) && /Khalid/.test(body), `the card lacks details: ${body.slice(0, 200)}`);
      expect(ids.length === 3 && new Set(ids).size === 3 && ids[0] === `ok:${it.id}:0` && ids[1] === `tg:${it.id}:0` && ids[2] === `tx:${it.id}:0`, `buttons: ${ids.join(' | ')}`);
      // «⋯ خيارات»: exactly these four
      const opts = (await tap(`tx:${it.id}:0`)).find((m) => m.interactive?.type === 'list')?.interactive.action.sections.flatMap((s) => s.rows).map((r) => r.id.split(':')[0]) ?? [];
      expect(opts.join(',') === 'no,td,tt,tf', `options: ${opts.join(',')}`);
      // the full message, with the same three buttons
      const full = (await tap(`tf:${it.id}:0`)).find((m) => m.interactive?.type === 'button');
      expect(full && full.interactive.body.text.includes(`full message about AI assignment ${tag}`) && full.interactive.action.buttons.length === 3, 'the full message is missing');
      // change the date: a quick one
      const dates = (await tap(`tt:${it.id}:0`)).find((m) => m.interactive?.type === 'list')?.interactive.action.sections.flatMap((s) => s.rows) ?? [];
      const pick = dates.find((r) => r.id.startsWith('tu:'));
      expect(pick, 'no quick dates');
      await tap(pick.id);
      expect((await state(0)).due, 'the date wasn’t saved');
      // ignore, then undo: back in the list
      const ignored = await tap(`no:${it.id}:0`);
      expect((await state(0)).st === 'ignored' && JSON.stringify(ignored).includes(`tz:${it.id}:0`), 'ignore has no «تراجع»');
      await tap(`tz:${it.id}:0`);
      expect((await state(0)).st === 'new', 'undo didn’t bring it back');
      // «👤 لغيري» → Faisal: his task, and the reply says so
      const team = (await tap(`tg:${it.id}:1`)).find((m) => m.interactive?.type === 'list')?.interactive.action.sections.flatMap((s) => s.rows) ?? [];
      const faisal = team.find((r) => r.id === `tw:${it.id}:1:${QA_FAISAL}`);
      expect(faisal, `Faisal isn't in the list: ${team.map((r) => r.title).join(', ')}`);
      const gave = texts(await tap(faisal.id));
      const g = await state(1);
      const [owner] = g.task ? await sql(`select owner_id from public.tasks where id = '${g.task}'`) : [{}];
      expect(g.st === 'accepted' && owner.owner_id === QA_FAISAL && /فيصل|Faisal/.test(gave), `not given to Faisal: ${g.st} ${owner.owner_id} «${gave.slice(0, 80)}»`);
      // undo right after: the task is cancelled the normal way and Faisal is told, the suggestion is back
      await tap(`tz:${it.id}:1`);
      const [gt] = await sql(`select status from public.tasks where id = '${g.task}'`);
      const [told] = await sql(`select title_ar from public.alerts where profile_id = '${QA_FAISAL}' and task_id = '${g.task}' and title_ar like '%ألغى%'`);
      expect(gt.status === 'cancelled' && told && (await state(1)).st === 'new', `undo after approve: ${gt.status}, told ${!!told}`);
      // given again, then Faisal finishes it: an old «↩️ تراجع» never undoes his work (R133)
      await tap(faisal.id);
      const g2 = await state(1);
      await sql(`update public.tasks set status = 'done' where id = '${g2.task}'`);
      const refused = texts(await tap(`tz:${it.id}:1`));
      const [still] = await sql(`select status from public.tasks where id = '${g2.task}'`);
      expect(still.status === 'done' && /مشت من بعدها|moved on/.test(refused), `an old undo touched finished work: ${still.status} «${refused.slice(0, 80)}»`);
      // «✔️ خلصتها قبل»: a task that is already done, and its own undo takes it back — with the login last opened in
      // ANOTHER company (one login, two seats: reviewer, 11 Nov, R98/R99), and a card that asks for proof
      const [{ user_id: bossUser }] = await sql(`select user_id from public.profiles where id = '${QA_BOSS}'`);
      const [session] = await sql(`select account_id, updated_at from public.account_sessions where user_id = '${bossUser}'`);
      const DEMO = 'c0000000-0000-4000-b000-000000000001';
      const [twin] = await sql(`insert into public.profiles (account_id, full_name, role, status, user_id) values ('${DEMO}', 'QA boss other seat ${tag}', 'manager', 'active', '${bossUser}') returning id`);
      await sql(`insert into public.account_sessions (user_id, account_id, updated_at) values ('${bossUser}', '${DEMO}', now()) on conflict (user_id) do update set account_id = excluded.account_id, updated_at = now()`);
      try {
      await tap(`td:${it.id}:2`);
      const d = await state(2);
      const [dt] = d.task ? await sql(`select status from public.tasks where id = '${d.task}'`) : [{}];
      expect(d.st === 'accepted' && dt.status === 'done', `not done before: ${d.st} ${dt.status}`);
      await tap(`tz:${it.id}:2`);
      const [du] = await sql(`select status from public.tasks where id = '${d.task}'`);
      expect(du.status === 'cancelled' && (await state(2)).st === 'new', `undo after already done: ${du.status}`);
      } finally {
        if (session) await sql(`update public.account_sessions set account_id = '${session.account_id}', updated_at = '${session.updated_at}' where user_id = '${bossUser}'`);
        else await sql(`delete from public.account_sessions where user_id = '${bossUser}'`);
        await sql(`delete from public.profiles where id = '${twin.id}'`);
      }
      return 'short row, full card, 3 buttons, 4 options; date, ignore/approve/done-before undo, old undo refused, give to Faisal';
    } finally {
      await sql(`delete from public.tasks where id in (select (s->>'task_id')::uuid from public.incoming_items i, jsonb_array_elements(i.suggestions) s where i.id = '${it.id}' and s->>'task_id' is not null)`);
      await sql(`delete from public.incoming_items where id = '${it.id}'`);
      await sql(`delete from public.wa_pending where key = 'tools:${QA_BOSS}'`);
    }
  });
  // «شوف الباقي» keeps the first list's numbers, and a typed number is that same task (reviewer, 10 Nov)
  await check('whatsapp', 'The tools list’s next page keeps its numbers, and «10» approves the task shown as 10', async () => {
    const tag = Date.now().toString(36);
    const sugs = Array.from({ length: 11 }, (_, k) => ({ title: `QA page ${tag} n${k + 1}`, short_title: `QA p${k + 1}`, owner_id: null, due_at: null, priority: 'medium', state: 'new', task_id: null, duplicate_of: null, confidence: 0.9, quote: '', description: null, definition_of_done: null, proof_required: 'none', budget: null, estimate_hours: null, requested_by: 'Saad QA', amends_earlier: false, owner_name: null, outside: false, asked_by_user: false, asked_of_user: true }));
    // «10» approves 10 and ignores the rest of the list: set the QA manager's other waiting items aside so only this
    // one is in the list, and put them back after (reviewer, 10 Nov)
    const aside = (await sql(`update public.incoming_items set status = 'nothing' where owner_id = '${QA_BOSS}' and status = 'new' returning id`)).map((r) => r.id);
    const [it] = await sql(`insert into public.incoming_items (owner_id, source, external_id, body, summary, status, suggestions, received_at)
      values ('${QA_BOSS}', 'gmail', 'qa-page-${tag}', 'QA', 'QA', 'new', '${JSON.stringify(sugs)}'::jsonb, now() + interval '1 minute') returning id`);
    try {
      const first = await wa('وش يحتاجني');
      const rows = first.find((m) => m.interactive?.type === 'list')?.interactive.action.sections.flatMap((s) => s.rows) ?? [];
      const moreRow = rows.find((r) => r.id.startsWith('tl:'));
      expect(rows.length === 10 && moreRow, `expected 9 rows + «شوف الباقي»: ${rows.map((r) => r.title).join(' | ').slice(0, 160)}`);
      const page = await fn('whatsapp', { simulate: { from: QA_PHONE, tap: moreRow.id } }, null, { 'x-cron-secret': secret });
      const rows2 = (page.sent ?? []).find((m) => m.interactive?.type === 'list')?.interactive.action.sections.flatMap((s) => s.rows) ?? [];
      const ten = rows2.find((r) => r.title.startsWith('10.'));
      expect(ten && ten.id === `tc:${it.id}:9`, `the next page's «10.» isn't the 10th task: ${rows2.map((r) => `${r.title}=${r.id}`).join(' | ').slice(0, 160)}`);
      await wa('10');
      const [row] = await sql(`select suggestions->9->>'state' s9, suggestions->8->>'state' s8 from public.incoming_items where id = '${it.id}'`);
      // «10» = approve the 10th, ignore the rest of the list (as the list says)
      expect(row.s9 === 'accepted' && row.s8 === 'ignored', `«10» approved the wrong one (9th: ${row.s8}, 10th: ${row.s9})`);
      return 'page 2 starts at 10, and «10» is that task';
    } finally {
      await sql(`delete from public.tasks where id in (select (s->>'task_id')::uuid from public.incoming_items i, jsonb_array_elements(i.suggestions) s where i.id = '${it.id}' and s->>'task_id' is not null)`);
      await sql(`delete from public.incoming_items where id = '${it.id}'`);
      await sql(`delete from public.wa_pending where key = 'tools:${QA_BOSS}'`);
      if (aside.length) await sql(`update public.incoming_items set status = 'new' where id in (${aside.map((x) => `'${x}'`).join(',')})`);
    }
  });
  // Nouran, 10 Nov: «جاوب» on a due date sent nothing — two quick dates fell on the same Sunday, and WhatsApp refuses
  // repeated button ids. Read as the person: the date buttons arrive, all different
  await check('whatsapp', '«جاوب» on a due date always sends the date buttons, never two of the same', async () => {
    const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA due buttons', '${QA_FAISAL}', '${QA_BOSS}', 'in_progress') returning id`);
    try {
      const r = await fn('whatsapp', { simulate: { from: QA_PHONE, tap: `da:${t.id}:due` } }, null, { 'x-cron-secret': secret });
      const ids = (r.sent ?? []).flatMap((m) => m.interactive?.action?.buttons ?? []).map((b) => b.reply.id);
      expect(ids.length >= 2, `no date buttons: ${texts(r.sent ?? []).slice(0, 120)}`);
      expect(new Set(ids).size === ids.length, `repeated buttons: ${ids.join(' ')}`);
      return `${ids.length} different dates`;
    } finally {
      await sql(`delete from public.wa_pending where key = 'da:${QA_BOSS}'`);
      await sql(`delete from public.tasks where id = '${t.id}'`);
    }
  });
  // The owner, 10 Nov: "Is it only 1 needs me or 23?" — the midday report said «1 تحتاجك» (30 tools tasks counted as one
  // line) and «وش يحتاجني» a tap later said «فيه 23 شي يحتاجك». The same number, from the same list.
  await check('whatsapp', 'The report’s “need you” number is what «وش يحتاجني» lists', async () => {
    const r = await fn('daily-summary', { test: true, kind: 'midday', dry: true }, JWT);
    if (r.skipped) return `no report today (${r.skipped})`;
    const inReport = /(\d+) تحتاجك|(\d+) need you/.exec(r.preview ?? '');
    expect(inReport, `no “need you” number in the report: ${(r.preview ?? '').slice(0, 120)}`);
    const msgs = await wa('وش يحتاجني');
    // only the first reply holds the count (the late-team lines after it have numbers of their own — reviewer, 10 Nov)
    const first = texts(msgs.slice(0, 1));
    // (one «يحتاجك», testers first: «عندك N تنتظرك»)
    const listed = /عندك (\d+) تنتظرك/.exec(first)?.[1] ?? /فيه (\d+)/.exec(first)?.[1] ?? (/شي واحد/.test(first) ? '1' : /شيئين/.test(first) ? '2' : /ما فيه شي|ما فيه قرار ينتظرك/.test(first) ? '0' : null);
    expect(listed !== null, `«وش يحتاجني» gave no count: ${first.slice(0, 120)}`);
    expect(Number(inReport[1] ?? inReport[2]) === Number(listed), `report says ${inReport[1] ?? inReport[2]}, «وش يحتاجني» lists ${listed}`);
    return `${listed} in both`;
  });
  // «ما فيه ميزانية» after «✍️ جاوب» on a budget question closes it without a budget (reviewer, 10 Nov: the Arabic
  // never matched and was saved as the budget)
  for (const [answer, isNone] of [['ما فيه ميزانية', true], ['ما فيها شي', true], ['لا تتجاوز 5000', false], ['No more than 5000', false]])
  await check('whatsapp', isNone ? `«${answer}» closes a budget question without saving a budget` : `«${answer}» is saved as the budget, not read as none`, async () => {
    const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA no budget', '${QA_FAISAL}', '${QA_BOSS}', 'in_progress') returning id`);
    try {
      // the question as ask_task_detail writes it (Faisal's login may be on another seat after the delete/restore cases)
      await sql(`insert into public.alerts (profile_id, kind, task_id, subject_id, title, body, title_ar, body_ar, dedupe_key)
                 values ('${QA_BOSS}', 'detail_asked', '${t.id}', '${QA_FAISAL}', 'Faisal asks about the budget', '"QA no budget": add the budget', 'يسأل فيصل عن الميزانية', '«QA no budget»: أضف الميزانية', 'ask:${t.id}:budget:${new Date().toISOString().slice(0, 10)}')
                 on conflict (dedupe_key) do nothing`);
      await sql(`insert into public.wa_pending (key, profile_id, body, created_at) values ('da:${QA_BOSS}', '${QA_BOSS}', '{"task_id":"${t.id}","what":"budget"}', now())
                 on conflict (key) do update set body = excluded.body, created_at = now()`);
      const msgs = await wa(answer);
      const [row] = await sql(`select budget from public.tasks where id = '${t.id}'`);
      if (isNone) expect(!row.budget, `saved «${row.budget}» as the budget`);
      else expect(/5000/.test(row.budget ?? ''), `the budget wasn’t saved: «${row.budget ?? 'nothing'}» · ${texts(msgs).slice(0, 80)}`);
      const [open] = await sql(`select id from public.alerts where profile_id = '${QA_BOSS}' and kind = 'detail_asked' and task_id = '${t.id}' and read_at is null`);
      expect(!open, `the question still waits: ${texts(msgs).slice(0, 120)}`);
      return texts(msgs).slice(0, 70);
    } finally {
      await sql(`delete from public.wa_pending where key = 'da:${QA_BOSS}'`);
      await sql(`delete from public.alerts where task_id = '${t.id}'`);
      await sql(`delete from public.activity_log where task_id = '${t.id}'`);
      await sql(`delete from public.tasks where id = '${t.id}'`);
    }
  });
  await sql(`update public.profiles set phone = null where id = '${QA_BOSS}'`);
}

// ─── 4. screens ───────────────────────────────────────────────────────────────
const ROUTES = [
  '/', '/38-tasks', '/04-decisions', '/17-summaries', '/18-alerts', '/39-team', '/40-objectives', '/42-incoming', '/44-more',
  '/50-whats-new', '/53-profile', '/54-saree3', '/56-overview', '/58-home-sections', '/59-ideas', '/60-wishlist', '/61-build-team',
  '/16-dashboard', '/32-receipt', '/settings', '/security', '/48-invite', '/12-sources', '/03-autopilot', '/09-reverse-followup',
];
const NOISE = /favicon|DevTools|Download the React DevTools|expo-notifications|push token|Intercom|posthog|ResizeObserver|Unable to resolve host|net::ERR|Failed to load resource/i;

// a leftover web server from an earlier run holds the port and answers nothing; close it first
function freePort(port) {
  const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: true });
  const pids = new Set(
    (r.stdout ?? '')
      .split('\n')
      .filter((l) => l.includes(`:${port} `) && l.includes('LISTENING'))
      .map((l) => l.trim().split(' ').filter(Boolean).pop()),
  );
  for (const pid of pids) if (pid && pid !== '0') spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { shell: true });
  return pids.size;
}

async function screens() {
  let browser;
  freePort(8099);
  const server = spawn('npx', ['expo', 'start', '--web', '--port', '8099', '--offline'], {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, NODE_OPTIONS: '--use-system-ca', BROWSER: 'none', CI: '1' },
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  let exited = null;
  server.on('exit', (c) => (exited = c));
  try {
    // wait for the web build to answer
    const t0 = Date.now();
    for (;;) {
      try {
        const r = await fetch('http://localhost:8099');
        if (r.ok) break;
      } catch {
        // not up yet
      }
      if (Date.now() - t0 > 240_000) throw new Error(`web app didn't start:\n${log.slice(-800)}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ar' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && !NOISE.test(m.text()) && errors.push(m.text()));

    await check('screens', 'Sign in with the test link', async () => {
      const token = await qaLinkToken();
      await page.goto(`http://localhost:8099/join?t=${token}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      await page.waitForFunction(() => !location.pathname.startsWith('/join'), null, { timeout: 180_000 }).catch(async (e) => {
        const body = await page.evaluate(() => document.body.innerText).catch(() => '');
        throw new Error(`${e.message} · web app ${exited === null ? 'still running' : 'exited ' + exited} · page: ${body.slice(0, 200)} · log: ${log.slice(-600)}`);
      });
      await page.waitForTimeout(4000);
      return page.url();
    });

    // signed out, every screen is just the sign-in page and would pass for the wrong reason
    if (!results.at(-1).pass) throw new Error('not signed in, so the screens were not checked');

    // the owner, 5 Nov: "Text in Arabic should be rtl and English ltr" (Arabic sat on the left of every screen)
    await check('screens', 'Arabic reads from the right, an English sentence from the left', async () => {
      await page.goto('http://localhost:8099/42-incoming', { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForTimeout(3500);
      const lines = await page.evaluate(() => {
        const out = { ar: null };
        for (const el of document.querySelectorAll('div[dir], div')) {
          const text = el.childElementCount ? '' : (el.textContent ?? '').trim();
          if (text.length < 12 || !/[\u0600-\u06FF]/.test(text)) continue;
          const s = getComputedStyle(el);
          out.ar = { text: text.slice(0, 30), direction: s.direction, align: s.textAlign };
          break;
        }
        return out;
      });
      expect(lines.ar, 'no Arabic line found on the screen');
      expect(lines.ar.direction === 'rtl', `«${lines.ar.text}» is ${lines.ar.direction}`);
      expect(!['left'].includes(lines.ar.align), `«${lines.ar.text}» is aligned ${lines.ar.align}`);
      return lines.ar.text;
    });

    // the owner's screenshot, 5 Nov: "Empty button and I don't know what to do". White label, and the gradient behind
    // it didn't paint on the phone; a main button must have a solid colour of its own under the gradient.
    await check('screens', 'A task’s main button keeps its label readable', async () => {
      const [other] = await sql(`select id from public.profiles where account_id = '${QA_ACCOUNT}' and id <> '${QA_BOSS}' and status = 'active' limit 1`);
      const [task] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA main button', '${QA_BOSS}', '${other.id}', 'assigned') returning id`);
      try {
        await page.goto(`http://localhost:8099/14-task-detail?id=${task.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        // (the QA boss is an admin: his Done closes it, «خلصتها، قفّلها»; anyone else's sends it, «خلصتها، أرسلها»)
        const button = page.getByRole('button', { name: /خلصتها، (أرسلها|قفّلها)|Done, (send it|close it)/ });
        await button.waitFor({ timeout: 30_000 });
        const under = await button.evaluate((el) => getComputedStyle(el.firstElementChild).backgroundColor);
        expect(!['transparent', 'rgba(0, 0, 0, 0)'].includes(under), `nothing solid under the white label (${under})`);
        // owner, 9 Nov (N2): the doer also asks for more time or comments, in their own words, right from the page
        const bar = await page.evaluate(() => document.body.innerText);
        expect(/أبي وقت أكثر/.test(bar) && /أكتب تعليق/.test(bar) && /قل لمنتج يعدّلها/.test(bar), 'the doer has no «أبي وقت أكثر» / «أكتب تعليق» / «قل لمنتج يعدّلها»');
        await page.getByRole('button', { name: 'أبي وقت أكثر' }).click();
        await page.getByText('الموعد الجديد:').waitFor({ timeout: 5_000 });
        return under;
      } finally {
        await sql(`delete from public.tasks where id = '${task.id}'`);
      }
    });

    // The owner, 9 Nov: "if task already done so let the user finish it from this page, not assign then transfer it to
    // the tasks page then approve it"
    await check('flows', 'Decisions: «خلصت أصلاً» closes the task from the card', async () => {
      // Arabic text throughout: an English title gets translated on screen and can't be found again
      const [task] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('مهمة فحص منتهية', null, '${QA_BOSS}', 'draft') returning id`);
      await sql(`insert into public.decisions (task_id, manager_id, type, title, title_ar, recommendation, recommendation_ar) values ('${task.id}', '${QA_BOSS}', 'reassignment', '«مهمة فحص منتهية» للحين بدون مسؤول', '«مهمة فحص منتهية» للحين بدون مسؤول', 'عطها أحد', 'عطها أحد')`);
      try {
        await page.goto('http://localhost:8099/04-decisions', { waitUntil: 'domcontentloaded', timeout: 120_000 });
        // (the title is shown in the reader's language: «QA already done» can read «تم عمل الـ QA»)
        await page.getByText(/مهمة فحص منتهية/).first().waitFor({ timeout: 30_000 }).catch(async (e) => {
          await page.screenshot({ path: join(OUT, 'flow_already_done.png'), fullPage: true });
          throw new Error(`${e.message.split('\n')[0]} · page: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)}`);
        });
        // the header (owner, 9 Nov, option 1): «القرارات · N», one line, no "follow-ups saved" pills (waits for its
        // number: «يحتاجك» shows it only once its list is in)
        await page.getByText(/(القرارات|يحتاجك) · [\d٠-٩]+/).first().waitFor({ timeout: 20_000 }).catch(() => {});
        const head = await page.evaluate(() => document.body.innerText);
        // («ملاحقات» is still on each card's chip; the old header's own pills were «دقيقة ·» and «بس N قرارات»)
        // («يحتاجك · N» once one_needs_you is on for this seat, owner, 11 Nov)
        expect(/(القرارات|يحتاجك) · /.test(head) && !/دقيقة · /.test(head) && !/بس \d+ قرار/.test(head), 'the old Decisions header is still there');
        await page.getByRole('button', { name: '✓ خلصت أصلاً' }).first().click();
        await page.waitForTimeout(4000);
        const [after] = await sql(`select status, owner_id from public.tasks where id = '${task.id}'`);
        expect(after.status === 'done', `the task is ${after.status}, not done`);
        return 'closed from the card';
      } finally {
        await sql(`delete from public.decisions where task_id = '${task.id}'; delete from public.tasks where id = '${task.id}'`);
      }
    });

    // The owner, 9 Nov: "why many tasks with no assignee, from where you get it" — a task from a tool says who sent it
    await check('screens', 'A task from email says who sent it, not «لسه ما أحد»', async () => {
      const [task] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status, source, external_from) values ('QA from sender', '${QA_BOSS}', '${QA_BOSS}', 'assigned', 'email', 'QA Sender') returning id`);
      try {
        await page.goto(`http://localhost:8099/14-task-detail?id=${task.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.getByText('QA Sender · إيميل').first().waitFor({ timeout: 30_000 });
        return 'QA Sender · إيميل';
      } finally {
        await sql(`delete from public.tasks where id = '${task.id}'`);
      }
    });

    // Nouran, 9 Nov (N20): "add a tab under المهام called يحتاجك… her questions, the due date ask and the refusal didn't
    // show on the manager's side"
    await check('screens', 'Tasks opens on «يحتاجك» with what waits on you', async () => {
      const [doer] = await sql(`select id from public.profiles where account_id = '${QA_ACCOUNT}' and id <> '${QA_BOSS}' and status = 'active' order by full_name limit 1`);
      const [task] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA needs you review', '${doer.id}', '${QA_BOSS}', 'submitted') returning id`);
      try {
        await page.goto('http://localhost:8099/38-tasks', { waitUntil: 'domcontentloaded', timeout: 120_000 });
        // a manager with one «يحتاجك» (owner, 11 Nov): Tasks has one line «N تحتاجك» that opens the «يحتاجك» tab
        const line = page.getByText(/[\d٠-٩]+ (أشياء|شي) (تحتاجك|يحتاجك)|شي واحد يحتاجك|شيئين يحتاجونك/).first();
        await page.waitForTimeout(4000);
        if (await line.isVisible().catch(() => false)) await line.click();
        await page.getByText('QA needs you review').first().waitFor({ timeout: 30_000 }).catch(async (e) => {
          throw new Error(`${e.message.split('\n')[0]} · page: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)}`);
        });
        const text = await page.evaluate(() => document.body.innerText);
        expect(/يحتاجك/.test(text) && /تنتظر اعتمادك/.test(text), 'no «يحتاجك» with the review waiting');
        return 'review waiting, on its row';
      } finally {
        await sql(`delete from public.tasks where id = '${task.id}'`);
      }
    });

    // Nouran, 9 Nov (N16): "tab تنتظر منهم is showing a task that is pending, but unclickable"
    await check('screens', '«تنتظر منهم» cards open their task', async () => {
      const src = readFileSync(new URL('../../app/09-reverse-followup.tsx', import.meta.url), 'utf8');
      const card = src.slice(src.indexOf('function WaitCard('));
      expect(/<Pressable[\s\S]{0,200}14-task-detail[\s\S]{0,80}item\.taskId/.test(card), 'a waiting card still can’t be tapped');
      return 'tap opens the task';
    });

    // Nouran, 9 Nov (N13): "when I am in the chat and click on المهام it redirects to an empty screen". A list Saree3
    // opened on a few tasks (?ids=) stuck to the tab.
    await check('screens', 'The Tasks tab opens fresh, not on an old filtered list', async () => {
      await page.goto('http://localhost:8099/38-tasks?ids=00000000-0000-4000-8000-000000000000', { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.getByRole('tab', { name: 'المهام' }).first().waitFor({ timeout: 30_000 });
      await page.getByRole('tab', { name: 'المهام' }).first().click();
      await page.waitForTimeout(1500);
      expect(!/ids=/.test(page.url()), `still filtered after tapping the tab (${page.url()})`);
      return 'fresh';
    });

    // Nouran, 9 Nov (N4): "I tried the busy flow, it wrote auto reply from the AI, I want to be able to write in my own
    // words". Her words go to whoever gave the task.
    await check('flows', 'Busy: your own reason reaches whoever gave the task', async () => {
      const [giver] = await sql(`select id from public.profiles where account_id = '${QA_ACCOUNT}' and id <> '${QA_BOSS}' and status = 'active' order by full_name limit 1`);
      const [task] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA busy words', '${QA_BOSS}', '${giver.id}', 'assigned') returning id`);
      const words = 'عندي تسليم كبير هالأسبوع، أبدأ فيها الأحد';
      try {
        await page.goto(`http://localhost:8099/08-pushback?task=${task.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.getByRole('button', { name: /مشغول، خلني أبلّغه/ }).click({ timeout: 30_000 });
        // N5 (owner, 9 Nov): the 3 fixed design tiles ("30 s", "awkward talks", "protected") don't make sense: gone
        // («إحراج» is also in the subtitle «قل "لا" بدون إحراج»: look for the tiles' own words)
        expect(!/حميت |30 ث\b|\n\s*وتعتذر\s*\n/.test(await page.evaluate(() => document.body.innerText)), 'the 3 design tiles are still on the Busy screen');
        await page.getByLabel('السبب بكلامك…').fill(words);
        await page.getByRole('button', { name: /^أرسل$/ }).click();
        await page.waitForTimeout(2500);
        const [d] = await sql(`select manager_id, recommendation_reason from public.decisions where task_id = '${task.id}'`);
        expect(d, 'no request was saved');
        expect(d.manager_id === giver.id, 'it went to someone other than whoever gave the task');
        expect(d.recommendation_reason === words, `sent «${d.recommendation_reason}», not her words`);
        return 'her words, to the giver';
      } finally {
        await sql(`delete from public.decisions where task_id = '${task.id}'; delete from public.tasks where id = '${task.id}'`);
      }
    });

    // the owner, 5 Nov: "Everything takes time to be applied". The card sat on a spinner through every save; it must
    // answer the tap at once and only come back if the save fails (the save is held, then refused: nothing changes).
    await check('screens', 'A decision answers the tap at once, and comes back if the save fails', async () => {
      await page.goto('http://localhost:8099/04-decisions', { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const approve = page.getByRole('button', { name: 'وافق', exact: true });
      await approve.first().waitFor({ timeout: 30_000 });
      const before = await approve.count();
      const held = async (r) => {
        if (r.request().method() !== 'PATCH') return r.continue();
        await new Promise((done) => setTimeout(done, 3000));
        return r.abort();
      };
      await page.route('**/rest/v1/decisions*', held);
      try {
        await approve.first().click();
        await page.waitForTimeout(600);
        // the spinner also hides the buttons, so only the finished line proves it answered
        expect(await page.getByText('تمام ·').first().isVisible(), '0.6s after the tap the card is still waiting');
        await page.getByText('ما مشت').waitFor({ timeout: 15_000 });
        await page.waitForTimeout(300);
        expect((await approve.count()) === before, 'the save failed but the card did not come back');
        return 'instant, and back on failure';
      } finally {
        await page.unroute('**/rest/v1/decisions*', held);
      }
    });

    // the owner, 8 Nov: "In Google meet sync let's group every meeting tasks under one section group with mention of the
    // meeting title and attendees then tasks to everyone" (design/examples/meeting-group.png, approved)
    await check('screens', 'A meeting’s tasks show under its title, attendees and each person', async () => {
      const body = [
        'Google Meet meeting: QA weekly deliverables (2026-11-08T11:07:09Z → 2026-11-08T11:29:36Z)',
        'Organiser: Ahmed QA',
        'Invited: Meeting Room - QA (5), Ahmed QA, mbadawy.qa@gmail.com',
        'Lines are "speaker: words". Whoever asks someone to do something is who assigned it.',
        '',
        'Ahmed QA: The content plan and the newsletter this week.',
        'Mohamed Badawy: OK.',
      ].join('\n');
      const sug = (title, owner) =>
        `jsonb_build_object('title', '${title}', 'owner_id', ${owner ? `'${owner}'` : 'null'}, 'owner_name', ${owner ? 'null' : `'Mohamed Badawy'`}, 'outside', ${!owner}, 'state', 'new', 'confidence', 0.8, 'priority', 'medium', 'quote', 'x', 'task_id', null, 'duplicate_of', null, 'due_at', null, 'definition_of_done', null, 'estimate_hours', null)`;
      const [item] = await sql(`insert into public.incoming_items (owner_id, source, external_id, sender, subject, received_at, body, status, suggestions)
        values ('${QA_BOSS}', 'meet', 'qa-meet-group', 'Ahmed QA', 'QA weekly deliverables', now(), '${body.replace(/'/g, "''")}', 'new',
          jsonb_build_array(${sug('QA content plan')}, ${sug('QA newsletter')}, ${sug('QA approve budget', QA_BOSS)})) returning id`);
      try {
        // the messages themselves are on each tool's own page
        await page.goto('http://localhost:8099/55-tool?tool=meet', { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.getByText('QA weekly deliverables').first().waitFor({ timeout: 30_000 }).catch(async () => {
          throw new Error(`not on the Meet page: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)}`);
        });
        const text = await page.evaluate(() => document.body.innerText);
        expect(/Mohamed Badawy/.test(text), 'the attendee isn’t shown');
        expect(/أضف كل مهام الاجتماع/.test(text), 'no “add all the meeting’s tasks”');
        expect(/مو في فريقك/.test(text), 'the person outside the team isn’t marked');
        // the owner, 8 Nov: "Add assignee near each task and also from whom"
        const tos = await page.getByRole('button', { name: /^إلى/ }).count();
        expect(tos >= 3, `${tos} of 3 meeting tasks show who they're for`);
        return 'grouped by person';
      } finally {
        await sql(`delete from public.incoming_items where id = '${item.id}'`);
      }
    });

    // the owner, 8 Nov: "make it clear from where task came and to whom assigned... and make it easy to change". He
    // picked option A: a "من … ← إلى …" row on the task page, "إلى" tappable, and the same line in the Tasks list
    await check('screens', 'A task shows who it’s from and who it’s for, and “to” can be changed', async () => {
      const [other] = await sql(`select id, full_name_ar, full_name from public.profiles where account_id = '${QA_ACCOUNT}' and id <> '${QA_BOSS}' and status = 'active' order by full_name limit 1`);
      const [task] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA from to', '${other.id}', '${QA_BOSS}', 'assigned') returning id`);
      try {
        await page.goto(`http://localhost:8099/14-task-detail?id=${task.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        const to = page.getByRole('button', { name: /^إلى/ });
        await to.waitFor({ timeout: 30_000 });
        // the sections need who you are and the team, which can arrive a moment after the boxes
        await page.getByText('الحالة الآن').first().waitFor({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const text = await page.evaluate(() => document.body.innerText);
        const name = (other.full_name_ar || other.full_name).split(' ')[0];
        expect(/من\s/.test(text) && text.includes(name), `no clear "from … to ${name}" on the page`);
        // the owner, 8 Nov: "one for current state and if any action required to be in different section"; and the
        // steps only on a tap ("make these steps by clicking on a button not auto")
        expect(/مطلوب منك/.test(text) && /أضف الموعد/.test(text), 'no «مطلوب منك» with «أضف الموعد» for the one who gave it (no due date)');
        // owner, 8 Nov: "Budget should be optional"
        expect(!/أضف الميزانية|حدد الميزانية/.test(text), 'the task asks for a budget');
        expect(/الحالة الآن/.test(text), 'no «الحالة الآن» section');
        await page.waitForTimeout(3000);
        const later = await page.evaluate(() => document.body.innerText);
        expect(!/لو عليّ، أقسّمها كذا/.test(later) && /خلني أقسّمها/.test(later), 'steps were suggested without a tap');
        // owner, 9 Nov: "خليني اقسمها, let's make it optional" (one white row with ✕; gone for this task after ✕)
        await page.getByRole('button', { name: 'ما أحتاجها' }).click();
        await page.waitForTimeout(500);
        expect(!/خلني أقسّمها/.test(await page.evaluate(() => document.body.innerText)), '✕ did not hide «خلني أقسّمها»');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await to.waitFor({ timeout: 30_000 });
        await page.waitForTimeout(2500);
        const after = await page.evaluate(() => document.body.innerText);
        expect(!/خلني أقسّمها/.test(after), '«خلني أقسّمها» came back after ✕');
        // owner, 9 Nov (N2): whoever gave it closes or cancels it from the page; the chat button says what it does
        expect(/قفّلها، خلصت/.test(after) && /ألغها/.test(after) && /قل لمنتج يعدّلها/.test(after), 'the giver has no «قفّلها» / «ألغها» / «قل لمنتج يعدّلها»');
        await to.click();
        await page.getByText('مين يسويها؟').waitFor({ timeout: 10_000 });
        // someone else's task: on the Team tab
        await page.goto('http://localhost:8099/38-tasks?filter=team', { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.getByText('QA from to').first().waitFor({ timeout: 30_000 }).catch(async () => {
          await page.screenshot({ path: join(OUT, 'flow_from_to_list.png') });
          throw new Error(`not in the list: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)}`);
        });
        const row = await page.evaluate(() => document.body.innerText);
        expect(new RegExp(`إلى ${name}`).test(row), 'the Tasks list doesn’t say who it’s for');
        return `to ${name}, changeable`;
      } finally {
        await sql(`delete from public.tasks where id = '${task.id}'`);
      }
    });
    // the owner, 8 Nov, on a task found in a chat: "Here also should be from and to option"
    await check('screens', 'A task found in a message shows from → to, and “to” can be changed', async () => {
      const [item] = await sql(`insert into public.incoming_items (owner_id, source, external_id, sender, subject, received_at, body, status, suggestions)
        values ('${QA_BOSS}', 'gmail', 'qa-found-from-to', 'Faisal QA', 'QA found from to', now(), 'From: Faisal QA <qa-faisal@qa.muntej.test>\n\nPlease send the price list', 'new',
          jsonb_build_array(jsonb_build_object('title', 'QA send the price list', 'owner_id', '${QA_BOSS}', 'requested_by', 'Faisal QA', 'state', 'new', 'confidence', 0.8, 'priority', 'medium', 'quote', 'x', 'task_id', null, 'duplicate_of', null, 'due_at', null, 'definition_of_done', null, 'estimate_hours', null))) returning id`);
      try {
        await page.goto('http://localhost:8099/55-tool?tool=gmail', { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.getByText('QA send the price list').first().waitFor({ timeout: 30_000 });
        const to = page.getByRole('button', { name: /^إلى/ }).first();
        await to.waitFor({ timeout: 10_000 });
        // "you" needs your profile, which can land a moment after the team's names
        await page.getByRole('button', { name: /^إلى أنت/ }).first().waitFor({ timeout: 15_000 }).catch(() => {});
        const text = await page.evaluate(() => document.body.innerText);
        if (!(/Faisal QA/.test(text) && /أنت/.test(text))) await page.screenshot({ path: join(OUT, 'found_from_to.png') });
        expect(/Faisal QA/.test(text) && /أنت/.test(text), 'no «من Faisal QA ← إلى أنت»');
        await to.click();
        await page.getByText('مين يسويها؟').first().waitFor({ timeout: 10_000 });
        return 'from Faisal → to you, changeable';
      } finally {
        await sql(`delete from public.incoming_items where id = '${item.id}'`);
      }
    });

    // The owner's screenshot, 8 Nov: "Let's approve or reject one by one and keep emails out of the company domain and
    // manager confirm or reject": each person from your mail has Add / No, outside people sit apart.
    await check('screens', 'People from your mail: Add or No on each, outside people apart', async () => {
      const person = (ref, name, email, outside) =>
        `jsonb_build_object('ref','${ref}','full_name','${name}','full_name_ar',null,'title',null,'email','${email}','phone',null,'department',null,'manager_ref',null,'manager_id',null,'existing_id',null,'role','employee','confidence',0.7,'unsure','[]'::jsonb,'skip',${outside},'outside',${outside},'is_new',true)`;
      const [d] = await sql(`insert into public.team_drafts (account_id, created_by, source, people, company_name)
        values ((select account_id from public.profiles where id = '${QA_BOSS}'), '${QA_BOSS}', 'mail',
          jsonb_build_array(${person('m1', 'QA Inside Person', 'inside@qa.muntej.test', false)}, ${person('m2', 'QA Client Person', 'buyer@client-co.test', true)}), null) returning id`);
      try {
        await page.goto(`http://localhost:8099/62-team-review?id=${d.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.getByText('QA Inside Person').first().waitFor({ timeout: 30_000 });
        const text = await page.evaluate(() => document.body.innerText);
        expect(/من برّا شركتك/.test(text), 'no «من برّا شركتك» section');
        const no = page.getByRole('button', { name: /^لا QA Client Person/ });
        expect((await page.getByRole('button', { name: /^أضفه QA/ }).count()) === 2, 'not every person has «أضفه»');
        await no.click();
        await page.getByText('تراجع').first().waitFor({ timeout: 10_000 });
        // owner, 8 Nov: "Once added, let's choose under whom": Add asks who they go under, then adds them there
        await page.getByRole('button', { name: /^أضفه QA Inside Person/ }).click();
        await page.getByText('أضف QA Inside Person تحت:').first().waitFor({ timeout: 10_000 });
        // Arabic text carries an invisible direction mark, so not an exact match; the sheet is the last thing drawn
        await page.getByText(/^\W*فيصل\W*$/).last().click();
        await page.getByText(/تحت: فيصل/).first().waitFor({ timeout: 10_000 });
        await page.screenshot({ path: join(OUT, 'mail_review.png') });
        return 'Add asks under whom, No folds with Undo, outside apart';
      } finally {
        await sql(`delete from public.team_drafts where id = '${d.id}'`);
      }
    });

    // The owner's screenshots, 8 Nov: "Asked to make task completed and design crashed". On Android the Undo button under
    // the card grew down into a screen-tall empty pill and the cards drew over other messages: a chat button made to share
    // a row (flex: 1) stood in a column. The web doesn't show it, so the source is read: every chat button under another
    // one must be `stacked`.
    await check('screens', 'Chat buttons stacked one under another don’t stretch (Android)', async () => {
      const bad = [];
      for (const f of ['TaskCard.tsx', 'ActionCards.tsx', 'OrgProposalCard.tsx', 'ObjectiveProposalCard.tsx']) {
        const lines = readFileSync(new URL(`../../src/features/chat/${f}`, import.meta.url), 'utf8').split('\n');
        lines.forEach((l, i) => {
          if (!/<CardButton\b/.test(l)) return;
          let k = i - 1;
          while (k >= 0 && !/<View\b/.test(lines[k])) k--;
          const inRow = k >= 0 && /flexDirection: 'row'/.test(lines[k]);
          const stacked = /<CardButton\s+stacked\b/.test(l) || (/<CardButton\s*$/.test(l) && /^\s*stacked\b/.test(lines[i + 1] ?? ''));
          if (!inRow && !stacked) bad.push(`${f}:${i + 1}`);
        });
      }
      expect(!bad.length, `a chat button in a column isn't stacked: ${bad.join(', ')}`);
      return 'every column button is stacked';
    });

    for (const route of ROUTES)
      await check('screens', `Open ${route}`, async () => {
        errors.length = 0;
        await page.goto(`http://localhost:8099${route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.waitForTimeout(3500);
        const text = await page.evaluate(() => document.body.innerText || '');
        const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
        await page.screenshot({ path: join(OUT, `${name}.png`) });
        expect(!/Something went wrong|Unexpected error|undefined is not|Cannot read propert|Unmatched Route|This screen doesn't exist/i.test(text), `error on screen: ${text.match(/Something went wrong|Unexpected error|undefined is not[^\n]*|Cannot read propert[^\n]*|Unmatched Route|This screen doesn't exist/i)?.[0]}`);
        expect(text.replace(/\s+/g, '').length > 40, 'blank screen');
        expect(!/\{\{\w+\}\}|undefined|NaN/.test(text), `raw text on screen: ${text.match(/\{\{\w+\}\}|undefined|NaN/)?.[0]}`);
        expect(!errors.length, errors.slice(0, 3).join('\n'));
        return 'ok';
      });

    // Hindi is a choice, not the default (owner, 5 Nov): the main screens in it, then back to Arabic for the flows below
    await page.evaluate(() => localStorage.setItem('muntej.language', 'hi'));
    for (const route of ['/01-home', '/38-tasks', '/04-decisions', '/18-alerts', '/17-summaries', '/39-team', '/53-profile', '/settings'])
      await check('hindi', `Open ${route} in Hindi`, async () => {
        errors.length = 0;
        await page.goto(`http://localhost:8099${route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.waitForTimeout(5000);
        const text = await page.evaluate(() => document.body.innerText || '');
        await page.screenshot({ path: join(OUT, `hi_${route.replace(/^\//, '')}.png`) });
        expect(!/Something went wrong|Unexpected error|undefined is not|Cannot read propert|Unmatched Route/i.test(text), `error on screen: ${text.slice(0, 200)}`);
        expect(!/\{\{\w+\}\}|undefined|NaN/.test(text), `raw text on screen: ${text.match(/\{\{\w+\}\}|undefined|NaN/)?.[0]}`);
        const hindi = text.match(/[\u0900-\u097F]/g)?.length ?? 0;
        expect(hindi >= 30, `only ${hindi} Hindi letters on screen: ${text.slice(0, 160)}`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(wide <= 1, `the page is ${wide}px too wide`);
        expect(!errors.length, errors.slice(0, 3).join('\n'));
        return `${hindi} Hindi letters`;
      });
    await page.evaluate(() => localStorage.setItem('muntej.language', 'ar'));
    await page.goto('http://localhost:8099/01-home', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForTimeout(3000);

    await check('flows', 'Build a team → Review → edit a person', async () => {
      errors.length = 0;
      await page.goto('http://localhost:8099/61-build-team', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.getByText('اكتبها أو الصق قائمة').first().click();
      await page.getByPlaceholder(/اكتب مين يتبع مين/).fill('عندنا هند مديرة المالية وتحتها بدر وجود');
      await page.getByRole('button', { name: /اقرأها/ }).click();
      await page.waitForURL(/62-team-review/, { timeout: 90_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(OUT, 'flow_review.png') });
      await page.getByRole('button', { name: /تعديل/ }).first().click();
      await page.waitForTimeout(800);
      expect(await page.getByText('المسمى الوظيفي').first().isVisible(), 'edit fields did not open');
      await page.screenshot({ path: join(OUT, 'flow_review_edit.png') });
      expect(!errors.length, errors.slice(0, 3).join('\n'));
      return 'tree + inline edit work';
    });
    // Nouran, 10 Nov: "I still don't see my definition of done on the UI … I can't answer the definition of done or see
    // that question on the task itself". Read the task page as the giver: the details as words, the question bar
    await check('flows', 'A task shows its definition of done, and the giver sees the question with «جاوب»', async () => {
      const tag = Date.now().toString(36);
      const [t] = await sql(`insert into public.tasks (title, owner_id, assigner_id, status, definition_of_done) values ('QA details ${tag}', 'a0000000-0000-4000-b000-000000000011', '${QA_BOSS}', 'in_progress', 'QA done when signed ${tag}') returning id`);
      await sql(`insert into public.alerts (profile_id, kind, task_id, subject_id, title, body, title_ar, body_ar, dedupe_key)
        values ('${QA_BOSS}', 'detail_asked', '${t.id}', 'a0000000-0000-4000-b000-000000000011', 'asks', 'x', 'يسأل', 'x', 'ask:${t.id}:due:${new Date().toISOString().slice(0, 10)}')`);
      try {
        await page.goto(`http://localhost:8099/14-task-detail?id=${t.id}`, { waitUntil: 'domcontentloaded' });
        await page.getByText(`QA done when signed ${tag}`).waitFor({ timeout: 25_000 });
        await page.getByText(/يسأل عن الموعد/).waitFor({ timeout: 10_000 });
        await page.getByRole('button', { name: 'جاوب' }).first().waitFor({ timeout: 5_000 });
        await page.screenshot({ path: join(OUT, 'flow_task_details.png') });
        return 'definition of done shown; question bar with «جاوب»';
      } finally {
        await sql(`delete from public.alerts where task_id = '${t.id}'`);
        await sql(`delete from public.tasks where id = '${t.id}'`);
      }
    });
    // The owner, 11 Nov: "I have many of the tasks should be approved… if I went to the page of the decisions, I have
    // nothing there". Read as the manager: finished work, a more-time request, a question and a cancel request all wait
    // on «يحتاجك», and the tab title, the Tasks line and WhatsApp's «عندك N تنتظرك» say the same N
    await check('flows', '«يحتاجك» holds everything waiting on you, and the tab, Tasks and WhatsApp show one number', async () => {
      const tag = Date.now().toString(36);
      const FA = 'a0000000-0000-4000-b000-000000000011';
      const made = [];
      for (const [title, status] of [[`QA nyou review ${tag}`, 'submitted'], [`QA nyou time ${tag}`, 'in_progress'], [`QA nyou ask ${tag}`, 'in_progress'], [`QA nyou cancel ${tag}`, 'in_progress']])
        made.push((await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('${title}', '${FA}', '${QA_BOSS}', '${status}') returning id`))[0].id);
      await sql(`insert into public.decisions (task_id, manager_id, requested_by, type, title, status) values ('${made[1]}', '${QA_BOSS}', '${FA}', 'extension_request', 'QA nyou more time ${tag}', 'pending')`);
      // every branch of the scope (reviewer, 11 Nov): finished work someone ELSE gave, with a review round naming the
      // manager; and a comment
      const AB = 'a0000000-0000-4000-b000-000000000012';
      made.push((await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA nyou other giver ${tag}', '${FA}', '${AB}', 'submitted') returning id`))[0].id);
      await sql(`insert into public.reviews (task_id, round, submitted_by, reviewer_id) values ('${made[4]}', 1, '${FA}', '${QA_BOSS}')`);
      made.push((await sql(`insert into public.tasks (title, owner_id, assigner_id, status) values ('QA nyou comment ${tag}', '${FA}', '${QA_BOSS}', 'in_progress') returning id`))[0].id);
      await sql(`insert into public.alerts (profile_id, kind, task_id, subject_id, title, body, title_ar, body_ar, dedupe_key) values
        ('${QA_BOSS}', 'detail_asked', '${made[2]}', '${FA}', 'asks', 'x', 'يسأل عن الموعد', 'x', 'ask:${made[2]}:due:${tag}'),
        ('${QA_BOSS}', 'cancel_asked', '${made[3]}', '${FA}', 'cancel?', '', 'تلغيها؟ ${tag}', '', 'cancel_ask:${made[3]}:${FA}'),
        ('${QA_BOSS}', 'task_comment', '${made[5]}', '${FA}', 'comment', 'x', 'تعليق ${tag}', 'x', 'qa-nyou-c-${tag}')`);
      // the manager's own task due today: «ومهامك اليوم» on WhatsApp, never in the number
      made.push((await sql(`insert into public.tasks (title, owner_id, assigner_id, status, due_at) values ('QA nyou mine ${tag}', '${QA_BOSS}', '${QA_BOSS}', 'assigned', now() + interval '1 hour') returning id`))[0].id);
      try {
        await page.goto('http://localhost:8099/04-decisions', { waitUntil: 'domcontentloaded' });
        const title = page.getByText(/يحتاجك · [\d٠-٩]+/).first();
        await title.waitFor({ timeout: 25_000 });
        await page.getByText(`QA nyou review ${tag}`).first().waitFor({ timeout: 15_000 });
        await page.getByText(`QA nyou cancel ${tag}`).first().waitFor({ timeout: 10_000 });
        const toN = (s) =>
          /شي واحد|^وحدة/.test(s) ? 1 : /شيئين|ثنتين/.test(s) ? 2 : Number((s.match(/[\d٠-٩]+/)?.[0] ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
        await page.getByText(`QA nyou other giver ${tag}`).first().waitFor({ timeout: 10_000 });
        const n = toN(await title.innerText());
        expect(n >= 6, `«يحتاجك» counts ${n}, it should hold at least the 6 made here`);
        const body = await page.evaluate(() => document.body.innerText);
        expect(!/ما فيه شي ينتظرك/.test(body), '«ما فيه شي ينتظرك» shows while things wait');
        // the tab badge carries the same number
        const badge = await page.getByRole('tab', { name: 'يحتاجك' }).innerText().catch(() => '');
        expect(toN(badge) === n, `the tab badge says «${badge}», the screen says ${n}`);
        await page.screenshot({ path: join(OUT, 'flow_needs_you.png') });
        // the Tasks line says the same
        await page.goto('http://localhost:8099/38-tasks', { waitUntil: 'domcontentloaded' });
        const line = page.getByText(/[\d٠-٩]+ (أشياء|شي) (تحتاجك|يحتاجك)|شي واحد يحتاجك|شيئين يحتاجونك/).first();
        await line.waitFor({ timeout: 20_000 }).catch(async (e) => {
          await page.screenshot({ path: join(OUT, 'flow_needs_tasks_failed.png'), fullPage: true });
          throw new Error(`${e.message.split('\n')[0]} · page: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)}`);
        });
        expect(toN(await line.innerText()) === n, `Tasks says «${await line.innerText()}», the tab says ${n}`);
        // Home's card too
        await page.goto('http://localhost:8099/01-home', { waitUntil: 'domcontentloaded' });
        const home = page.getByText(/يحتاجك · [\d٠-٩]+/).first();
        await home.waitFor({ timeout: 25_000 });
        expect(toN(await home.innerText()) === n, `Home says «${await home.innerText()}», the tab says ${n}`);
        // and the midday report
        const rep = await fn('daily-summary', { test: true, kind: 'midday', dry: true }, JWT);
        const inRep = /(\d+) تحتاجك/.exec(rep.preview ?? '');
        // (a skipped report would pass without comparing: it must be there — reviewer, 11 Nov)
        expect(!rep.skipped, `no midday report to compare (${rep.skipped})`);
        expect(inRep && Number(inRep[1]) === n, `the report says «${(rep.preview ?? '').slice(0, 80)}», the app says ${n}`);
        // and WhatsApp's opening line
        const [{ s: secret }] = await sql("select decrypted_secret as s from vault.decrypted_secrets where name='cron_secret'");
        // (the QA number on the manager for this step: outside the WhatsApp checks it has none — put back after)
        const [{ phone: hadPhone }] = await sql(`select phone from public.profiles where id = '${QA_BOSS}'`);
        await sql(`update public.profiles set phone = '${QA_PHONE}' where id = '${QA_BOSS}'`);
        const sent = await fn('whatsapp', { simulate: { from: QA_PHONE, text: 'وش يحتاجني' } }, null, { 'x-cron-secret': secret })
          .then((r) => r.sent ?? [])
          .finally(() => sql(`update public.profiles set phone = ${hadPhone ? `'${hadPhone}'` : 'null'} where id = '${QA_BOSS}'`));
        const said = sent.map((m) => m.text?.body ?? m.interactive?.body?.text ?? '').join(' | ');
        const opening = said.match(/عندك\s+([\d٠-٩]+)\s+تنتظرك/)?.[1] ?? (/فيه شي واحد ينتظرك/.test(said) ? '1' : null);
        expect(opening && toN(opening) === n, `WhatsApp says «${said.slice(0, 80)}», the app says ${n}`);
        // your own task due today still comes, after, and not in the number
        // (the first 3 by due date: another of today's tasks may come before this one)
        expect(/ومهامك اليوم/.test(said) && JSON.stringify(sent).includes('h:done:'), `no «ومهامك اليوم» with your own task: ${said.slice(-120)}`);
        return `one number everywhere: ${n}`;
      } finally {
        await sql(`delete from public.alerts where task_id in (${made.map((x) => `'${x}'`).join(',')})`);
        await sql(`delete from public.reviews where task_id in (${made.map((x) => `'${x}'`).join(',')})`);
        await sql(`delete from public.decisions where task_id in (${made.map((x) => `'${x}'`).join(',')})`);
        await sql(`delete from public.tasks where id in (${made.map((x) => `'${x}'`).join(',')})`);
      }
    });
    await check('flows', 'Send an idea', async () => {
      errors.length = 0;
      await page.goto('http://localhost:8099/59-ideas', { waitUntil: 'domcontentloaded' });
      // wait for the box itself (a fixed wait sometimes typed before the screen was ready: the text was lost)
      const box = page.getByPlaceholder(/وش اللي يخلي منتج أحسن لك/);
      await box.waitFor({ timeout: 30_000 });
      await page.waitForTimeout(800);
      // typed key by key: fill() can set the box without the app seeing it (it then sent an empty idea and failed)
      await box.click();
      await box.pressSequentially('فكرة من الاختبار الآلي', { delay: 15 });
      await page.getByRole('button', { name: 'أرسل' }).click();
      await page.getByText(/وصلت، شكرًا لك/).waitFor({ timeout: 20_000 }).catch(async (e) => {
        await page.screenshot({ path: join(OUT, 'flow_idea_failed.png'), fullPage: true });
        // the page's own errors too, so the cause shows next time (it failed several runs while the server check passed)
        throw new Error(`${e.message.split('\n')[0]} · errors: ${errors.slice(-3).join(' | ').slice(0, 300) || 'none'} · page: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200)}`);
      });
      await page.screenshot({ path: join(OUT, 'flow_idea.png') });
      return 'sent and thanked';
    });
    await check('flows', 'Customize Home: preview and switch', async () => {
      errors.length = 0;
      await page.goto('http://localhost:8099/58-home-sections', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.getByRole('button', { name: 'القرارات' }).first().click();
      await page.getByText('أضفها للرئيسية').waitFor({ timeout: 10_000 });
      await page.screenshot({ path: join(OUT, 'flow_customize_preview.png') });
      expect(!errors.length, errors.slice(0, 3).join('\n'));
      return 'preview opens';
    });
  } catch (e) {
    bad('screens', 'Screen run', e?.message ?? e);
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true });
  }
}

// ─── run ──────────────────────────────────────────────────────────────────────
expect(TOKEN, 'SUPABASE_ACCESS_TOKEN is not set (the same user env var db-apply uses)');
if (want('code')) await code();
if (want('server') || want('ui') || want('screens') || want('cases') || want('invites') || want('tasks')) await server();
if (JWT && (want('server') || want('cases') || want('tasks'))) {
  await taskCases({ check, expect, fn, sql, jwt: JWT, jwtFor, rpc, insert, get, ids: { QA_ACCOUNT, QA_BOSS } });
}
if (JWT && (want('server') || want('cases') || want('invites'))) {
  await inviteCases({ check, expect, fn, sql, jwt: JWT, jwtFor, rpc, ids: { QA_ACCOUNT, QA_BOSS } });
}
if (JWT && (want('server') || want('cases'))) {
  const transcript = await cases({
    jwtFor,
    rpc,
    check,
    expect,
    fn,
    sql,
    jwt: JWT,
    ref: REF,
    token: TOKEN,
    ids: {
      QA_ACCOUNT,
      QA_BOSS,
      FAISAL: 'a0000000-0000-4000-b000-000000000011',
      ABDULLAH: 'a0000000-0000-4000-b000-000000000012',
      NOURA: 'a0000000-0000-4000-b000-000000000013',
      KHALID: 'a0000000-0000-4000-b000-000000000014',
      SAAD: 'a0000000-0000-4000-b000-000000000015',
    },
  }).catch((e) => (bad('cases', 'Real cases', e?.message ?? e), []));
  writeFileSync(join(OUT, 'chat-transcript.md'), transcript.join('\n\n'));
}
if (!noUi && (want('ui') || want('screens'))) await screens();

const failed = results.filter((r) => !r.pass && !WARN_ONLY.has(r.area));
const warned = results.filter((r) => !r.pass && WARN_ONLY.has(r.area));
const lines = [
  `# Muntej QA — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  '',
  (failed.length ? `**${failed.length} failed** of ${results.length}` : `**All ${results.length - warned.length} passed** ✅`) +
    (warned.length ? ` · ⚠️ ${warned.length} need the owner's setup` : ''),
  '',
  // what this run left out, and why (owner, 11 Nov): core + what changed since the last test release, unless --full
  full || !since
    ? 'Full run: every check.'
    : `Core + changed (${[...changedAreas].join(', ') || 'no area'}) since the last test release · ${skipped.length} other checks left out (run them with --full).`,
  ...(secondTry.length ? ['', `⚠️ ${secondTry.length} passed only on the second try: ${secondTry.join(' · ')}`] : []),
  ...(skipped.length
    ? ['', '<details><summary>Left out this run</summary>', '', ...[...new Set(skipped.map((s) => s.area))].map((a) => `- **${a}**: ${skipped.filter((s) => s.area === a).map((s) => s.name).join(' · ')}`), '', '</details>']
    : []),
  '',
  '| | Area | Check | Detail |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.pass ? '✅' : WARN_ONLY.has(r.area) ? '⚠️' : '❌'} | ${r.area} | ${r.name} | ${r.detail.replace(/\n/g, '<br>').replace(/\|/g, '/')} |`),
];
writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
console.log(lines.join('\n'));
process.exit(failed.length ? 1 : 0);