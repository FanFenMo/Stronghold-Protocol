import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, problemsOf, sleep } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();
for (const suffix of ['a', 'b']) {
  test(`Aegir v1.3 ${suffix}: traits and concise relay description display, five operators deploy and browser combat settles`,
    { skip: !enabled && 'SP_E2E=1 + Chrome required', timeout: 180000 }, async () => {
      const ids = ['chess_char_1_04_', 'chess_char_2_07_', 'chess_char_3_05_', 'chess_char_4_12_', 'chess_char_5_13_'].map(id => id + suffix);
      const srv = await startRealServer({ fast: { timerScale: 0.5, combatSpeed: 2, startRound: 1, chess: ids, stage: 'act2autochess_m01' } });
      const P = (await import('puppeteer-core')).default;
      const offline = { async launch(opts) {
        const browser = await P.launch(opts), [page] = await browser.pages();
        await page.setRequestInterception(true);
        page.on('request', r => r.url().startsWith('https://fonts.googleapis.com/')
          ? r.respond({ status: 200, contentType: 'text/css', body: '' }) : r.continue());
        return browser;
      } };
      const c = new Client(offline, srv.base, 'aegir', { prefix: `aegir-v13-${suffix}` });
      try {
        await c.open(); await c.enter('阿戈尔 v1.3 验收');
        await c.click('.mode-card', '独立模拟'); await c.click('.diff-card', '险境模拟');
        await c.click('.create-box button', '开始独立模拟');
        await c.waitFor(s => !!s.room, 'solo room');
        if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟');
        await c.waitFor(s => s.phase === 'INFO_CHECK', 'briefing');
        await c.click('.brief__foot .btn--primary', '准备就绪');
        await c.waitFor(s => s.phase === 'BAND_DRAFT', 'strategy draft');
        await c.page.waitForSelector('.dband');
        await c.page.evaluate(() => [...document.querySelectorAll('.dband')]
          .find(el => el.querySelector('.dband__name').textContent === '克莱门莎').scrollIntoView({ block: 'center' }));
        await c.click('.dband', '克莱门莎');
        await c.click('.draft-detail__btns .btn--primary', '确认选择');
        await c.waitFor(s => s.phase === 'PREP' && s.hand >= 5, 'five-operator hand');
        await sleep(1800);
        const pieces = await c.handPieces('chess'), mul = suffix === 'a' ? 1 : 2;
        for (const [id, count, texts] of [
          [ids[1], 2, [`层数+${2 * mul}`, '每击倒5名敌人', `最多叠加${10 * mul}层`]],
          [ids[4], 3, [`层数+${4 * mul}`, `层数+${6 * mul}`, '切换为替身时', '每有2名', `层数+${mul}`, `层数+${2 * mul}`]],
        ]) {
          const piece = pieces.find(p => p.id === id), pt = await c.piecePoint(piece.uid);
          await c.page.mouse.click(pt.x, pt.y);
          await c.page.waitForSelector('.dpanel .dgarrison');
          const descs = await c.page.$$eval('.dpanel .dgarrison', els => els.map(el => el.textContent));
          assert.equal(descs.length, count);
          for (const text of texts) assert.ok(descs.join('\n').includes(text), `${id}: ${text}: ${descs}`);
          await c.shot(id === ids[1] ? 'specter-detail' : 'specter2-detail');
        }
        for (const id of ids) {
          const p = pieces.find(p => p.id === id);
          const tile = await c.freeTileFor(p.uid), from = await c.piecePoint(p.uid), to = await c.tilePoint(tile.row, tile.col);
          await c.drag(from, to);
          await c.page.waitForSelector('.fwheel__dia', { visible: true, timeout: 5000 });
          await c.swipe('UP');
          await c.page.waitForFunction(uid => globalThis.__SP__.store.get().match.private.board.some(p => p.uid === uid), { timeout: 5000 }, p.uid);
        }
        const bond = await c.page.evaluate(() => globalThis.__SP__.store.get().match.private.bonds.find(b => b.bondId === 'egirShip'));
        assert.equal(bond.count, 5); assert.equal(bond.active, true); assert.equal(bond.tier, 2);
        await c.click('.gm__bonds .bslot[data-bond="egirShip"] .bond', null, { any: true });
        await c.page.waitForSelector('.bpop');
        const desc = await c.page.$eval('.bpop .bpop__desc', el => el.textContent);
        for (const text of ['非远程敌人', '80%', '中间干员死亡不切断']) assert.ok(desc.includes(text), desc);
        assert.ok(!desc.includes('真伤') && !/[（()）]/.test(desc), desc);
        await c.shot('covenant-relay');
        await c.page.keyboard.press('Escape');
        await c.click('.readybtn'); await c.waitFor(s => s.phase === 'COMBAT', 'combat');
        await c.page.waitForFunction(() => [...globalThis.__SP_RUNNER__._entries.values()].some(e => e.own && e.battle));
        await c.page.evaluate(() => {
          const entry = [...globalThis.__SP_RUNNER__._entries.values()].find(e => e.own && e.battle);
          globalThis.__AEGIR_CHECK__ = { authoritative: entry.authoritative, burns: 0, errors: entry.battle.errors,
            units: entry.battle.allyUnits.map(u => ({ id: u.defId, stats: u.stats })) };
          entry.battle.on('damaged', c => {
            if (c.dmg.tags.includes('bond:egir:burn')) globalThis.__AEGIR_CHECK__.burns++;
          });
        });
        await c.page.waitForFunction(() => globalThis.__AEGIR_CHECK__.units.some(u => u.stats.attacks > 0 && u.stats.dmg > 0), { timeout: 45000, polling: 100 });
        await c.waitFor(s => s.phase === 'PREP' && s.round >= 2 || !!s.result, 'accepted combat settlement', 90000);
        const got = await c.page.evaluate(() => globalThis.__AEGIR_CHECK__);
        assert.equal(got.authoritative, true); assert.deepEqual(got.errors, []);
        assert.ok(got.units.some(u => u.stats.attacks > 0 && u.stats.dmg > 0));
        assert.equal(got.burns, 0);
        assert.deepEqual(problemsOf([c]), []);
        console.log(JSON.stringify({ suffix, attacks: got.units.reduce((n, u) => n + u.stats.attacks, 0), burns: got.burns }));
      } finally { await c.close(); await srv.stop(); }
    });
}
