import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import P from 'puppeteer-core';
import { startServer } from '../helpers/server.js';
import { TestClient } from '../helpers/wsClient.js';
import { Client, hasChrome, CHROME, OUT } from '../e2e/client.mjs';

const access = { username: 'player', password: 'player-secret', admin: { username: 'manager', password: 'admin-secret' } };
async function fill(page, selector, value) {
  const keyboard = page.page().keyboard;
  await page.click(selector);
  await keyboard.down('Control');
  await keyboard.press('KeyA');
  await keyboard.up('Control');
  await keyboard.press('Backspace');
  await page.type(selector, String(value));
}
async function save(page, balance, earned, reason) {
  await page.click('[data-wallet-mode="set"]');
  await fill(page, '#balance', balance); await fill(page, '#earned', earned); await fill(page, '#reason', reason);
  await page.click('#save-wallet');
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('奖杯修改已保存'));
}

async function grant(page, amount, countEarned, reason) {
  await page.click('[data-wallet-mode="grant"]');
  await fill(page, '#grant-amount', amount); await fill(page, '#reason', reason);
  if ((await page.$eval('#grant-earned', el => el.checked)) !== countEarned) await page.click('#grant-earned');
  await page.click('#save-wallet');
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('奖杯修改已保存'));
}

async function search(page, text) {
  await fill(page, '#account-search', text); await page.click('#accounts-form button');
  await page.waitForFunction(() => document.querySelectorAll('#accounts .account').length === 1);
}

async function openAdmin(c, selector = '[data-testid="admin-open"]') {
  await c.click(selector);
  const handle = await c.page.waitForSelector('#admin-frame');
  const frame = await handle.contentFrame();
  await frame.waitForSelector('#wallet-form:not([hidden])');
  return frame;
}

test('管理员真实浏览器：游戏内名册、历史昵称搜索、在线及离线发放、复制 ID、关闭管理保留原对局', {
  skip: process.env.SP_E2E !== '1' || !hasChrome(), timeout: 120000,
}, async t => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, access });
  const response = await fetch(srv.url + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(access) });
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const host = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`, { wsOptions: { headers: { Cookie: cookie } } });
  const hostWelcome = await host.hello('常用旧昵称');
  await host.hello('被观战博士', hostWelcome.token);
  await host.request({ t: 'room.create', mode: 'solo', difficulty: 'HARD' });
  await host.request({ t: 'room.start' });
  const room = srv.lobby.roomOf(srv.registry.byId(hostWelcome.playerId));
  const c = new Client(P, srv.url, '管理博士', { prefix: 'admin' });
  t.after(async () => { await c.close(); await host.close(); await srv.close(); });
  c.browser = await P.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], protocolTimeout: 90000 });
  await c.browser.defaultBrowserContext().overridePermissions(srv.url, ['clipboard-read', 'clipboard-write']);
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
  const tabs = (await c.browser.pages()).length;
  let panel = await openAdmin(c);
  assert.equal((await c.browser.pages()).length, tabs, '账号管理不得打开新的窗口或标签页');
  assert.equal(new URL(c.page.url()).pathname, '/');
  await save(panel, 50, 100, '管理员自身调整');
  assert.equal(srv.lobby.profiles.store.wallet(own.profileId).balance, 50);
  await c.page.waitForFunction(async () => (await import('/js/ui/profile.js')).profileStore.get().profile.balance === 50, { polling: 100 });
  assert.equal(srv.lobby.profiles.store.wallet(own.profileId).lifetimeEarned, 100);

  await search(panel, '常用旧昵称');
  assert.match(await panel.$eval('#accounts', el => el.textContent), /被观战博士/);
  await panel.click('#accounts .account');
  await panel.waitForFunction(id => document.getElementById('wallet-id').textContent.includes(id), {}, host.profile.profileId);
  await save(panel, 44, 55, '指定玩家奖励');
  assert.equal(srv.lobby.profiles.store.wallet(host.profile.profileId).balance, 44);
  assert.match(await panel.$eval('#ledger', el => el.textContent), /指定玩家奖励/);
  await grant(panel, 6, true, '按曾用名选择后发放');
  assert.equal((await host.waitFor('profile.wallet', msg => msg.profile.balance === 50)).profile.lifetimeEarned, 61);
  await grant(panel, 5, false, '只增加可用奖杯');
  assert.equal(srv.lobby.profiles.store.wallet(host.profile.profileId).balance, 55);
  assert.equal(srv.lobby.profiles.store.wallet(host.profile.profileId).lifetimeEarned, 61);
  await panel.click('#copy-profile');
  await panel.waitForFunction(() => document.getElementById('notice').textContent === '档案 ID 已复制。');
  assert.equal(await panel.evaluate(() => navigator.clipboard.readText()), host.profile.profileId);
  assert.equal(await panel.$eval('#wallet-id', el => getComputedStyle(el).userSelect), 'text');
  await panel.click('#self-profile');
  await panel.waitForFunction(id => document.getElementById('wallet-id').textContent.includes(id), {}, own.profileId);
  await mkdir(OUT, { recursive: true });
  await panel.evaluate(() => window.scrollTo(0, 0));
  await c.page.screenshot({ path: OUT + '/directory-desktop.png' });
  await c.page.setViewport({ width: 1024, height: 768 });
  assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await c.page.screenshot({ path: OUT + '/directory-tablet.png' });
  await c.page.setViewport({ width: 1920, height: 1080 });
  await c.click('[data-testid="admin-close"]');
  await c.page.waitForFunction(() => !document.querySelector('#admin-frame'));
  assert.equal(await c.page.evaluate(() => __SP__.store.get().me.playerId), mainId);
  await c.click('[data-testid="trophy-shop-open"]');
  await c.click('[data-testid="profile-copy"]');
  await c.page.waitForFunction(() => document.body.textContent.includes('档案 ID 已复制'));
  assert.equal(await c.page.evaluate(() => navigator.clipboard.readText()), own.profileId);
  assert.equal(await c.page.$eval('[data-testid="profile-id"]', el => getComputedStyle(el).userSelect), 'text');
  await c.click('.tshop-close');

  // The administrator continues their own game while the panel and watch tab stay independent.
  await c.page.bringToFront();
  await c.click('.mode-card', '独立模拟');
  await c.click('.create-box button');
  await c.page.waitForSelector('.room-screen');
  await c.click('.room-screen button', '开始模拟');
  await c.page.waitForFunction(() => __SP__.store.get().room?.inMatch === true);
  const ownCode = await c.page.evaluate(() => __SP__.store.get().room.code);
  panel = await openAdmin(c, '.brief__foot [data-testid="admin-open"]');
  await panel.click('#refresh-matches');
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
  await c.page.bringToFront();
  const disconnected = new Promise(resolve => srv.registry.byId(hostWelcome.playerId).ws.once('close', resolve));
  await host.close(); await disconnected;
  await search(panel, '常用旧昵称');
  await panel.waitForFunction(() => document.querySelector('#accounts .account')?.textContent.includes('离线'));
  await panel.click('#accounts .account');
  await panel.waitForFunction(id => document.getElementById('wallet-id').textContent === id, {}, host.profile.profileId);
  await grant(panel, 9, true, '离线账号发放');
  assert.equal(srv.lobby.profiles.store.wallet(host.profile.profileId).balance, 64);
  assert.equal(srv.lobby.profiles.store.wallet(host.profile.profileId).lifetimeEarned, 70);
  await panel.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await c.page.waitForFunction(() => !document.querySelector('#admin-frame'));
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
  assert.equal(await ordinaryPage.evaluate(async () => (await fetch('/api/admin/profiles')).status), 403);
  await ordinary.close();
  assert.deepEqual(errors, []);
});
