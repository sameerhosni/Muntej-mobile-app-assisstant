// Wording rewrites must change words only: for every changed strings file (vs git HEAD), the same keys must exist and
// each key must keep the same {{placeholders}}. Prints problems and exits 1 if any.
//   node scripts/check-strings.js            (all changed *.ts / *.tsx under src and supabase/functions)
const { execSync } = require('child_process');
const fs = require('fs');

const changed = execSync('git diff --name-only HEAD -- src supabase/functions', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && fs.existsSync(f));

/** key → placeholders, for every `key: '...'` / "..." / `...` line (one entry per key per language block) */
function entries(text) {
  const out = [];
  const re = /^\s*([A-Za-z_][\w]*)\s*:\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2\s*,?\s*$/gm;
  let m;
  while ((m = re.exec(text))) out.push({ key: m[1], ph: [...m[3].matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((x) => x[1]).sort().join(',') });
  return out;
}
const bag = (list) => {
  const m = new Map();
  for (const e of list) m.set(`${e.key}|${e.ph}`, (m.get(`${e.key}|${e.ph}`) ?? 0) + 1);
  return m;
};

let problems = 0;
for (const f of changed) {
  let before = '';
  try {
    before = execSync(`git show HEAD:${f}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    continue; // new file
  }
  const a = bag(entries(before));
  const b = bag(entries(fs.readFileSync(f, 'utf8')));
  for (const [k, n] of a) {
    if ((b.get(k) ?? 0) < n) {
      const [key, ph] = k.split('|');
      console.log(`${f}: "${key}" lost or changed its placeholders {${ph}}`);
      problems++;
    }
  }
}
console.log(problems ? `${problems} problem(s)` : `ok: ${changed.length} file(s) keep their keys and placeholders`);
process.exit(problems ? 1 : 0);
