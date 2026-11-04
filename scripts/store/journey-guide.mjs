// The App Review user journey, from the shots of scripts/store/journey.mjs:
//   node scripts/store/journey-guide.mjs
// → support-web/journey/*.jpg (smaller copies for support-web/journey.html) and store/journey/muntej-user-journey.pdf
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(import.meta.dirname, '..', '..');
const SHOTS = join(ROOT, 'store', 'journey');
const WEB = join(ROOT, 'support-web', 'journey');
mkdirSync(WEB, { recursive: true });

const browser = await chromium.launch();
try {
  const small = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  for (const f of readdirSync(SHOTS).filter((x) => x.endsWith('.png'))) {
    const src = `data:image/png;base64,${readFileSync(join(SHOTS, f)).toString('base64')}`;
    await small.setContent(`<body style="margin:0"><img src="${src}" style="width:430px;height:932px;display:block"></body>`, { waitUntil: 'load' });
    await small.screenshot({ path: join(WEB, f.replace('.png', '.jpg')), type: 'jpeg', quality: 85 });
  }
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(ROOT, 'support-web', 'journey.html')).href, { waitUntil: 'load' });
  await page.pdf({ path: join(SHOTS, 'muntej-user-journey.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('✓ journey images and PDF');
} finally {
  await browser.close();
}
