// App Review user journey (Apple, 4 Nov: "clear screens with the user journey, how the system works, for all of it").
//   node scripts/store/journey.mjs   → store/journey/*.png (430×932 at 3×, English)
// Every shot comes from the review demo company (scripts/store/review-seed.sql, re-run here so dates are fresh):
// first the manager (the reviewer's own login), then Faisal, an employee in the same demo company.
// Needs what graphics.mjs needs: SUPABASE_ACCESS_TOKEN, .env, Playwright's Chromium.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

if (!process.execArgv.includes('--use-system-ca') && !(process.env.NODE_OPTIONS ?? '').includes('--use-system-ca')) {
  const r = spawnSync(process.execPath, ['--use-system-ca', ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'store', 'journey');
mkdirSync(OUT, { recursive: true });
const REF = 'katwiedukkvssuxbjbqf';
const TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ||
  spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"], { encoding: 'utf8' }).stdout.trim();
const DEMO = 'c0000000-0000-4000-b000-000000000001';
const BOSS = 'c0000000-0000-4000-b000-000000000010';
const FAISAL = 'c0000000-0000-4000-b000-000000000011';
const PORT = 8099;
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// fresh demo company, Saree3's tips paused for the shots
await sql(readFileSync(join(ROOT, 'scripts', 'store', 'review-seed.sql'), 'utf8'));
await sql(`
  update public.profiles set locale = 'en' where id in ('${BOSS}', '${FAISAL}');
  insert into public.coach_moments (profile_id, key) values ('${BOSS}', '_paused'), ('${FAISAL}', '_paused') on conflict do nothing;
  update public.onboarding set dismissed = true where profile_id in ('${BOSS}', '${FAISAL}');
`);
const ids = Object.fromEntries(
  (await sql(`select title, id from public.tasks where assigner_id in (select id from public.profiles where account_id = '${DEMO}')`)).map((r) => [r.title, r.id]),
);

const sha = (s) => createHash('sha256').update(s).digest('hex');
async function linkToken(profile) {
  const token = randomBytes(24).toString('base64url');
  await sql(`insert into public.invites (account_id, profile_id, channel, token_hash, status) values ('${DEMO}', '${profile}', 'email', '${sha(token)}', 'sent')`);
  return token;
}

const server = spawn('npx', ['expo', 'start', '--web', '--port', String(PORT), '--offline', '--no-dev'], {
  cwd: ROOT,
  shell: true,
  env: { ...process.env, NODE_OPTIONS: '--use-system-ca', BROWSER: 'none', CI: '1' },
});
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const BASE = `http://localhost:${PORT}`;
async function ctx() {
  const c = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, locale: 'en' });
  await c.addInitScript(() => localStorage.setItem('muntej.language', 'en'));
  return c;
}

async function settle(page, ms = 5000) {
  await page.waitForTimeout(ms);
  for (const label of ['Skip', 'Not now', 'Later', 'Close', 'Got it'])
    await page.getByText(label, { exact: true }).first().click({ timeout: 400 }).catch(() => {});
  await page.waitForTimeout(800);
}
async function shot(page, name, route, before) {
  if (ONLY && !ONLY.some((o) => name.startsWith(o))) return;
  if (route) await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await settle(page);
  if (before) await before(page);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`✓ ${name}`);
}
async function signInAs(profile) {
  const c = await ctx();
  const page = await c.newPage();
  await page.goto(`${BASE}/join?t=${await linkToken(profile)}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => !location.pathname.startsWith('/join'), null, { timeout: 420_000 });
  await page.evaluate(() => localStorage.setItem('launch.lastShown', new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)));
  return page;
}

try {
  for (const t0 = Date.now(); ; ) {
    if (await fetch(BASE).then((r) => r.ok).catch(() => false)) break;
    if (Date.now() - t0 > 240_000) throw new Error("web app didn't start");
    await new Promise((r) => setTimeout(r, 2000));
  }

  // ── signed out: sign in ──
  {
    const c = await ctx();
    const page = await c.newPage();
    await shot(page, '01-sign-in', '/sign-in', async (p) => {
      await p.locator('input').first().waitFor({ timeout: 60_000 }).catch(() => {});
      await p.locator('input').first().fill('play-review@muntej.app').catch(() => {});
      await p.waitForTimeout(500);
    });
    await c.close();
  }

  // the AI's step plan on a task takes a while to appear
  const planReady = async (p) => {
    await p.getByText('Thinking', { exact: false }).first().waitFor({ state: 'hidden', timeout: 45_000 }).catch(() => {});
    await p.waitForTimeout(1000);
  };

  // ── 1. the manager says a task ──
  const m = await signInAs(BOSS);
  await shot(m, '02-manager-home', '/01-home');
  await shot(m, '03-create-task', '/02-capture?say=' + encodeURIComponent('Ask Faisal to send the price offer to Al Noor by Thursday'), async (p) => {
    await p.waitForTimeout(25_000);
  });
  const offer = (await sql(`select id from public.tasks where owner_id = '${FAISAL}' and title ilike '%offer%' order by created_at desc limit 1`))[0]?.id;
  if (!offer && !ONLY) throw new Error('the chat made no price-offer task for Faisal');
  await shot(m, '04-task-plan', `/14-task-detail?id=${offer}`, planReady);
  await shot(m, '05-team-tasks', '/38-tasks', async (p) => {
    await p.getByText(/^Team\s*·/).first().click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(1500);
  });

  // ── 2. the employee gets it, updates and sends it back ──
  const e = await signInAs(FAISAL);
  await shot(e, '06-employee-home', '/25-employee-home');
  await shot(e, '07-employee-chat', '/06-employee-chat');
  await shot(e, '08-employee-task', `/14-task-detail?id=${offer}`, planReady);
  await shot(e, '09-employee-sent', null, async (p) => {
    await p.getByText('Send for review', { exact: true }).first().click({ timeout: 5000 });
    await p.waitForTimeout(3000);
    for (const label of ['Send', 'Send for review', 'Yes, send'])
      await p.getByRole('button', { name: label, exact: true }).last().click({ timeout: 800 }).catch(() => {});
    await p.waitForTimeout(4000);
  });
  await e.context().close();

  // ── 3. the manager decides, reviews and reads the reports ──
  await shot(m, '10-decisions', '/04-decisions');
  await shot(m, '11-review-work', `/15-review?id=${offer}`);
  await shot(m, '12-what-muntej-did', '/03-autopilot');
  await shot(m, '13-weekly-brief', '/05-brief');
  await shot(m, '14-saree3', '/54-saree3');
  await shot(m, '15-team', '/39-team');
  await shot(m, '16-tools', '/42-incoming');
  await shot(m, '17-settings', '/settings', async (p) => {
    await p.getByText('Delete my account', { exact: true }).first().scrollIntoViewIfNeeded({ timeout: 10_000 });
    await p.waitForTimeout(800);
  });
  await m.context().close();
  console.log(`\nSaved in ${OUT}`);
} finally {
  await browser.close();
  spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true });
}
