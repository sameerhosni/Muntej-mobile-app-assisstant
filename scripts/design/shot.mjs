// A phone-width picture of an HTML example, so the owner can choose a UI change from his phone before it's built
// (owner, 8 Nov: "if I asked for any UI updates show me example so I can decide before proceeding").
//   node scripts/design/shot.mjs design/examples/<name>.html   →  design/examples/<name>.png
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const file = resolve(process.argv[2] ?? '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(file).href);
await page.screenshot({ path: file.replace(/\.html$/, '.png'), fullPage: true });
await browser.close();
console.log(file.replace(/\.html$/, '.png'));
