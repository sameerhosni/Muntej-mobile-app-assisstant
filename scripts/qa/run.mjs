// Muntej QA — the check that runs before every update is published (owner, 28 Oct: "create a tool to test any
// enhancement before applying it, tell you the bugs, fix, and loop until everything is correct").
//   node scripts/qa/run.mjs            everything
//   node scripts/qa/run.mjs --no-ui    code + server only (no browser)
//   node scripts/qa/run.mjs --only ui  only the screens
// What it does:
//   1. code: app type-check, every edge function type-check
//   2. resets the separate test company "Muntej QA" (scripts/qa/seed.sql; real companies are never touched) and signs
//      in as its manager with a one-time test link (no shared code, no real person)
//   3. server: Saree3 chat, the three reports, reading a team, confirming it, WhatsApp turns (dry, nothing sent),
//      WhatsApp sign-in, ideas
//   4. screens: runs the app in a browser on this PC, opens every screen (errors, blank screens, crashes) and the key
//      flows (build a team → review → edit someone; send an idea; Customize Home), with screenshots
// Writes qa-out/report.md and qa-out/*.png; exits 1 when anything failed.
// Needs: SUPABASE_ACCESS_TOKEN (user env var, as db-apply), .env (public URL + key), Playwright's Chromium.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
async function check(area, name, fn) {
  const t0 = Date.now();
  try {
    const d = await fn();
    ok(area, name, `${d ?? ''} (${Math.round((Date.now() - t0) / 100) / 10}s)`);
  } catch (e) {
    bad(area, name, e?.message ?? e);
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
    await check('flows', 'Send an idea', async () => {
      errors.length = 0;
      await page.goto('http://localhost:8099/59-ideas', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.getByPlaceholder(/وش اللي يخلي منتج أحسن لك/).fill('فكرة من الاختبار الآلي');
      await page.getByRole('button', { name: 'أرسل' }).click();
      await page.getByText(/وصلت، شكرًا لك/).waitFor({ timeout: 20_000 });
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
if (want('server') || want('ui') || want('screens')) await server();
if (!noUi && (want('ui') || want('screens'))) await screens();

const failed = results.filter((r) => !r.pass);
const lines = [
  `# Muntej QA — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  '',
  failed.length ? `**${failed.length} failed** of ${results.length}` : `**All ${results.length} passed** ✅`,
  '',
  '| | Area | Check | Detail |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.pass ? '✅' : '❌'} | ${r.area} | ${r.name} | ${r.detail.replace(/\n/g, '<br>').replace(/\|/g, '/')} |`),
];
writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
console.log(lines.join('\n'));
process.exit(failed.length ? 1 : 0);
