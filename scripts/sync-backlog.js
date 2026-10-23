// Turns docs/BACKLOG.md into src/features/backlog/data.ts, so the super admin's Backlog screen (app/49-backlog.tsx)
// always shows the same list as the page. Runs before every publish (scripts/publish-update.ps1); run it by hand too:
//   node scripts/sync-backlog.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(root, 'docs', 'BACKLOG.md'), 'utf8').replace(/\r\n/g, '\n');
const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();

const updated = (md.match(/Last updated:\s*(.+)/) || [])[1]?.trim() ?? '';
const sections = [];
let current = null;
for (const line of md.split('\n')) {
  const h = line.match(/^##\s+(.+)/);
  if (h) {
    current = { title: clean(h[1]), items: [] };
    sections.push(current);
    continue;
  }
  if (!current || !line.startsWith('|')) continue;
  const cells = line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
  // skip the header row and the |---| row
  if (cells[0] === '#' || /^-+$/.test(cells[0].replace(/:/g, ''))) continue;
  const [id, title, ...rest] = cells.map(clean);
  if (!title) continue;
  current.items.push({ id, title, detail: rest.filter((x) => x && x !== '—').join(' · ') });
}

const out = `// GENERATED from docs/BACKLOG.md by scripts/sync-backlog.js — edit the page, not this file.
export type BacklogItem = { id: string; title: string; detail: string };
export type BacklogSection = { title: string; items: BacklogItem[] };
export const BACKLOG_UPDATED = ${JSON.stringify(updated)};
export const BACKLOG: BacklogSection[] = ${JSON.stringify(sections, null, 2)};
`;
const dir = path.join(root, 'src', 'features', 'backlog');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'data.ts'), out);
console.log(`backlog: ${sections.reduce((n, s) => n + s.items.length, 0)} items in ${sections.length} sections`);
