// Muntej release in one step (owner, 27 Oct: "a lot of updates… waste of time to do all these actions every time").
//   npm run ship -- "what changed"            QA → database → server → app update → GitHub
//   npm run ship -- "what changed" --build    … and a new installable app (only for phone-hardware / native changes)
// Stops at the first failure. Everything since the last release (git tag `shipped`) is what gets released:
//   1. the work must be committed (nothing half-done goes out)
//   2. QA robot (scripts/qa/run.mjs) must be all green
//   3. new supabase/migrations are applied (scripts/db-apply.ps1)
//   4. edge functions whose code changed are type-checked and deployed (a change in _shared deploys every function
//      that imports it)
//   5. app code changed → over-the-air update to preview + production
//   6. push to GitHub; --build also tags android-preview-<version>-<n>, which starts the GitHub build
//   7. moves the `shipped` tag here
// Needs: SUPABASE_ACCESS_TOKEN and EXPO_TOKEN (user env vars), GitHub sign-in already saved on this PC.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const REF = 'katwiedukkvssuxbjbqf';
const args = process.argv.slice(2);
const build = args.includes('--build');
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

// ─── 1. committed ─────────────────────────────────────────────────────────────
if (!message) fail('Say what changed: npm run ship -- "what changed"');
const dirty = git('status', '--porcelain', '--untracked-files=no');
if (dirty) fail(`Uncommitted changes:\n${dirty}`);
const EXPO_TOKEN = userEnv('EXPO_TOKEN');
if (!EXPO_TOKEN) fail('EXPO_TOKEN is not set (user env var)');
ENV.EXPO_TOKEN = EXPO_TOKEN;
ENV.SUPABASE_ACCESS_TOKEN = userEnv('SUPABASE_ACCESS_TOKEN');

const since = git('rev-parse', '--verify', '--quiet', 'shipped') || git('rev-list', '--max-parents=0', 'HEAD').split('\n')[0];
const changed = git('diff', '--name-only', since, 'HEAD').split('\n').filter(Boolean);
console.log(`Releasing ${changed.length} changed file(s) since ${since.slice(0, 7)}: ${message}`);

// ─── 2. QA ────────────────────────────────────────────────────────────────────
say('QA robot');
if (run('node', ['scripts/qa/run.mjs']).code !== 0) fail('QA failed, see qa-out/report.md');

// ─── 3. database ──────────────────────────────────────────────────────────────
if (changed.some((f) => f.startsWith('supabase/migrations/'))) {
  say('Database changes');
  if (run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/db-apply.ps1']).code !== 0) fail('Database changes failed');
}

// ─── 4. server functions ──────────────────────────────────────────────────────
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
    const d = run('npx', ['supabase', 'functions', 'deploy', fn, '--project-ref', REF, '--use-api'], { quiet: true });
    if (d.code !== 0 || !d.out.includes('Deployed Functions')) fail(`Deploying ${fn} failed:\n${d.out.slice(-800)}`);
    console.log(`  ✓ ${fn}`);
  }
}

// ─── 5. app update ────────────────────────────────────────────────────────────
const appChanged = changed.some((f) => /^(app|src|assets)\//.test(f) || ['app.json', 'app.config.js', 'package.json'].includes(f));
if (appChanged) {
  say('App update (preview + production)');
  for (const ch of ['preview', 'production']) {
    const u = run('npx', ['-y', 'eas-cli@latest', 'update', '--channel', ch, '--environment', ch, '--message', JSON.stringify(message), '--non-interactive'], {
      quiet: true,
    });
    if (u.code !== 0 && !/Update group ID/.test(u.out)) fail(`App update (${ch}) failed:\n${u.out.slice(-1200)}`);
    console.log(`  ✓ ${ch} · ${u.out.match(/Runtime version\s+(\S+)/)?.[1] ?? ''}`);
  }
}

// ─── 6. GitHub (+ build) ──────────────────────────────────────────────────────
say('GitHub');
if (run('git', ['push', '-q', 'origin', 'HEAD']).code !== 0) fail('Push to GitHub failed');
if (build) {
  const version = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo.version;
  const tag = `android-preview-${version}-${Date.now().toString(36)}`;
  git('tag', tag);
  if (run('git', ['push', '-q', 'origin', tag]).code !== 0) fail('Starting the GitHub build failed');
  console.log(`  ✓ build started (${tag}): https://github.com/sameerhosni/Muntej-mobile-app-assisstant/actions`);
}

// ─── 7. done ──────────────────────────────────────────────────────────────────
git('tag', '-f', 'shipped');
run('git', ['push', '-q', '-f', 'origin', 'shipped']);
console.log(
  `\n✔ Released: ${message}\n  server: ${toDeploy.length ? toDeploy.join(', ') : 'no change'} · app: ${appChanged ? 'updated' : 'no change'}${build ? ' · build started' : ''}`,
);
