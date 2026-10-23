import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import P from 'puppeteer-core';
import { startServer } from '../helpers/server.js';
import { TestClient } from '../helpers/wsClient.js';
import { Client, hasChrome, CHROME, OUT } from '../e2e/client.mjs';

const access = { username: 'player', password: 'player-secret', admin: { username: 'manager', password: 'admin-secret' } };
async function fill(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, String(value));
}
async function save(page, balance, earned, reason) {
  await fill(page, '#balance', balance); await fill(page, '#earned', earned); await fill(page, '#reason', reason);
  await page.click('#save-wallet');
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('奖杯修改已保存'));
}

test('管理员真实浏览器：正常游玩、独立管理窗口、自己和指定档案修改、对局列表及单人局独立观战', {
  skip: process.env.SP_E2E !== '1' || !hasChrome(), timeout: 120000,
}, async t => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, access });
  const response = await fetch(srv.url + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(access) });
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const host = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`, { wsOptions: { headers: { Cookie: cookie } } });
  const hostWelcome = await host.hello('被观战博士');
  await host.request({ t: 'room.create', mode: 'solo', difficulty: 'HARD' });
  await host.request({ t: 'room.start' });
  const room = srv.lobby.roomOf(srv.registry.byId(hostWelcome.playerId));
  const c = new Client(P, srv.url, '管理博士', { prefix: 'admin' });
  t.after(async () => { await c.close(); await host.close(); await srv.close(); });
  c.browser = await P.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], protocolTimeout: 90000 });
  c.page = await c.browser.newPage();
  await c.page.setViewport({ width: 1920, height: 1080 });
  await c.page.goto(srv.url, { waitUntil: 'domcontentloaded' });
  const errors = [];
  c.page.on('pageerror', error => errors.push(error.message));
  await c.page.waitForSelector('#access-form');
  await c.page.type('#username', access.admin.username);
  await c.page.type('#password', access.admin.password);
  await c.page.click('#access-form button');
  await c.page.waitForFunction(() => !!globalThis.__SP__);
  await c.enter('管理博士');
  await c.page.waitForFunction(async () => (await import('/js/ui/profile.js')).profileStore.get().status === 'ready');
  const own = await c.page.evaluate(async () => (await import('/js/ui/profile.js')).profileStore.get().profile);
  assert.equal(await c.page.evaluate(() => __SP__.store.get().me.isAdmin), true);
  const mainId = await c.page.evaluate(() => __SP__.store.get().me.playerId);
  const panelTarget = c.browser.waitForTarget(target => target.url().includes('/admin.html'));
  await c.click('[data-testid="admin-open"]');
  const panel = await (await panelTarget).page();
  panel.on('pageerror', error => errors.push(error.message));
  await panel.setViewport({ width: 1180, height: 820 });
  await panel.waitForSelector('#wallet-form:not([hidden])');
  assert.equal(await panel.evaluate(() => window.opener === null), true);
  await save(panel, 50, 100, '管理员自身调整');
  await c.page.waitForFunction(async () => (await import('/js/ui/profile.js')).profileStore.get().profile.balance === 50, { polling: 100 });
  assert.equal(srv.lobby.profiles.store.wallet(own.profileId).lifetimeEarned, 100);

  await panel.waitForSelector('button.player');
  const players = await panel.$$('button.player');
  for (const player of players) {
    if ((await player.evaluate(el => el.textContent)).includes(host.profile.profileId)) { await player.click(); break; }
  }
  await panel.waitForFunction(id => document.getElementById('wallet-id').textContent.includes(id), {}, host.profile.profileId);
  await save(panel, 44, 55, '指定玩家奖励');
  assert.equal(srv.lobby.profiles.store.wallet(host.profile.profileId).balance, 44);
  assert.match(await panel.$eval('#ledger', el => el.textContent), /指定玩家奖励/);
  await panel.click('#self-profile');
  await panel.waitForFunction(id => document.getElementById('wallet-id').textContent.includes(id), {}, own.profileId);
  await mkdir(OUT, { recursive: true });
  await panel.screenshot({ path: OUT + '/admin-desktop.png' });
  await panel.setViewport({ width: 390, height: 844 });
  assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await panel.screenshot({ path: OUT + '/admin-mobile.png' });
  await panel.setViewport({ width: 1180, height: 820 });

  // The administrator continues their own game while the panel and watch tab stay independent.
  await c.page.bringToFront();
  await c.click('.mode-card', '独立模拟');
  await c.click('.create-box button');
  await c.page.waitForFunction(() => __SP__.store.get().room?.inMatch === true);
  const ownCode = await c.page.evaluate(() => __SP__.store.get().room.code);
  await panel.bringToFront(); await panel.click('#refresh-matches');
  await panel.waitForFunction(() => document.querySelectorAll('.match').length === 2);
  const watchTarget = c.browser.waitForTarget(target => target.url().includes('watch='));
  await panel.click(`a.watch-link[data-code="${room.code}"]`);
  const watch = await (await watchTarget).page();
  watch.on('pageerror', error => errors.push(error.message));
  await watch.setViewport({ width: 1920, height: 1080 });
  await watch.waitForFunction(code => globalThis.__SP__?.store.get().room?.code === code
    && globalThis.__SP__.store.get().match.public?.phase === 'INFO_CHECK', { timeout: 30000 }, room.code);
  const watching = await watch.evaluate(() => {
    const state = __SP__.store.get();
    return { playerId: state.me.playerId, private: state.match.private, isAdmin: state.me.isAdmin, opener: window.opener === null,
      spectator: state.room.spectators.some(s => s.playerId === state.me.playerId) };
  });
  assert.notEqual(watching.playerId, mainId);
  assert.equal(watching.private, null);
  assert.equal(watching.spectator, true);
  assert.equal(watching.isAdmin, true);
  assert.equal(watching.opener, true);
  assert.equal(await c.page.evaluate(() => __SP__.store.get().room.code), ownCode);
  await watch.screenshot({ path: OUT + '/admin-watch.png' });
  await watch.close();
  assert.equal(await c.page.evaluate(() => __SP__.store.get().room.code), ownCode);

  const ordinary = await c.browser.createBrowserContext();
  const ordinaryPage = await ordinary.newPage();
  await ordinaryPage.setViewport({ width: 1920, height: 1080 });
  await ordinaryPage.goto(srv.url, { waitUntil: 'domcontentloaded' });
  await ordinaryPage.type('#username', access.username); await ordinaryPage.type('#password', access.password);
  await ordinaryPage.click('#access-form button');
  await ordinaryPage.waitForFunction(() => !!globalThis.__SP__);
  await ordinaryPage.type('.title-login input', '普通博士'); await ordinaryPage.click('.title-login button');
  await ordinaryPage.waitForSelector('.lobby-screen');
  assert.equal(await ordinaryPage.$('[data-testid="admin-open"]'), null);
  assert.equal(await ordinaryPage.evaluate(async () => (await fetch('/api/admin/matches')).status), 403);
  await ordinary.close();
  assert.deepEqual(errors, []);
});
