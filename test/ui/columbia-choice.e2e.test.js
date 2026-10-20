import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import P from 'puppeteer-core';
import { startServer } from '../../server/index.js';
import { Client, sleep, problemsOf } from '../e2e/client.mjs';
import { give, legalTileFor } from '../match/harness.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const enabled = process.env.SP_E2E === '1' && existsSync(CHROME);

test('哥伦比亚真实二选一：候选保留、五次选择不重复，最后一种自动领取', { skip: !enabled, timeout: 180000 }, async () => {
const srv = await startServer({ host: '127.0.0.1', port: 0, quiet: true });
const c = new Client(P, srv.url, 'columbia-choice', { prefix: 'columbia-v12-choice' });
try {
  await c.open(); await c.enter('哥伦比亚二选一验收');
  await c.click('.mode-card', '独立模拟'); await c.click('.diff-card', '标准模拟');
  await c.click('.create-box button', '开始独立模拟');
  await c.waitFor(s => !!s.room, 'solo room');
  if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
  await c.waitFor(s => s.phase === 'INFO_CHECK', 'briefing', 30000);
  await c.click('.brief__foot .btn--primary', '准备就绪');
  await c.waitFor(s => s.phase === 'BAND_DRAFT', 'strategy', 30000);
  await c.click('.dband', null, { nth: 1 }); await c.click('.draft-detail__btns .btn--primary', '确认选择');
  await c.waitFor(s => s.phase === 'PREP', 'prep', 30000);
  const m = [...srv.lobby.rooms.values()].find(r => r.match)?.match;
  const ps = m.order.find(p => !p.isBot);
  m.guard(() => {
    ps.gd.modeInactiveBonds.delete('columbiaShip');
    for (const piece of [...ps.board.values(), ...ps.hand, ...ps.temp]) if (piece?.kind === 'chess') ps.returnCopies(piece);
    ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
    ps.bandId = null;
    for (const id of ['chess_columbia_quartz_a', 'chess_columbia_halo_a', 'chess_char_2_02_a']) {
      const tile = legalTileFor(m, ps, id);
      give(m, ps, id, 'board', tile);
    }
    ps.addLayers('columbiaShip', 350);
    m.markPublic();
  });
  await c.page.waitForFunction(() => globalThis.__SP__.store.get().match.private.shop.rewardOffer?.slots.length === 2);
  assert.equal(ps.columbiaTech.length, 0);
  assert.equal(await c.page.$eval('.rwtag__later', el => el.title), '稍后选择（保留至后续休整期）');
  const first = ps.offers[0].slots.map(s => s.id);
  assert.equal(await c.page.$$eval('.shopbar__rwcards .scard--item', els => els.length), 2);
  await c.click('.rwtag__later');
  assert.equal(await c.page.$$eval('.rewardpill', els => els.length), 1);
  await c.click('.rewardpill');
  assert.deepEqual(ps.offers[0].slots.map(s => s.id), first);
  for (let i = 0; i < 5; i++) {
    await c.page.waitForFunction(() => document.querySelectorAll('.shopbar__rwcards .scard--item').length === 2);
    const options = ps.offers[0].slots.map(s => s.id);
    assert.equal(new Set(options).size, 2);
    assert.ok(options.every(id => !ps.columbiaTech.some(key => id === 'chess_item_custom_columbia_' + key + '_a')));
    await c.click('.shopbar__rwcards .scard--item'); await sleep(150);
    await c.click('.shopbar__rwcards .scard--item');
    await c.page.waitForFunction(count => {
      const priv = globalThis.__SP__.store.get().match.private;
      return [...priv.hand, ...priv.temp].filter(p => p?.id.startsWith('chess_item_custom_columbia_')).length === count;
    }, {}, i === 4 ? 6 : i + 1);
  }
  assert.equal(ps.columbiaTech.length, 6);
  assert.equal(new Set(ps.columbiaTech).size, 6);
  assert.equal(ps.offers.length, 0);
  assert.deepEqual(problemsOf([c]), []);
  await c.shot('all-six-claimed');
} finally { await c.close(); await srv.close(); }

});
