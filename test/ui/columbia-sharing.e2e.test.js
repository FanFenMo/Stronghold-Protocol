import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer } from '../helpers/server.js';
import { DATA } from '../match/harness.js';
import { chessRec } from '../helpers/battleHarness.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const enabled = process.env.SP_E2E === '1' && existsSync(CHROME);

function equipmentCheck(S, ds) {
  const equipped = [['chess_item_1_01_e_a'], ['chess_item_1_01_e_b'],
    ['chess_item_custom_columbia_shield_a', 'chess_item_4_03_e_a']];
  const spec = S.buildBattleSpec({ seed: 23, kind: 'normal', modeId: 'mode_multi_normal', round: 1,
    stageId: 'act2autochess_m01', timeLimit: 60, players: [{ playerId: 'p1',
      units: Array.from({ length: 6 }, (_, i) => ({ uid: i + 1, chessId: `columbia_browser_${i}`,
        row: 10, col: 2 + i, items: equipped[i] ?? [], dir: 'RIGHT' })),
      bonds: { columbiaShip: { count: 6, active: true, tier: 2, layers: 500 } } }] });
  const b = S.createBattleFromSpec(spec, ds, { quiet: true }); b.autoFinish = false; b.start(); b.step();
  const read = () => b.allyUnits.map(u => ({ atk: u.s.atk, aspd: u.s.aspd, hp: u.s.maxHp, res: u.s.res }));
  const initial = read(), carrier = b.allyUnits[2];
  for (let i = 0; i < 10; i++) b.emit('attack', { attacker: carrier, targets: [] });
  const stacked = read();
  b.getPlayer('p1').bonds.columbiaShip.layers = 100;
  b.emit('layerGain', { playerId: 'p1', bondId: 'columbiaShip', layers: 100 });
  const grown = read();
  b.kill(b.allyUnits[5]); b.step();
  return { initial, stacked, grown, removed: read(), errors: b.errors };
}

test('哥伦比亚v1.2浏览器：三六人文案正确，基础装备和专属效果与Node一致',
  { skip: !enabled, timeout: 120000 }, async () => {
    const P = (await import('puppeteer-core')).default;
    const srv = await startServer({ host: '127.0.0.1', port: 0, quiet: true });
    const browser = await P.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
    try {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setViewport({ width: 1920, height: 1080 });
      await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=PREP`);
      await page.waitForFunction(() => !!globalThis.__MOCK__);
      const update = (count, layers) => page.evaluate(({ count, layers }) => globalThis.__MOCK__.mutate(s => {
        const ids = ['chess_columbia_quartz_a', 'chess_columbia_halo_a', 'chess_columbia_astesi_a',
          'chess_char_2_02_a', 'chess_char_2_19_a', 'chess_char_5_11_a'];
        s.priv.board = ids.slice(0, count).map((id, i) => ({ uid: 800 + i, kind: 'chess', id, row: 10, col: 2 + i, items: [] }));
        s.priv.hand.fill(null); s.layers.columbiaShip = layers;
      }), { count, layers });
      await update(3, 0);
      await page.click('.bslot[data-bond="columbiaShip"] .bond');
      await page.waitForSelector('[data-bond-effect="columbiaShip"]');
      const read = () => page.$eval('[data-bond-effect="columbiaShip"]', el => ({ text: el.textContent,
        active: [...el.querySelectorAll('.bpop__clause')].map(c => c.classList.contains('is-active')) }));
      let got = await read(); assert.match(got.text, /装备效果提升50%/); assert.deepEqual(got.active, [true, false]);
      assert.match(got.text, /20\/50\/100\/170\/250\/350.*二选一.*最后一种直接领取/);
      await update(6, 500);
      await page.waitForFunction(() => document.querySelector('[data-bond-effect="columbiaShip"]')?.textContent.includes('200%'));
      got = await read(); assert.match(got.text, /激活哥伦比亚科技装备的专属效果/); assert.deepEqual(got.active, [true, true]);
      assert.doesNotMatch(got.text, /共享|过载|50攻速/);
      const fixtures = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`columbia_browser_${i}`,
        chessRec({ id: `columbia_browser_${i}`, bonds: ['columbiaShip'], skill: null, rangeGrid: [],
          stats: { atk: 100, maxHp: 10000, blockCnt: 0 } })]));
      const ds = new DataSource({ ...DATA, chess: { ...DATA.chess, ...fixtures } }, null);
      const expected = equipmentCheck({ buildBattleSpec, createBattleFromSpec }, ds);
      const actual = await page.evaluate(async (src, fixtures) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const { spec: S, ds } = await loadBrowserSim();
        const { DataSource } = await import('/sim/simdata.js');
        const view = new DataSource({ ...ds.raw, chess: { ...ds.raw.chess, ...fixtures } }, null);
        return new Function(`return (${src})`)()(S, view);
      }, equipmentCheck.toString(), fixtures);
      assert.deepEqual(actual, expected);
      assert.equal(actual.initial[0].atk, 145); assert.equal(actual.initial[3].atk, 100);
      assert.equal(actual.initial[2].res, 30); assert.equal(actual.initial[3].res, 0);
      assert.equal(actual.stacked[3].aspd, 100);
      assert.equal(actual.removed[3].atk, 100);
      assert.equal(actual.removed[2].res, 0);
      assert.deepEqual(actual.errors, []); assert.deepEqual(errors, []);
    } finally { await browser.close(); await srv.close(); }
  });
