// Google Play graphics (owner, 27 Oct: "do whatever needed to go live in android").
//   node scripts/store/graphics.mjs
// Writes store/android/: icon-512.png, feature-graphic.png (1024×500) and phone screenshots (1080×2160, Play's max
// 2:1 shape) of the main screens in Arabic. The screenshots come from the QA test company (never a real one): its
// task names are switched to Arabic and Saree3's tips paused for the shots; the next QA run resets it all.
// Needs what the QA robot needs: SUPABASE_ACCESS_TOKEN, .env, Playwright's Chromium.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

if (!process.execArgv.includes('--use-system-ca') && !(process.env.NODE_OPTIONS ?? '').includes('--use-system-ca')) {
  const r = spawnSync(process.execPath, ['--use-system-ca', ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'store', 'android');
mkdirSync(OUT, { recursive: true });
const REF = 'katwiedukkvssuxbjbqf';
const TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ||
  spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"], { encoding: 'utf8' }).stdout.trim();
const QA = 'a0000000-0000-4000-b000-000000000001';
const BOSS = 'a0000000-0000-4000-b000-000000000010';
const PORT = 8098;

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// ─── the QA company, dressed for the photos (QA account only) ─────────────────
const ARABIC = {
  'Send the Q4 sales forecast': 'إرسال توقعات مبيعات الربع الرابع',
  'Prepare the client demo': 'تجهيز العرض التجريبي للعميل',
  'Design the new brochure': 'تصميم البروشور الجديد',
  'Update the price list': 'تحديث قائمة الأسعار',
  'Send the signed contract': 'إرسال العقد الموقّع',
};
const inQa = `(select id from public.profiles where account_id = '${QA}')`;
await sql(`
  update public.tasks t set title = m.ar from (values ${Object.entries(ARABIC).map(([en, ar]) => `('${en}', '${ar}')`).join(',')}) m(en, ar)
   where t.title = m.en and t.assigner_id in ${inQa};
  update public.decisions set title_ar = 'فيصل يطلب وقت زيادة في «إرسال توقعات مبيعات الربع الرابع»' where manager_id = '${BOSS}';
  update public.profiles set full_name_ar = 'أحمد' where id = '${BOSS}';
  update public.profiles p set title = m.ar from (values ('Operations Manager', 'مدير العمليات'), ('Sales Lead', 'قائد المبيعات'),
    ('Sales Rep', 'مندوب مبيعات'), ('Sales Rep (QA)', 'مندوب مبيعات'), ('QA Lead', 'قائدة الجودة'), ('Tester', 'مختبر أنظمة'), ('Designer', 'مصمم')) m(en, ar)
   where p.title = m.en and p.account_id = '${QA}';
  update public.accounts set name_ar = 'شركة الأفق' where id = '${QA}';
  insert into public.coach_moments (profile_id, key) values ('${BOSS}', '_paused') on conflict do nothing;
  update public.onboarding set dismissed = true where profile_id = '${BOSS}';
`);

const sha = (s) => createHash('sha256').update(s).digest('hex');
async function linkToken() {
  const token = randomBytes(24).toString('base64url');
  await sql(`insert into public.invites (account_id, profile_id, channel, token_hash, status) values ('${QA}', '${BOSS}', 'email', '${sha(token)}', 'sent')`);
  return token;
}

// ─── the app in a browser ─────────────────────────────────────────────────────
const server = spawn('npx', ['expo', 'start', '--web', '--port', String(PORT), '--offline'], {
  cwd: ROOT,
  shell: true,
  env: { ...process.env, NODE_OPTIONS: '--use-system-ca', BROWSER: 'none', CI: '1' },
});
const { chromium } = await import('playwright');
const browser = await chromium.launch();
try {
  for (const t0 = Date.now(); ; ) {
    if (await fetch(`http://localhost:${PORT}`).then((r) => r.ok).catch(() => false)) break;
    if (Date.now() - t0 > 240_000) throw new Error("web app didn't start");
    await new Promise((r) => setTimeout(r, 2000));
  }

  // icon 512 and the feature graphic, drawn from the brand files
  const art = await browser.newPage();
  const b64 = (f) => `data:image/png;base64,${readFileSync(join(ROOT, f)).toString('base64')}`;
  await art.setViewportSize({ width: 512, height: 512 });
  await art.setContent(`<body style="margin:0"><img src="${b64('assets/icon.png')}" style="width:512px;height:512px;display:block"></body>`);
  await art.screenshot({ path: join(OUT, 'icon-512.png') });
  await art.setViewportSize({ width: 1024, height: 500 });
  await art.setContent(`<html dir="rtl"><head><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@500;700&display=swap" rel="stylesheet"></head>
    <body style="margin:0;width:1024px;height:500px;overflow:hidden;font-family:'IBM Plex Sans Arabic',sans-serif;
      background:linear-gradient(120deg,#1d4ed8 0%,#4f46e5 55%,#06b6d4 100%);color:#fff;display:flex;align-items:center;
      justify-content:space-between;padding:0 80px;box-sizing:border-box">
      <div><div style="font-size:72px;font-weight:700;line-height:1.1">قلها وانساها</div>
        <div style="font-size:30px;font-weight:500;opacity:.92;margin-top:18px">منتج يسلّم المهمة لفريقك، يتابعها،<br>ويرجع لك بالنتيجة</div></div>
      <img src="${b64('assets/icon.png')}" style="width:220px;height:220px;border-radius:48px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
    </body></html>`);
  await art.waitForTimeout(1500);
  await art.screenshot({ path: join(OUT, 'feature-graphic.png') });

  // phone screenshots: 360×720 css at 3× = 1080×2160
  const page = await browser.newPage({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, locale: 'ar' });
  await page.goto(`http://localhost:${PORT}/join?t=${await linkToken()}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => !location.pathname.startsWith('/join'), null, { timeout: 180_000 });
  // the one-new-feature-a-day card has had its turn today (LaunchCard's key, Riyadh date)
  await page.evaluate(() => localStorage.setItem('launch.lastShown', new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)));
  const SHOTS = [
    ['1-home', '/'],
    ['2-tasks', '/38-tasks'],
    ['3-decisions', '/04-decisions'],
    ['4-saree3', '/54-saree3'],
    ['5-team', '/39-team'],
  ];
  for (const [name, route] of SHOTS) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForTimeout(5000);
    // anything Saree3 still pops up: close it
    for (const label of ['تخطّ', 'مو الحين', 'بعدين', 'إغلاق'])
      await page.getByText(label, { exact: true }).first().click({ timeout: 500 }).catch(() => {});
    // the team's tasks say more than the manager's own list
    if (route === '/38-tasks') await page.getByText(/الفريق\s*·/).first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`✓ ${name}`);
  }
  console.log(`\nSaved in ${OUT}`);
} finally {
  await browser.close();
  spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true });
  await sql(`update public.accounts set name_ar = 'منتج للاختبار' where id = '${QA}'`).catch(() => {});
}
