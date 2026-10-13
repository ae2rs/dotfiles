// Measure what reading the source cannot: horizontal page overflow and runtime errors,
// at phone and desktop widths, in both colour schemes. Needs Google Chrome and playwright-core:
//
//   d=$(mktemp -d) && cp <design-ui skill dir>/check.mjs "$d" && npm i --prefix "$d" --silent playwright-core
//   node "$d/check.mjs" <file.html | http://localhost:3000/route>
//
// Exits 1 when any run overflows or logs an error.
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const target = process.argv[2];
if (!target) {
  console.error('usage: node check.mjs <file.html | url>');
  process.exit(2);
}
const url = /^https?:\/\//.test(target) ? target : `file://${resolve(target)}`;

const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
for (const width of [375, 1280]) {
  for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    await page.goto(url, { waitUntil: 'networkidle' });

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      if (root.scrollWidth <= root.clientWidth) return null;
      const scrolls = (el) => /auto|scroll|hidden|clip/.test(getComputedStyle(el).overflowX);
      const inScroller = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (scrolls(p)) return true;
        return false;
      };
      const positioned = (el) => /absolute|fixed/.test(getComputedStyle(el).position);
      // Content inside a scroller cannot widen the page unless it is positioned out of it.
      const suspect = (el) => !inScroller(el) || positioned(el);
      const describe = (el) => {
        const notes = [`right ${Math.round(el.getBoundingClientRect().right)}px`];
        if (positioned(el)) notes.push(getComputedStyle(el).position);
        if (inScroller(el)) notes.push('inside a scroller');
        return `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} (${notes.join(', ')})`;
      };
      const wide = [...document.body.querySelectorAll('*')]
        .filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > root.clientWidth + 1)
        .sort((a, b) => suspect(b) - suspect(a) || b.getBoundingClientRect().right - a.getBoundingClientRect().right)
        .slice(0, 5)
        .map(describe);
      return { width: root.scrollWidth, wide };
    });

    const problems = [];
    if (overflow) problems.push(`page is ${overflow.width}px wide; past the edge: ${overflow.wide.join(', ')}`);
    if (errors.length) problems.push(`errors: ${errors.join(' | ')}`);
    console.log(`${width}px ${colorScheme}: ${problems.length ? problems.join('; ') : 'ok'}`);
    failed ||= problems.length > 0;
    await page.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
