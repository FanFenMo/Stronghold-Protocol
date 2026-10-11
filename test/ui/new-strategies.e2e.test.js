import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();
async function openDraft(c) {
  await c.open('?render=fallback'); await c.enter('新增策略验收');
  await c.click('.mode-card', '独立模拟'); await c.click('.diff-card', '险境模拟');
  await c.click('.create-box button', '开始独立模拟');
  await c.waitFor(s => !!s.room, 'solo room');
  if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟');
  await c.waitFor(s => s.phase === 'INFO_CHECK', 'briefing');
  await c.click('.brief__foot .btn--primary', '准备就绪');
  await c.waitFor(s => s.phase === 'BAND_DRAFT', 'draft');
}
async function browserFactory() {
  const P = (await import('puppeteer-core')).default;
  return { async launch(opts) {
    const browser = await P.launch(opts), [page] = await browser.pages();
    await page.setRequestInterception(true);
    page.on('request', r => r.url().startsWith('https://fonts.googleapis.com/')
      ? r.respond({ status: 200, contentType: 'text/css', body: '' }) : r.continue());
    return browser;
  } };
}
async function choose(c, id) {
  await c.page.$eval(`[data-band="${id}"]`, e => e.scrollIntoView({ block: 'center' }));
  await c.click(`[data-band="${id}"]`);
  await c.click('.draft-detail__btns .btn--primary', '确认选择');
  await c.waitFor(s => s.phase === 'PREP' || s.phase === 'SP_DRAFT', 'prep or decision');
  if ((await c.st()).phase === 'SP_DRAFT') {
    await c.click('.spcard:not([aria-disabled="true"])');
    await c.click('.spov__confirm', '确认选择');
  }
  await c.waitFor(s => s.phase === 'PREP', 'prep');
}

test('real draft uses both supplied icons, leaves rolling logs blank; Touch medic moves by mouse without using a slot',
  { skip: !enabled && 'SP_E2E=1 + Chrome required', timeout: 120000 }, async () => {
    const srv = await startRealServer({ fast: { stage: 'act2autochess_m01' } });
    const c = new Client(await browserFactory(), srv.base, 'new-strategies', { prefix: 'new-strategies' });
    try {
      await openDraft(c);
      for (const [id, name, path] of [['band_qingzhi', '青织', '/img/bands/qingzhi.png'], ['band_w', 'W', '/img/bands/w.png']]) {
        await c.page.$eval(`[data-band="${id}"]`, e => e.scrollIntoView({ block: 'center' }));
        await c.page.waitForFunction((id, path) => {
          const e = document.querySelector(`[data-band="${id}"] img`);
          return e?.complete && e.naturalWidth === 768 && e.src.endsWith(path);
        }, {}, id, path);
        assert.equal(await c.page.$eval(`[data-band="${id}"] .dband__name`, e => e.textContent), name);
      }
      assert.equal(await c.page.$eval('[data-band="band_rolling_logs"] .bandicon', e => e.childElementCount), 0);
      await choose(c, 'band_amedic');
      const before = await c.page.evaluate(() => {
        const p = globalThis.__SP__.store.get().match.private;
        return { uid: p.hand.find(x => x?.kind === 'token' && x.id === 'char_605_cmedic')?.uid, count: p.deployCount };
      });
      assert.ok(before.uid);
      await c.page.waitForFunction(uid => !!globalThis.__SP_VIEW__?.pieceScreenRect(uid), {}, before.uid);
      await c.drag(await c.piecePoint(before.uid), await c.tilePoint(10, 4));
      await c.page.waitForSelector('.fwheel__dia');
      await c.swipe('RIGHT');
      await c.page.waitForFunction(uid => globalThis.__SP__.store.get().match.private.board.some(p => p.uid === uid), {}, before.uid);
      const placed = await c.page.evaluate(uid => {
        const p = globalThis.__SP__.store.get().match.private;
        const medic = p.board.find(x => x.uid === uid);
        return { count: p.deployCount, row: medic.row, col: medic.col };
      }, before.uid);
      assert.deepEqual(placed, { count: before.count, row: 10, col: 4 });
      assert.deepEqual(c.problems.filter(x => x.startsWith('pageerror:') || /http.*\/img\/bands\//.test(x)), []);
      await c.page.waitForSelector('.pbanner--overlay', { hidden: true });
      await c.shot('touch-deployed');
    } finally { await c.close(); await srv.stop(); }
  });

test('real R6 Qingzhi refresh shows three free choices; picking one removes the other two',
  { skip: !enabled && 'SP_E2E=1 + Chrome required', timeout: 120000 }, async () => {
    const srv = await startRealServer({ fast: { startRound: 6, stage: 'act2autochess_m01' } });
    const c = new Client(await browserFactory(), srv.base, 'qingzhi', { prefix: 'new-strategies' });
    try {
      await openDraft(c); await choose(c, 'band_qingzhi');
      const before = await c.st(); assert.equal(before.round, 6);
      await c.click('.toolbtn', '刷新');
      await c.page.waitForFunction(() => globalThis.__SP__.store.get().match.private.shop.rewardOffer?.slots.length === 3);
      const slots = await c.page.evaluate(async () => {
        const { data } = await import('/js/data.js');
        return globalThis.__SP__.store.get().match.private.shop.rewardOffer.slots
          .map(s => ({ id: s.id, tier: data.lookup('chess', s.id).tier, price: s.price }));
      });
      assert.equal(slots.length, 3); assert.ok(slots.every(s => s.tier === 5 && s.price === 0));
      assert.equal(new Set(slots.map(s => s.id)).size, 3);
      assert.equal((await c.st()).funds, before.funds);
      await c.page.waitForSelector('.shopbar__rwcards button');
      await c.shot('qingzhi-three-choices');
      await c.click('.shopbar__rwcards button', null, { nth: 0 });
      await c.click('.shopbar__rwcards button', null, { nth: 0 });
      await c.page.waitForFunction(() => globalThis.__SP__.store.get().match.private.shop.rewardOffer === null);
      await c.page.waitForSelector('.shopbar__rwcards', { hidden: true });
      assert.equal((await c.st()).funds, before.funds);
      const after = await c.page.evaluate(() => {
        const p = globalThis.__SP__.store.get().match.private;
        return { owned: [...p.hand, ...p.temp, ...p.board].filter(x => x?.kind === 'chess').map(x => x.id),
          shop: p.shop.slots.filter(s => s?.kind === 'chess').map(s => ({ id: s.id, price: s.price })) };
      });
      assert.ok(after.owned.includes(slots[0].id));
      assert.ok(slots.slice(1).every(s => !after.owned.includes(s.id) && !after.shop.some(x => x.id === s.id)));
      assert.ok(after.shop.every(s => s.price > 0));
      assert.deepEqual(c.problems.filter(x => x.startsWith('pageerror:')), []);
      await c.page.waitForSelector('.pbanner--overlay', { hidden: true });
      await c.shot('qingzhi-special-refresh');
    } finally { await c.close(); await srv.stop(); }
  });
