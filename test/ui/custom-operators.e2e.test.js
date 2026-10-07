// Real preparation UI -> canvas deployment -> browser-authoritative battle -> accepted settlement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, problemsOf, sleep } from '../e2e/client.mjs';

const IDS = ['chess_custom_5_ascln_a', 'chess_custom_6_oblvns_a', 'chess_custom_5_ascln_b', 'chess_custom_6_oblvns_b'];
const enabled = process.env.SP_E2E === '1' && hasChrome();

for (const group of ['legacy','expansion']) for (const suffix of ['a', 'b']) {
const ids = group === 'legacy' ? IDS.filter((id) => id.endsWith(`_${suffix}`)) : ['chess_custom_5_chen3_','chess_custom_6_aglna2_','chess_custom_6_wang_'].map(id=>id+suffix);
test(`custom operators ${group}-${suffix}: drag chess onto the map and fight with real browser kits and Spine`,
  { skip: !enabled && 'SP_E2E=1 + Chrome required', timeout: 180000 }, async () => {
    const srv = await startRealServer({ fast: { timerScale: 0.5, combatSpeed: 2, startRound: 1, chess: ids, stage: 'act2autochess_m01' } });
    const P = (await import('puppeteer-core')).default;
    const offline = { async launch(opts) {
      const browser = await P.launch(opts);
      const [page] = await browser.pages();
      await page.setRequestInterception(true);
      page.on('request', (r) => r.url().startsWith('https://fonts.googleapis.com/')
        ? r.respond({ status: 200, contentType: 'text/css', body: '' }) : r.continue());
      return browser;
    } };
    const c = new Client(offline, srv.base, 'custom', { prefix: `custom-operators-${group}-${suffix}` });
    try {
      await c.open();
      await c.enter('双干员实战验收');
      await c.click('.mode-card', '独立模拟');
      await c.click('.diff-card', '标准模拟');
      await c.click('.create-box button', '开始独立模拟');
      await c.waitFor((s) => !!s.room, 'solo room');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟');
      await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing');
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft');
      await c.click('.dband', null, { nth: 1 });
      await c.click('.draft-detail__btns .btn--primary', '确认选择');
      await c.waitFor((s) => s.phase === 'PREP' && s.hand > 0, 'prep');
      await sleep(1800);
      const pieces = await c.handPieces('chess');
      for (const id of ids) {
        const p = pieces.find((p) => p.id === id);
        assert.ok(p, `${id} is in the preparation hand`);
        const tile = await c.freeTileFor(p.uid), from = await c.piecePoint(p.uid), to = await c.tilePoint(tile.row, tile.col);
        assert.ok(from && to);
        await c.drag(from, to);
        await c.page.waitForSelector('.fwheel__dia', { visible: true, timeout: 5000 });
        await c.swipe('RIGHT');
        await c.page.waitForFunction((uid) => globalThis.__SP__.store.get().match.private.board.some((p) => p.uid === uid), { timeout: 5000 }, p.uid);
      }
      assert.equal(await c.page.evaluate(() => document.querySelectorAll('.bslot[data-off="1"]').length), 0);
      await c.shot('deployed');
      await c.click('.readybtn');
      await c.waitFor((s) => s.phase === 'COMBAT', 'combat');
      const got = await c.page.waitForFunction((ids) => {
        const entry = [...globalThis.__SP_RUNNER__._entries.values()].find((e) => e.own && e.battle);
        if (!entry) return false;
        const units = ids.map((id) => entry.battle.allyUnits.find((u) => u.defId === id));
        if (units.some((u) => !u?.deployed || !u.stats.attacks)) return false;
        const damage = Object.fromEntries(units.map(u=>[u.defId,u.stats.dmg]));
        if (units.some(u=>!u.stats.dmg)) return false;
        const views = globalThis.__SP_VIEW__.raw.debug.views;
        if (units.some((u) => !views.get(u.id)?.spineReady)) return false;
        return { authoritative: entry.authoritative, damage,
          units: units.map((u) => ({ id: u.defId, skill: u.skill.id, source: u.kit.skillSource, attacks: u.stats.attacks })), errors: entry.battle.errors };
      }, { timeout: 45000, polling: 100 }, ids).then((h) => h.jsonValue());
      assert.equal(got.authoritative, true);
      assert.ok(got.units.every((u) => u.source === 'skills' && u.attacks > 0));
      assert.deepEqual(got.errors, []);
      await c.shot('combat');
      console.log(JSON.stringify(got));
      await c.waitFor((s) => s.phase === 'PREP' && s.round >= 2 || !!s.result, 'accepted next round', 90000);
      assert.deepEqual(problemsOf([c]), []);
    } finally {
      if (c.problems.length) console.log(c.problems.join('\n'));
      await c.close();
      await srv.stop();
    }
  });
}
