// Muntej release in one step (owner, 27 Oct: "a lot of updates… waste of time to do all these actions every time"),
// tested before it goes live (owner, 6 Nov: "Let's create a new version for testing before going live and once updates
// approved we can go live").
//   npm run ship -- "what changed"            TEST: QA → database → server → app update to Muntej Test only → GitHub
//   npm run ship -- --live                    LIVE: the exact update that was tested → the store app; features on
//   npm run ship -- "what changed" --build    TEST, and a new Muntej Test app to install (native changes, or the first one)
//   npm run ship -- "what changed" --store    … and a Google Play bundle (.aab) from the same GitHub build
// Stops at the first failure.
// TEST releases everything since the last test (git tag `testing`, else `shipped`):
//   1. the work must be committed (nothing half-done goes out)
//   2. QA robot (scripts/qa/run.mjs) must be all green
//   3. new supabase/migrations are applied (scripts/db-apply.ps1)
//   4. edge functions whose code changed are type-checked and deployed (a change in _shared deploys every function
//      that imports it). There is one server for everyone: a new feature waits behind features.testing (only testers
//      see it) until --live
//   5. app code changed → over-the-air update to the preview channel only (the Muntej Test app); its update group is
//      kept in scripts/release/testing.json for --live
//   6. logs it under Done in docs/BACKLOG.md as "In testing" (its own commit)
//   7. push to GitHub; --build tags android-test-<version>-<n> (the Muntej Test APK), --store android-production-…
//   8. moves the `testing` tag here
// LIVE (--live): republishes that same update group to the production channel (nothing is rebuilt, so the store app
// gets exactly what was tested), turns on every feature in testing, logs "Live", moves `shipped` to `testing`, pushes.
// Needs: SUPABASE_ACCESS_TOKEN and EXPO_TOKEN (user env vars), GitHub sign-in already saved on this PC.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const REF = 'katwiedukkvssuxbjbqf';
const TESTING = join(ROOT, 'scripts', 'release', 'testing.json');
const args = process.argv.slice(2);
const live = args.includes('--live');
const store = args.includes('--store');
const build = store || args.includes('--build');
const message = args.filter((a) => !a.startsWith('--')).join(' ').trim();

// the company network re-signs HTTPS: every child (supabase, eas, node) needs the system certificates
const ENV = { ...process.env, NODE_OPTIONS: '--use-system-ca' };
const userEnv = (name) =>
  process.env[name] ||
  spawnSync('powershell', ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('${name}','User')`], { encoding: 'utf8' }).stdout.trim();

const say = (s) => console.log(`\n▶ ${s}`);
const fail = (s) => {
  console.error(`\n✖ ${s}\nNothing after this step was released.`);
  process.exit(1);
};
function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { cwd: ROOT, env: ENV, shell: true, encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit', ...opts });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
const git = (...a) => run('git', a, { quiet: true }).out.trim();
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
const today = new Date().toISOString().slice(0, 10);
const BACKLOG = join(ROOT, 'docs', 'BACKLOG.md');
/** one line under Done (the page's date moves too), committed on its own */
function logDone(line, commitMessage) {
  if (!existsSync(BACKLOG)) return;
  const page = readFileSync(BACKLOG, 'utf8')
    .replace(/^Last updated: .*$/m, `Last updated: ${today}`)
    .replace(/(## Done\r?\n\r?\n(?:\(move finished items here with the date\)\r?\n(?:\r?\n)?)?)/, `$1${line}\n`);
  writeFileSync(BACKLOG, page);
  git('add', 'docs/BACKLOG.md');
  if (existsSync(TESTING)) git('add', 'scripts/release/testing.json');
  git('commit', '-q', '-m', JSON.stringify(commitMessage));
  console.log(`\n▶ Backlog\n  ✓ ${line}`);
}

// ─── 1. committed ─────────────────────────────────────────────────────────────
if (!live && !message) fail('Say what changed: npm run ship -- "what changed"');
const dirty = git('status', '--porcelain', '--untracked-files=no');
if (dirty) fail(`Uncommitted changes:\n${dirty}`);
const EXPO_TOKEN = userEnv('EXPO_TOKEN');
if (!EXPO_TOKEN) fail('EXPO_TOKEN is not set (user env var)');
ENV.EXPO_TOKEN = EXPO_TOKEN;
ENV.SUPABASE_ACCESS_TOKEN = userEnv('SUPABASE_ACCESS_TOKEN');

if (live) await goLive();
else await test();

// ─── LIVE: what was tested, for everyone ──────────────────────────────────────
async function goLive() {
  if (!existsSync(TESTING)) fail('Nothing in testing: run npm run ship -- "what changed" first');
  const t = JSON.parse(readFileSync(TESTING, 'utf8'));
  if (t.live_at) fail(`"${t.message}" is already live (${t.live_at})`);
  const tested = git('rev-parse', '--verify', '--quiet', 'testing');
  if (!tested) fail('No `testing` tag');
  console.log(`Going live: ${t.message} (tested ${t.at.slice(0, 16).replace('T', ' ')})`);

  if (t.group) {
    say('App update → store app (production), the same one that was tested');
    const u = run(
      'npx',
      ['-y', 'eas-cli@latest', 'update:republish', '--group', t.group, '--destination-channel', 'production', '--message', JSON.stringify(t.message), '--non-interactive'],
      { quiet: true },
    );
    if (u.code !== 0) fail(`Republishing to production failed:\n${u.out.slice(-1200)}`);
    console.log('  ✓ production');
  } else console.log('  (this release had no app change)');

  say('Features in testing → everyone');
  const on = await sql(`update public.features set testing = false, released_at = now() where testing returning key`).catch((e) => fail(`Turning features on failed: ${e.message}`));
  console.log(`  ✓ ${on.length ? on.map((f) => f.key).join(', ') : 'none were waiting'}`);

  writeFileSync(TESTING, JSON.stringify({ ...t, live_at: new Date().toISOString() }, null, 2) + '\n');
  logDone(`- ${today} · Live: ${t.message}${on.length ? ` (on for everyone: ${on.map((f) => f.key).join(', ')})` : ''}`, `Backlog: live ${t.message}`);

  say('GitHub');
  if (run('git', ['push', '-q', 'origin', 'HEAD']).code !== 0) fail('Push to GitHub failed');
  git('tag', '-f', 'shipped', tested);
  run('git', ['push', '-q', '-f', 'origin', 'shipped']);
  console.log(`\n✔ Live: ${t.message}`);
}

// ─── TEST: everything new, to Muntej Test and the testers ─────────────────────
async function test() {
  const since =
    git('rev-parse', '--verify', '--quiet', 'testing') || git('rev-parse', '--verify', '--quiet', 'shipped') || git('rev-list', '--max-parents=0', 'HEAD').split('\n')[0];
  const changed = git('diff', '--name-only', since, 'HEAD').split('\n').filter(Boolean);
  console.log(`Testing ${changed.length} changed file(s) since ${since.slice(0, 7)}: ${message}`);

  // ─── 1b. the reviewer accepted this exact code (owner, 9 Nov: "auto reviewer… rerun till it's accepted") ────
  // docs/review/ACCEPTED.md: one line per accepted review, "<commit> · <date> · ACCEPT · <what>". Only the review files
  // and the backlog may change after the accepted commit.
  {
    const log = existsSync(join(ROOT, 'docs', 'review', 'ACCEPTED.md')) ? readFileSync(join(ROOT, 'docs', 'review', 'ACCEPTED.md'), 'utf8') : '';
    const last = [...log.matchAll(/^- `?([0-9a-f]{7,40})`? · .* · ACCEPT/gm)].at(-1)?.[1];
    if (!last) fail('No accepted review yet: run the muntej-reviewer agent and record its ACCEPT in docs/review/ACCEPTED.md');
    const after = git('diff', '--name-only', last, 'HEAD').split('\n').filter(Boolean);
    const unreviewed = after.filter((f) => !f.startsWith('docs/review/') && f !== 'docs/BACKLOG.md');
    if (unreviewed.length) fail(`Changed since the last accepted review (${last.slice(0, 7)}): ${unreviewed.slice(0, 8).join(', ')}${unreviewed.length > 8 ? '…' : ''}. Run the muntej-reviewer agent again.`);
    console.log(`  ✓ reviewed and accepted at ${last.slice(0, 7)}`);
  }

  // ─── 2. QA ──────────────────────────────────────────────────────────────────
  say('QA robot');
  if (run('node', ['scripts/qa/run.mjs']).code !== 0) fail('QA failed, see qa-out/report.md');

  // ─── 3. database ────────────────────────────────────────────────────────────
  if (changed.some((f) => f.startsWith('supabase/migrations/'))) {
    say('Database changes');
    if (run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/db-apply.ps1']).code !== 0) fail('Database changes failed');
  }

  // ─── 4. server functions ────────────────────────────────────────────────────
  const FN_DIR = join(ROOT, 'supabase', 'functions');
  const functions = readdirSync(FN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(FN_DIR, d.name, 'index.ts')))
    .map((d) => d.name);
  const sharedChanged = changed.filter((f) => f.startsWith('supabase/functions/_shared/')).map((f) => f.split('/').pop());
  // a shared file can import another shared file: follow those links too
  const sharedFiles = readdirSync(join(FN_DIR, '_shared')).filter((f) => f.endsWith('.ts'));
  const touched = new Set(sharedChanged);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of sharedFiles)
      if (!touched.has(f) && [...touched].some((t) => readFileSync(join(FN_DIR, '_shared', f), 'utf8').includes(`./${t}`))) {
        touched.add(f);
        grew = true;
      }
  }
  const toDeploy = functions.filter((fn) => {
    if (changed.some((f) => f.startsWith(`supabase/functions/${fn}/`))) return true;
    const src = readFileSync(join(FN_DIR, fn, 'index.ts'), 'utf8');
    return [...touched].some((t) => src.includes(`_shared/${t}`));
  });
  if (toDeploy.length) {
    say(`Server: ${toDeploy.join(', ')}`);
    for (const fn of toDeploy) {
      const c = run('npx', ['-y', 'deno', 'check', '--node-modules-dir=none', `supabase/functions/${fn}/index.ts`], { quiet: true });
      if (c.code !== 0) fail(`${fn} has type errors:\n${c.out.slice(-1500)}`);
    }
    for (const fn of toDeploy) {
      // Supabase CLI 3 asks before deploying to production from an agent run; ship IS the owner's go-ahead (--yes)
      const d = run('npx', ['supabase', 'functions', 'deploy', fn, '--project-ref', REF, '--use-api', '--yes'], { quiet: true });
      if (d.code !== 0 || !d.out.includes('Deployed Functions')) fail(`Deploying ${fn} failed:\n${d.out.slice(-800)}`);
      console.log(`  ✓ ${fn}`);
    }
  }

  // ─── 5. app update: Muntej Test only ────────────────────────────────────────
  const appChanged = changed.some((f) => /^(app|src|assets)\//.test(f) || ['app.json', 'app.config.js', 'package.json'].includes(f));
  let group = null;
  if (appChanged) {
    say('App update → Muntej Test (preview)');
    const u = run('npx', ['-y', 'eas-cli@latest', 'update', '--channel', 'preview', '--environment', 'preview', '--message', JSON.stringify(message), '--non-interactive'], {
      quiet: true,
    });
    if (u.code !== 0 && !/Update group ID/.test(u.out)) fail(`App update (preview) failed:\n${u.out.slice(-1200)}`);
    group = u.out.match(/Update group ID\s+([0-9a-f-]{36})/i)?.[1] ?? null;
    if (!group) fail(`The update went out but I couldn't read its group id, so --live couldn't send the same one:\n${u.out.slice(-800)}`);
    console.log(`  ✓ preview · ${u.out.match(/Runtime version\s+(\S+)/)?.[1] ?? ''} · group ${group}`);
  }

  // ─── 6. what --live will send, and the backlog ─────────────────────────────
  const version = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo.version;
  const tag = build ? `android-${store ? 'production' : 'test'}-${version}-${Date.now().toString(36)}` : '';
  // a test release on top of one not approved yet: --live sends the newest app update, which has both
  const prev = existsSync(TESTING) ? JSON.parse(readFileSync(TESTING, 'utf8')) : null;
  const waiting = prev && !prev.live_at ? prev : null;
  mkdirSync(join(ROOT, 'scripts', 'release'), { recursive: true });
  writeFileSync(
    TESTING,
    JSON.stringify(
      { message: waiting ? `${waiting.message}; ${message}` : message, group: group ?? waiting?.group ?? null, at: new Date().toISOString(), commit: git('rev-parse', 'HEAD') },
      null,
      2,
    ) + '\n',
  );
  const parts = [toDeploy.length && `server: ${toDeploy.join(', ')}`, appChanged && `Muntej Test update ${version}`, build && `new build ${tag}`].filter(Boolean);
  logDone(`- ${today} · In testing: ${message}${parts.length ? ` (${parts.join(' · ')})` : ''}`, `Backlog: in testing ${message}`);

  // ─── 7. GitHub (+ build) ────────────────────────────────────────────────────
  say('GitHub');
  if (run('git', ['push', '-q', 'origin', 'HEAD']).code !== 0) fail('Push to GitHub failed');
  if (build) {
    git('tag', tag);
    if (run('git', ['push', '-q', 'origin', tag]).code !== 0) fail('Starting the GitHub build failed');
    console.log(`  ✓ build started (${tag}): https://github.com/sameerhosni/Muntej-mobile-app-assisstant/actions`);
  }

  // ─── 8. done ────────────────────────────────────────────────────────────────
  git('tag', '-f', 'testing');
  run('git', ['push', '-q', '-f', 'origin', 'testing']);
  console.log(
    `\n✔ In testing: ${message}\n  server: ${toDeploy.length ? toDeploy.join(', ') : 'no change'} · Muntej Test: ${appChanged ? 'updated' : 'no change'}${build ? ' · build started' : ''}\n  When it's approved: npm run ship -- --live`,
  );
}
