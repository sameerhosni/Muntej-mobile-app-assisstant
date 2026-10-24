// Builds the design documents for the super admin (Settings → System design):
//   docs/design/out/Muntej-System-Design.pdf   cover + full design image + HLD + LLD (every Mermaid diagram drawn)
//   docs/design/out/Muntej-API-Integration.pdf how to integrate (docs/api/README.md) + the full OpenAPI contract
//   docs/design/out/Muntej-Architecture.png    the whole system on one image (docs/design/architecture.mmd)
// Pages are rendered by Edge / Chrome headless (marked + mermaid from cdnjs / jsDelivr), no npm dependencies.
//   node scripts/build-design-docs.js
// Then: node scripts/upload-design-docs.js (private Storage bucket "docs", super admins only).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'docs', 'design', 'out');
fs.mkdirSync(out, { recursive: true });

const browser = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
if (!browser) throw new Error('Needs Microsoft Edge or Google Chrome');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');

const STYLE = `
  @page { size: A4; margin: 16mm 14mm; }
  :root { --ink: #0B1A33; --soft: #4A5875; --line: #DCE4F2; --brand: #2F6BFF; --purple: #6D4AFF; --bg: #F4F7FC; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Tajawal', Arial, sans-serif; color: var(--ink); font-size: 11pt; line-height: 1.5; margin: 0; }
  h1 { font-size: 22pt; color: var(--brand); border-bottom: 3px solid var(--brand); padding-bottom: 4px; page-break-before: always; }
  h1:first-of-type { page-break-before: avoid; }
  h2 { font-size: 15pt; color: var(--purple); margin-top: 20px; }
  h3 { font-size: 12.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9.5pt; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 5px 7px; text-align: start; vertical-align: top; }
  th { background: var(--bg); }
  code { background: var(--bg); padding: 1px 4px; border-radius: 4px; font-size: 9pt; }
  pre { background: #0B1A33; color: #E8EEFA; padding: 10px; border-radius: 8px; font-size: 8.5pt; white-space: pre-wrap; word-break: break-word; }
  pre code { background: none; color: inherit; }
  blockquote { border-inline-start: 4px solid var(--purple); background: #F3EFFF; margin: 8px 0; padding: 6px 12px; }
  .mermaid { text-align: center; margin: 12px 0; page-break-inside: avoid; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
  .cover .logo { font-size: 46pt; font-weight: 800; color: var(--brand); }
  .cover .t { font-size: 22pt; font-weight: 700; margin-top: 8px; }
  .cover .s { color: var(--soft); margin-top: 6px; }
  .cover .ar { direction: rtl; font-size: 14pt; margin-top: 18px; color: var(--purple); }
  .full img { width: 100%; }
`;

function page({ title, titleAr, subtitle, parts, extraImage }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${STYLE}</style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script></head><body>
  <div class="cover"><div class="logo">Muntej · منتج</div><div class="t">${title}</div><div class="s">${subtitle} · ${today}</div>
  <div class="ar">${titleAr}</div></div>
  ${extraImage ? `<h1>The full design</h1><div class="full"><img src="${extraImage}"></div>` : ''}
  <div id="doc"></div>
  ${parts.map((p, i) => `<script type="text/markdown" id="md${i}">${esc(p)}</script>`).join('\n')}
  <script>
    const doc = document.getElementById('doc');
    let html = '';
    document.querySelectorAll('script[type="text/markdown"]').forEach((s) => (html += marked.parse(s.textContent)));
    doc.innerHTML = html;
    doc.querySelectorAll('pre code.language-mermaid').forEach((c) => {
      const d = document.createElement('div');
      d.className = 'mermaid';
      d.textContent = c.textContent;
      c.parentElement.replaceWith(d);
    });
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { useMaxWidth: true }, sequence: { useMaxWidth: true } });
    mermaid.run().then(() => (document.title += ' ✓'));
  </script></body></html>`;
}

function imagePage(mmd) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:'Segoe UI',Arial}
  .h{font:800 34px 'Segoe UI';color:#2F6BFF;padding:22px 30px 0}.s{color:#4A5875;padding:2px 30px 0;font-size:16px}
  .mermaid{padding:10px 20px}</style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script></head><body>
  <div class="h">Muntej · منتج — System design</div><div class="s">Expo app · Supabase · Edge Functions · OpenAI · connectors · public API · ${today}</div>
  <div class="mermaid">${mmd.replace(/</g, '&lt;')}</div>
  <script>mermaid.initialize({ startOnLoad: false, theme: 'default', flowchart: { useMaxWidth: false, htmlLabels: true } });
  document.querySelector('.mermaid').innerHTML = document.querySelector('.mermaid').textContent; mermaid.run();</script></body></html>`;
}

function run(args) {
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=25000', ...args], {
    stdio: 'ignore',
    timeout: 120_000,
  });
}

// 1) the full design image: the hand-laid page docs/design/architecture.html (layer by layer), at 2x
const imgUrl = `file:///${path.join(root, 'docs', 'design', 'architecture.html').replace(/\\/g, '/')}`;
const png = path.join(out, 'Muntej-Architecture.png');
run([`--screenshot=${png}`, '--window-size=1600,1000', '--hide-scrollbars', '--force-device-scale-factor=2', imgUrl]);

// 2) system design PDF (with the image inside)
const designHtml = path.join(out, 'system-design.html');
fs.writeFileSync(
  designHtml,
  page({
    title: 'System Design (HLD + LLD)',
    titleAr: 'تصميم النظام: المستوى العالي والتفصيلي',
    subtitle: 'High-level and low-level design',
    parts: [read('docs/design/HLD.md'), read('docs/design/LLD.md')],
    extraImage: 'Muntej-Architecture.png',
  }),
);
run([`--print-to-pdf=${path.join(out, 'Muntej-System-Design.pdf')}`, `file:///${designHtml.replace(/\\/g, '/')}`]);

// 3) API integration PDF (guide + full contract)
const apiHtml = path.join(out, 'api.html');
fs.writeFileSync(
  apiHtml,
  page({
    title: 'Integration API v1',
    titleAr: 'كيف تربط أنظمتك مع منتج',
    subtitle: 'How to integrate with Muntej: keys, endpoints, webhooks',
    parts: [read('docs/api/README.md'), '# Full contract (OpenAPI 3.1)\n\n```yaml\n' + read('docs/api/openapi.yaml') + '\n```\n'],
  }),
);
run([`--print-to-pdf=${path.join(out, 'Muntej-API-Integration.pdf')}`, `file:///${apiHtml.replace(/\\/g, '/')}`]);

for (const f of ['Muntej-Architecture.png', 'Muntej-System-Design.pdf', 'Muntej-API-Integration.pdf']) {
  const s = fs.statSync(path.join(out, f));
  console.log(`${f}  ${Math.round(s.size / 1024)} KB`);
}
