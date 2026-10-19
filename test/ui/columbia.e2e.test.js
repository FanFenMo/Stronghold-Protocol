import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, sleep, hasChrome, startRealServer, problemsOf } from '../e2e/client.mjs';

const STAR = 'chess_columbia_astesi_a', HALO = 'chess_columbia_halo_a';
const QUARTZ = 'chess_columbia_quartz_a', OTHER = 'chess_char_1_01_a';
const ITEMS = ['chess_item_custom_columbia_shield_a', 'chess_item_custom_columbia_graymatter_a'];

test('哥伦比亚真实浏览器：双星显示为特性，科技装备拒绝非成员并在战斗中共享',
  { skip: !(process.env.SP_E2E === '1' && hasChrome()), timeout: 240000 }, async () => {
    const P = (await import('puppeteer-core')).default;
    const srv = await startRealServer({ fast: { timerScale: 0.5, combatSpeed: 0.5, startRound: 1,
      chess: [STAR, HALO, QUARTZ, OTHER], items: ITEMS } });
    const c = new Client(P, srv.base, 'columbia', { prefix: 'columbia' });
    try {
      await c.open(); await c.enter('哥伦比亚验收');
      await c.click('.mode-card', '独立模拟'); await c.click('.diff-card', '标准模拟');
      await c.click('.create-box button', '开始独立模拟');
      await c.waitFor(s => !!s.room, 'solo room');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
      await c.waitFor(s => s.phase === 'INFO_CHECK', 'briefing', 30000);
      assert.equal(await c.page.$$eval('[data-bond="twinShip"]', els => els.length), 0);
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor(s => s.phase === 'BAND_DRAFT', 'band draft', 30000);
      await c.click('.dband', null, { nth: 1 }); await c.click('.draft-detail__btns .btn--primary', '确认选择');
      await c.waitFor(s => s.phase === 'PREP' && s.hand >= 6, 'starter kit', 60000);
      await sleep(1800); await c.hookRequests();
      const pieces = await c.handPieces('chess'), placed = new Map();
      for (const id of [STAR, HALO, QUARTZ, OTHER]) {
        const p = pieces.find(p => p.id === id), tile = await c.freeTileFor(p.uid);
        await c.drag(await c.piecePoint(p.uid), await c.tilePoint(tile.row, tile.col));
        await c.page.waitForSelector('.fwheel__dia', { timeout: 4000 }); await c.swipe('RIGHT');
        await c.page.waitForFunction(uid => globalThis.__SP__.store.get().match.private.board.some(p => p.uid === uid), {}, p.uid);
        placed.set(id, { ...p, ...tile }); await sleep(400);
      }
      assert.equal(await c.page.$$eval('[data-bond="twinShip"]', els => els.length), 0);
      const starPoint = await c.piecePoint(placed.get(STAR).uid);
      await c.page.mouse.click(starPoint.x, starPoint.y);
      await c.page.waitForFunction(() => [...document.querySelectorAll('.dgarrison')].some(el => el.textContent.includes('双星')));
      await c.shot('operator-trait'); await c.page.keyboard.press('Escape');
      const inventory = () => c.page.evaluate(() => globalThis.__SP__.store.get().match.private);
      const shield = (await c.handPieces('item')).find(p => p.id === ITEMS[0]);
      const other = placed.get(OTHER);
      await c.drag(await c.piecePoint(shield.uid, 0.5), await c.tilePoint(other.row, other.col)); await sleep(500);
      assert.ok((await c.handPieces('item')).some(p => p.uid === shield.uid));
      assert.equal((await c.requests('g.equip')).length, 0, 'frontend refuses the invalid drop');
      assert.ok((await c.toasts()).some(t => t.includes('哥伦比亚')));
      for (const id of ITEMS) {
        const p = (await c.handPieces('item')).find(p => p.id === id), target = placed.get(HALO);
        await c.drag(await c.piecePoint(p.uid, 0.5), await c.tilePoint(target.row, target.col));
        await c.page.waitForFunction((uid, itemId) => globalThis.__SP__.store.get().match.private.board.find(p => p.uid === uid)?.items.some(it => it.id === itemId), {}, target.uid, id);
      }
      const priv = await inventory();
      assert.equal(priv.board.find(p => p.id === HALO).items.length, 2);
      assert.equal(priv.board.find(p => p.id === STAR).items.length, 0, 'sharing never copies inventory items');
      await c.shot('equipment');
      await c.click('.readybtn'); await c.waitFor(s => s.phase === 'COMBAT', 'combat', 60000);
      await c.page.waitForFunction(() => [...(globalThis.__SP_RUNNER__?._entries?.values() || [])].some(e => e.own && e.battle?.allyUnits.some(u => u.alive)));
      const combat = await c.page.evaluate(async () => {
        const { itemGrants } = await import('/sim/content/items/battle.js');
        const b = [...globalThis.__SP_RUNNER__._entries.values()].find(e => e.own && e.battle).battle;
        const a = b.allyUnits.find(u => u.def.charId === 'char_274_astesi');
        return { shared: itemGrants(b, a).filter(g => g.lent).map(g => g.id), errors: b.errors };
      });
      assert.deepEqual(combat.shared.sort(), [...ITEMS].sort()); assert.deepEqual(combat.errors, []);
      await c.shot('combat'); assert.deepEqual(problemsOf([c]), []);
    } finally { await c.close(); await srv.stop(); }
  });
