// SP_E2E=1 CHROME_PATH=<system Chrome> node --test test/ui/mobile-layout.e2e.test.js
// Without optional local assets, use system fonts and the engine's placeholders; this verifies layout, not art loading.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const DEVICES = [[568, 320], [640, 360], [756, 366], [844, 390], [915, 412], [1024, 768], [1180, 820], [1366, 1024]];
const PHASES = ['PREP', 'COMBAT', 'INFO_CHECK', 'BAND_DRAFT', 'SP_DRAFT', 'RESULT'];
const HAS_ASSETS = existsSync(path.join(ROOT, 'public/assets/spine'));

describe('landscape phone and tablet layout', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH' }, () => {
  let srv, browser, base;
  before(async () => {
    const { startServer } = await import('../helpers/server.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  async function open(width, height) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: width > height });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (!HAS_ASSETS || !existsSync(path.join(ROOT, 'public/fonts/fonts.css'))) {
      await page.setRequestInterception(true);
      page.on('request', r => {
        const url = new URL(r.url()).pathname;
        if (url === '/fonts/fonts.css' && !existsSync(path.join(ROOT, 'public/fonts/fonts.css'))) {
          return r.respond({ status: 200, contentType: 'text/css', body: '/* system fonts */' });
        }
        // Without downloaded art, exercise the renderer's built-in placeholders instead of missing Spine atlases.
        if (url === '/data/assets.json' && !HAS_ASSETS) return r.respond({ status: 200, contentType: 'application/json', body: '{}' });
        return r.continue();
      });
    }
    await page.evaluateOnNewDocument(() => localStorage.setItem('sp.pref.settings', JSON.stringify({ muted: true })));
    return { page, errors };
  }

  async function loaded(page, url, selector) {
    await page.goto(base + url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(selector, { visible: true });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }

  async function clipped(page, extra = []) {
    return page.evaluate(selectors => {
      const issues = [];
      const w = visualViewport.width, h = visualViewport.height;
      const explicit = new Set(selectors.flatMap(s => [...document.querySelectorAll(s)]));
      const els = new Set([...document.querySelectorAll('button, input'), ...explicit]);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || el.closest('.mockbar')) continue;
        let skip = false;
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          const css = getComputedStyle(p);
          if (css.visibility === 'hidden' || css.display === 'none' || Number(css.opacity) < .05
            || !explicit.has(el) && p !== el && /(auto|scroll)/.test(css.overflowX + css.overflowY)) { skip = true; break; }
        }
        if (!skip && (r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1)) issues.push(`${el.className}: ${[r.left, r.top, r.right, r.bottom].map(Math.round)}`);
      }
      return issues;
    }, extra);
  }

  for (const [w, h] of DEVICES) {
    test(`${w}×${h}: title, all match phases and settings fit`, { timeout: 90000 }, async () => {
      const { page, errors } = await open(w, h);
      try {
        await loaded(page, '/', '.title-main');
        assert.equal(await page.$eval('.rotate-hint', el => getComputedStyle(el).display), 'none');
        assert.deepEqual(await clipped(page, ['.emblem', '.title-login']), [], 'title');
        await page.screenshot({ path: path.join(OUT, `mobile-${w}x${h}-title.png`) });
        for (const phase of PHASES) {
          await loaded(page, `/dev/game-mock.html?shot=1&render=engine&phase=${phase}${phase === 'SP_DRAFT' ? '&variant=bounty' : ''}`, '.screen:not(.gload)');
          assert.deepEqual(await clipped(page), [], phase);
          if (phase === 'RESULT') {
            const back = await page.$eval('.result__foot .btn', el => {
              el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
              const r = el.getBoundingClientRect();
              return { top: r.top, bottom: r.bottom, h: visualViewport.height };
            });
            assert.ok(back.top >= 0 && back.bottom <= back.h + 1, `结算返回按钮可见 ${JSON.stringify(back)}`);
            if (w === 568) await page.screenshot({ path: path.join(OUT, 'mobile-568x320-result.png') });
          }
          if (phase === 'PREP' || phase === 'COMBAT') {
            await page.waitForFunction(() => globalThis.__SP_VIEW__?.kind === 'engine');
            const size = await page.$eval('.gm__field canvas', el => ({ w: el.clientWidth, h: el.clientHeight }));
            assert.deepEqual(size, { w, h }, 'canvas fills the visible area');
          }
          if (phase === 'PREP') {
            const outside = await page.evaluate(() => {
              const tiles = [...Array.from({ length: 10 }, (_, c) => [7, c]), ...[4, 5, 6, 7, 8].map(c => [8, c]), ...[4, 5, 6, 7, 8, 9, 10].map(c => [12, c])];
              return tiles.filter(([r, c]) => globalThis.__SP_VIEW__.tileScreen(r, c).poly.some(([x, y]) => x < 0 || y < 0 || x > visualViewport.width || y > visualViewport.height));
            });
            assert.deepEqual(outside, [], 'bench, overflow bench and playable back row remain in view');
            await page.screenshot({ path: path.join(OUT, `mobile-${w}x${h}-prep.png`) });
            const funds = await page.evaluate(() => globalThis.__MOCK__.S().priv.funds);
            await page.tap('.shopbar__cards .scard:not(.scard--sold):not(.is-disabled)');
            assert.ok(await page.$('.scard.is-armed'), 'touch selects the intended card');
            await page.tap('.scard.is-armed');
            await page.waitForFunction(before => globalThis.__MOCK__.S().priv.funds < before, { timeout: 3000 }, funds);
          }
        }
        await loaded(page, '/dev/game-mock.html?shot=1&render=engine&phase=PREP&variant=settings', '.modal__box');
        assert.deepEqual(await clipped(page, ['.modal__box']), [], 'settings');
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  }

  test('browser bars and safe areas resize the canvas and keep the controls inside the visible area', async () => {
    const { page, errors } = await open(844, 390);
    try {
      await loaded(page, '/dev/game-mock.html?shot=1&render=engine&phase=PREP', '.gm');
      await page.waitForFunction(() => globalThis.__SP_VIEW__?.kind === 'engine');
      await page.evaluate(() => {
        Object.defineProperty(visualViewport, 'height', { configurable: true, value: 310 });
        document.documentElement.style.setProperty('--sa-l', '44px');
        document.documentElement.style.setProperty('--sa-r', '12px');
        document.documentElement.style.setProperty('--sa-b', '21px');
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => document.querySelector('.gm__field canvas')?.clientHeight === 310);
      assert.deepEqual(await clipped(page), []);
      await page.screenshot({ path: path.join(OUT, 'mobile-browser-bars-safe-area.png') });
      await page.evaluate(() => {
        delete visualViewport.height;
        for (const key of ['--sa-l', '--sa-r', '--sa-b']) document.documentElement.style.removeProperty(key);
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => document.querySelector('.gm__field canvas')?.clientHeight === 390);
      assert.deepEqual(await clipped(page), []);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });

  test('phone and large tablet portrait show the rotation hint; landscape resumes the page', async () => {
    for (const [w, h] of [[390, 844], [1024, 1366], [1200, 1600]]) {
      const { page } = await open(w, h);
      try {
        await loaded(page, '/', '.title-main');
        assert.equal(await page.$eval('.rotate-hint', el => getComputedStyle(el).display), 'grid');
        await page.setViewport({ width: h, height: w, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: true });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.rotate-hint')).display === 'none');
        assert.deepEqual(await clipped(page, ['.emblem', '.title-login']), []);
      } finally { await page.close(); }
    }
  });
});
