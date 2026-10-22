import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startServer } from '../helpers/server.js';
import { CHROME, hasChrome, OUT } from '../e2e/client.mjs';

test('browser login, refresh, room links and live server restart', {
  skip: process.env.ACCESS_E2E !== '1' || !hasChrome(), timeout: 60000,
}, async (t) => {
  let srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, access: { username: 'host', password: 'first-password' } });
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-first-run'], protocolTimeout: 30000 });
  t.after(async () => { await browser.close(); await srv.close(); });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(srv.url + '/?room=ABCD', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#access-form');
  assert.equal(new URL(page.url()).searchParams.get('next'), '/?room=ABCD');
  assert.equal(await page.evaluate(() => !!globalThis.__SP__), false);
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: OUT + '/access-desktop.png' });
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: OUT + '/access-mobile.png' });

  await page.type('#username', 'host');
  await page.type('#password', 'wrong');
  await page.click('button');
  await page.waitForFunction(() => document.getElementById('access-error').textContent === '账号或密码不正确');
  assert.equal(await page.evaluate(() => !!globalThis.__SP__), false);
  await page.$eval('#password', (el) => { el.value = ''; });
  await page.type('#password', 'first-password');
  await page.setViewport({ width: 1280, height: 800 });
  await page.click('button');
  await page.waitForFunction(() => !!globalThis.__SP__);
  assert.equal(new URL(page.url()).search, '?room=ABCD');
  assert.equal(await page.evaluate(() => document.cookie.includes('sp.access')), false);
  const cookies = await browser.cookies();
  assert.equal(cookies.find((c) => c.name === 'sp.access').httpOnly, true);
  const guest = await browser.createBrowserContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(srv.url);
  await guestPage.waitForSelector('#access-form');
  await guest.close();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!globalThis.__SP__);
  assert.equal(await page.$('#access-form'), null);

  const port = srv.port;
  await srv.close();
  srv = await startServer({ port, host: '127.0.0.1', quiet: true, access: { username: 'host', password: 'second-password' } });
  await page.waitForSelector('#access-form', { timeout: 20000 });
  assert.equal(new URL(page.url()).searchParams.get('next'), '/?room=ABCD');
  await page.type('#username', 'host');
  await page.type('#password', 'second-password');
  await page.click('button');
  await page.waitForFunction(() => !!globalThis.__SP__);
  assert.equal(new URL(page.url()).search, '?room=ABCD');
  assert.deepEqual(errors, []);
  await srv.close();
  srv = await startServer({ port, host: '127.0.0.1', quiet: true, access: { username: '', password: '' } });
  await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!globalThis.__SP__);
  assert.equal(await page.$('#access-form'), null);
});
