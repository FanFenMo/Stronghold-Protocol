import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';
import { startServer } from '../helpers/server.js';
import { ProfileStore } from '../../server/profiles.js';
import { Client, OUT, hasChrome, problemsOf } from '../e2e/client.mjs';

async function readyProfile(page) {
  await page.waitForFunction(async () => (await import('/js/ui/profile.js')).profileStore.get().status === 'ready');
  return page.evaluate(async () => (await import('/js/ui/profile.js')).profileStore.get().profile);
}

async function readablePage(page) {
  const layout = await page.evaluate(() => {
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const body = getComputedStyle(document.body);
    const label = document.querySelector('.micro');
    return { root, body: parseFloat(body.fontSize), margin: body.margin,
      label: label ? parseFloat(getComputedStyle(label).fontSize) : null,
      overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1 };
  });
  assert.equal(layout.margin, '0px', '基础样式必须清除浏览器默认页边距');
  assert.ok(layout.body < layout.root * .4, `正文不能继承布局根字号：${JSON.stringify(layout)}`);
  assert.ok(layout.label === null || layout.label < layout.body, '装饰英文标签应小于正文');
  assert.equal(layout.overflow, false, '页面不应出现横向滚动条');
}

async function readableShop(page) {
  await readablePage(page);
  const cards = await page.$$eval('.tshop-product', els => els.map(el => {
    const price = el.querySelector('.tshop-price');
    const button = el.querySelector('.tshop-buy button');
    const rect = el.getBoundingClientRect();
    const priceRect = price.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return { priceSize: parseFloat(getComputedStyle(price).fontSize),
      textSize: parseFloat(getComputedStyle(el).fontSize), fits: priceRect.right <= buttonRect.left && buttonRect.right <= rect.right };
  }));
  assert.ok(cards.length === 8 && cards.every(card => card.priceSize <= card.textSize * 1.5 && card.fits),
    `商品价格与购买按钮不得重叠或撑出卡片：${JSON.stringify(cards)}`);
}

test('奖杯商店真实浏览器：浏览、滚轮、购买、共享档案、结算留档及服务重启恢复',
  { skip: process.env.SP_E2E !== '1' || !hasChrome(), timeout: 180000 }, async () => {
    mkdirSync(OUT, { recursive: true });
    const directory = mkdtempSync(path.join(OUT, 'trophy-shop-'));
    const database = path.join(directory, 'players.sqlite');
    let profiles = new ProfileStore(database);
    let srv = await startServer({ host: '127.0.0.1', port: 0, quiet: true, profiles });
    const c = new Client(P, srv.url, '奖杯商店验收', { prefix: 'trophy-shop' });
    let twin;
    try {
      await c.open();
      await c.page.setRequestInterception(true);
      c.page.on('request', request => {
        if (new URL(request.url()).pathname === '/css/theme.css') void request.abort();
        else void request.continue();
      });
      await c.page.setCacheEnabled(false);
      await c.page.setViewport({ width: 2549, height: 1403, hasTouch: true });
      await c.page.reload({ waitUntil: 'domcontentloaded' });
      await c.page.waitForSelector('#app-theme');
      await c.page.waitForSelector('.title-screen');
      await readablePage(c.page);
      await c.shot('title-large');
      await c.enter('奖杯商店验收');
      await readablePage(c.page);
      await c.shot('lobby-large');
      const initial = await readyProfile(c.page);
      assert.equal(initial.balance, 10);
      assert.equal(initial.lifetimeEarned, 0);
      const [wallet] = profiles.settleMatch({ matchId: 'earned-before-browser', startedAt: 1,
        participants: { before: initial.profileId },
        summary: { players: [{ playerId: 'before', isBot: false, trophies: 24 }] } });
      srv.lobby.profiles.publish(wallet);
      await c.click('[data-testid="trophy-shop-open"]');
      await c.page.waitForSelector('.tshop-grid');
      assert.equal(await c.page.$eval('.tshop-heading .num', el => el.textContent), '34');
      assert.ok(await c.page.$$eval('.tshop-buy button', els => els.every(el => el.disabled)), '大厅只浏览');
      assert.ok(await c.page.$$eval('.tshop-product', els => els.some(el => el.querySelector('h3')?.textContent === '？？？')));
      await c.click('.tshop-expand', '移速');
      await c.page.focus('.tshop-wheel');
      await c.page.keyboard.press('End');
      await c.page.waitForFunction(() => document.querySelector('.tshop-option[aria-selected="true"]')?.textContent === '所有回合');
      assert.ok(await c.page.$$eval('.tshop-price', els => els.length === 8 && els.every(el => /^\d+ 奖杯$/.test(el.textContent))));
      await readableShop(c.page);
      await c.shot('large');
      await c.page.setViewport({ width: 1920, height: 1080, hasTouch: true });
      await readableShop(c.page);
      await c.shot('desktop');
      await c.page.setViewport({ width: 1024, height: 768, hasTouch: true });
      const bounds = await c.page.$eval('.tshop-modal', el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight };
      });
      assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= bounds.w + 1 && bounds.bottom <= bounds.h + 1);
      await readableShop(c.page);
      await c.shot('tablet');
      await c.page.setViewport({ width: 1920, height: 1080, hasTouch: true });
      await c.click('.tshop-close');

      twin = new Client(P, srv.url, '同浏览器标签');
      twin.page = await c.browser.newPage();
      await twin.page.setViewport({ width: 1920, height: 1080 });
      await twin.page.goto(srv.url, { waitUntil: 'domcontentloaded' });
      await twin.enter('同浏览器标签');
      assert.equal((await readyProfile(twin.page)).profileId, initial.profileId);
      assert.notEqual((await c.st()).me, (await twin.st()).me, '各标签的对局身份独立');
      await c.page.bringToFront();

      await c.click('.mode-card', '独立模拟');
      await c.click('.diff-card', '绝境模拟');
      await c.click('.create-box button', '开始独立模拟');
      await c.waitFor(s => !!s.room, 'room');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟');
      await c.waitFor(s => s.phase === 'INFO_CHECK', '信息确认');
      await c.click('[data-testid="trophy-shop-open"]');
      const buySelector = '.tshop-product:has(.tshop-note) .tshop-buy button';
      await c.page.waitForFunction(sel => document.querySelector(sel)?.disabled === false, {}, buySelector);
      await c.page.$eval(buySelector, el => el.scrollIntoView({ block: 'center' }));
      await c.click(buySelector);
      await c.page.waitForFunction(() => document.querySelector('.tshop-heading .num')?.textContent === '33');
      assert.equal(profiles.wallet(initial.profileId).lifetimeEarned, 24);
      await twin.page.waitForFunction(async () => (await import('/js/ui/profile.js')).profileStore.get().profile.balance === 33, { polling: 100 });
      await c.page.waitForFunction(() => [...document.querySelectorAll('.tshop-buy button')].every(el => !el.disabled));
      assert.equal(await c.page.$$eval('.tshop-buy button', els => els.filter(el => el.textContent === '尚未定价').length), 0);
      await c.shot('purchased');
      await c.click('.tshop-close');
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor(s => s.phase !== 'INFO_CHECK', '购买锁定');
      assert.equal((await c.page.evaluate(() => __SP__.net.request('shop.get'))).canBuy, false);

      // Force a completed match to verify result delivery/storage; combat is covered by match/sim suites.
      const m = [...srv.lobby.rooms.values()].find(r => r.match)?.match;
      m.round = m.gd.bossRound;
      m.finish({ victory: true, reason: 'victory' });
      await c.page.waitForFunction(() => __SP__.store.get().match.result?.players[0]?.trophies === 2);
      await c.page.waitForFunction(() => {
        const record = JSON.parse(localStorage.getItem('sp.pref.stats') || '{}').records?.at(-1);
        return record?.players?.some(p => p.trophies === 2);
      });
      await twin.page.waitForFunction(async () => (await import('/js/ui/profile.js')).profileStore.get().profile.balance === 35, { polling: 100 });
      assert.equal(profiles.wallet(initial.profileId).lifetimeEarned, 26);

      const port = srv.port;
      await srv.close();
      profiles = new ProfileStore(database);
      srv = await startServer({ host: '127.0.0.1', port, quiet: true, profiles });
      await c.page.reload({ waitUntil: 'domcontentloaded' });
      const restored = await readyProfile(c.page);
      assert.equal(restored.profileId, initial.profileId);
      assert.equal(restored.balance, 35);
      assert.equal(restored.lifetimeEarned, 26);
      assert.ok(await c.page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.stats')).records.length > 0));
      assert.deepEqual(problemsOf([c]), []);
      assert.ok(existsSync(database));
    } catch (error) {
      await c.shot('failed');
      console.error(JSON.stringify({ state: await c.st(), shop: await c.page.evaluate(async () => {
        const shop = await __SP__.net.request('shop.get');
        return { canBuy: shop.canBuy, counts: shop.counts, balance: shop.profile.balance };
      }),
        buttons: await c.page.$$eval('.tshop-buy button', els => els.map(el => ({ text: el.textContent, disabled: el.disabled }))),
        problems: problemsOf([c]) }));
      throw error;
    } finally {
      await twin?.page.close();
      await c.close();
      await srv.close();
    }
  });
