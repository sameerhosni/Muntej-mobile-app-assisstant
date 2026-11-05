// Hindi for the app's strings. English stays the source: every screen's registerStrings('ns', { en, ar }) and en.ts are read
// from the code, and src/lib/i18n/hi.generated.ts holds the Hindi, so no screen file changes for a third language.
//   npm run i18n:hi            translate what's new or changed (the localize-text function, which caches)
//   npm run i18n:hi -- --check only say what's missing (run by QA, so no new screen ships without Hindi)
// scripts/i18n/hi.sources.json remembers which English each line came from, so a changed line is translated again.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'src', 'lib', 'i18n', 'hi.generated.ts');
const SOURCES = join(import.meta.dirname, 'hi.sources.json');
const REF = 'katwiedukkvssuxbjbqf';
const BATCH = 60;
const PARALLEL = 5;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const unwrap = (n) => {
  while (n && (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n))) n = n.expression;
  return n;
};

/** the file's top-level consts, by name */
function constsOf(sf) {
  const consts = new Map();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, unwrap(d.initializer));
  }
  return consts;
}

/** an object literal → { a: { b: 'text' } }; anything that isn't plain text is reported */
function read(node, consts, where, problems) {
  node = unwrap(node);
  if (ts.isIdentifier(node) && consts.has(node.text)) return read(consts.get(node.text), consts, where, problems);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isObjectLiteralExpression(node)) {
    const out = {};
    for (const p of node.properties) {
      if (ts.isSpreadAssignment(p)) {
        Object.assign(out, read(p.expression, consts, where, problems));
        continue;
      }
      const key = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name) || ts.isNumericLiteral(p.name)) ? p.name.text : null;
      if (key === null) {
        problems.push(`${where}: a key that isn't plain text`);
        continue;
      }
      const value = ts.isShorthandPropertyAssignment(p) ? p.name : p.initializer;
      if (!value) continue;
      const v = read(value, consts, `${where}.${key}`, problems);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  problems.push(`${where}: not plain text (${ts.SyntaxKind[node.kind]})`);
  return undefined;
}

/** every English string the app registers: { 's14.title': 'Back', 'common.appName': 'Muntej', … } */
export function englishStrings() {
  const tree = {};
  const problems = [];
  const coreFile = join(ROOT, 'src', 'lib', 'i18n', 'en.ts');
  const core = ts.createSourceFile(coreFile, readFileSync(coreFile, 'utf8'), ts.ScriptTarget.Latest, true);
  const coreConsts = constsOf(core);
  Object.assign(tree, read(coreConsts.get('en'), coreConsts, 'en.ts', problems));

  for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))]) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('registerStrings(') || file.endsWith('register.ts')) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const consts = constsOf(sf);
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'registerStrings') {
        const [nsArg, bundle] = n.arguments;
        const nsNode = unwrap(ts.isIdentifier(nsArg) ? (consts.get(nsArg.text) ?? nsArg) : nsArg);
        const b = unwrap(bundle);
        const name = file.slice(ROOT.length + 1);
        if (!ts.isStringLiteralLike(nsNode) || !ts.isObjectLiteralExpression(b)) {
          problems.push(`${name}: registerStrings with a name or bundle that can't be read`);
        } else {
          const enProp = b.properties.find((p) => p.name?.text === 'en');
          const value = enProp && (ts.isShorthandPropertyAssignment(enProp) ? enProp.name : enProp.initializer);
          if (!value) problems.push(`${name}: no en in registerStrings`);
          else {
            const got = read(value, consts, `${name} (${nsNode.text})`, problems);
            tree[nsNode.text] = deepMerge(tree[nsNode.text], got);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { flat: flatten(tree), problems };
}

function deepMerge(a, b) {
  if (!a || typeof a !== 'object' || typeof b !== 'object') return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
  return out;
}

function flatten(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = prefix ? `${prefix}\u0000${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

function nest(flat) {
  const tree = {};
  for (const key of Object.keys(flat).sort()) {
    const parts = key.split('\u0000');
    let at = tree;
    for (const p of parts.slice(0, -1)) at = at[p] ??= {};
    at[parts.at(-1)] = flat[key];
  }
  return tree;
}

const loadJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
const placeholders = (s) => [...s.matchAll(/\{\{\s*\w+\s*\}\}/g)].map((m) => m[0].replace(/\s/g, '')).sort().join();

function currentHindi() {
  if (!existsSync(OUT)) return {};
  const text = readFileSync(OUT, 'utf8');
  return flatten(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
}

/** what QA reports: lines with no Hindi, Hindi for older English, a lost {{placeholder}} */
export function hindiGaps() {
  const { flat, problems } = englishStrings();
  const hi = currentHindi();
  const from = loadJson(SOURCES);
  const missing = Object.keys(flat).filter((k) => hi[k] === undefined || from[k] !== flat[k]);
  const broken = Object.keys(flat).filter((k) => hi[k] !== undefined && from[k] === flat[k] && placeholders(hi[k]) !== placeholders(flat[k]));
  return { total: Object.keys(flat).length, missing, broken, problems };
}

function readable(key) {
  return key.split('\u0000').join('.');
}

async function main() {
  if (process.argv.includes('--check')) {
    const { total, missing, broken, problems } = hindiGaps();
    console.log(`${total} strings, ${missing.length} need Hindi, ${broken.length} lost a placeholder, ${problems.length} unreadable`);
    for (const k of [...missing.slice(0, 12), ...broken.slice(0, 12)]) console.log(`  ${readable(k)}`);
    for (const p of problems.slice(0, 30)) console.log(`  ${p}`);
    process.exit(missing.length || broken.length ? 1 : 0);
  }
  const { flat, problems } = englishStrings();
  for (const p of problems) console.log(`unreadable: ${p}`);
  const hi = currentHindi();
  const from = loadJson(SOURCES);
  const todo = Object.keys(flat).filter((k) => hi[k] === undefined || from[k] !== flat[k]);
  console.log(`${Object.keys(flat).length} strings, ${todo.length} to translate`);

  const token =
    process.env.SUPABASE_ACCESS_TOKEN ||
    spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"], { encoding: 'utf8' }).stdout.trim();
  const q = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "select decrypted_secret as s from vault.decrypted_secrets where name = 'cron_secret' limit 1" }),
  });
  const secret = (await q.json())[0]?.s;
  if (!secret) throw new Error('could not read the cron secret');

  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  const save = () => {
    const keep = Object.fromEntries(Object.keys(flat).filter((k) => hi[k] !== undefined).map((k) => [k, hi[k]]));
    writeFileSync(
      OUT,
      `// Generated by scripts/i18n/hi.mjs from the app's English strings (machine translated). Run: npm run i18n:hi\nexport default ${JSON.stringify(nest(keep), null, 1)};\n`,
    );
    writeFileSync(SOURCES, JSON.stringify(Object.fromEntries(Object.keys(keep).map((k) => [k, from[k]])), null, 0));
  };
  let done = 0;
  const work = async () => {
    for (;;) {
      const b = batches.shift();
      if (!b) return;
      const res = await fetch(`https://${REF}.supabase.co/functions/v1/localize-text`, {
        method: 'POST',
        headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: 'hi', texts: b.map((k) => flat[k]) }),
      });
      if (!res.ok) {
        console.log(`a batch failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
        continue;
      }
      const { texts, failed } = await res.json();
      const bad = new Set(failed ?? []);
      b.forEach((k, i) => {
        // the translator failed on this one: the next run tries again
        if (!bad.has(i)) {
          hi[k] = texts[i];
          from[k] = flat[k];
        }
      });
      done += b.length;
      console.log(`${done}/${todo.length}`);
      save();
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, work));
  save();
  const left = hindiGaps();
  console.log(`done: ${left.total} strings, ${left.missing.length} still need Hindi, ${left.broken.length} lost a placeholder`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
