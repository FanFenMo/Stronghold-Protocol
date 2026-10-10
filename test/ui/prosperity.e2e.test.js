import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server/index.js';
import { enemyRec } from '../helpers/battleHarness.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { DATA } from '../match/harness.js';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const enabled = process.env.SP_E2E === '1' && existsSync(CHROME);
const OUT = fileURLToPath(new URL('../e2e/out/', import.meta.url));

function orbCheck(S, ds, layers) {
  const spec = S.buildBattleSpec({ seed: 29, kind: 'normal', modeId: 'mode_multi_normal', round: 1,
    stageId: 'act2autochess_m01', timeLimit: 10, flags: { startOpCooldown: 0 }, players: [{ playerId: 'p1',
      units: [{ uid: 1, chessId: 'chess_char_1_06_a', row: 10, col: 4 },
        { uid: 2, chessId: 'chess_char_1_10_a', row: 10, col: 6 },
        { uid: 3, chessId: 'chess_char_2_02_a', row: 9, col: 6 }],
      bonds: { prosperityShip: { count: 3, active: true, tier: 2, layers } } }] });
  const b = S.createBattleFromSpec(spec, ds, { quiet: true }); b.autoFinish = false; b.start();
  const [u, patient, diagonal] = b.allyUnits.filter(u => u.kind === 'op');
  for (const a of b.allyUnits) { a.profile.noAttack = true; if (a.skill) a.skill.rule = 'NEVER'; }
  const e = b.spawnEnemy('prosperity_target', { pos: [10, 5] });
  const diag = b.spawnEnemy('prosperity_target', { pos: [9, 6] });
  patient.hp = 1; b.heal(u, patient, 1000); diagonal.hp = 1;
  const count = u.mem.prosperityHealing, before = patient.hp;
  while (b.time < 1.05) b.step();
  return { count, damage: e.s.maxHp - e.hp, diagonalDamage: diag.s.maxHp - diag.hp,
    healing: patient.hp - before, remaining: u.mem.prosperityHealing, errors: b.errors };
}

test('繁盛：桌面与手机图标、当前数值、15人成员；浏览器和Node生命球结果一致',
  { skip: !enabled && 'SP_E2E=1 + Chrome required', timeout: 120000 }, async () => {
    const P = (await import('puppeteer-core')).default;
    const srv = await startServer({ host: '127.0.0.1', port: 0, quiet: true });
    const browser = await P.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
    mkdirSync(OUT, { recursive: true });
    try {
      for (const [width, height] of [[1920, 1080], [640, 360]]) {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setViewport({ width, height });
        await page.setRequestInterception(true);
        page.on('request', r => r.url().startsWith('https://fonts.googleapis.com/')
          ? r.respond({ status: 200, contentType: 'text/css', body: '' }) : r.continue());
        await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=PREP`);
        await page.waitForFunction(() => !!globalThis.__MOCK__);
        const setMembers = async (count, layers) => page.evaluate(({ count, layers }) => globalThis.__MOCK__.mutate(s => {
          const ids = ['chess_char_1_06_a', 'chess_char_1_10_a', 'chess_char_2_02_a'];
          s.priv.board = ids.slice(0, count).map((id, i) => ({ uid: 500 + i, kind: 'chess', id, row: 10, col: 4 + i, items: [] }));
          s.priv.hand.fill(null); s.layers.prosperityShip = layers;
        }), { count, layers });
        const selector = '.bslot[data-bond="prosperityShip"]';
        await setMembers(1, 0); await page.waitForSelector(`${selector} img`);
        assert.ok((await page.$eval(`${selector} img`, e => e.src)).endsWith('prosperity-inactive.png'));
        await setMembers(3, 200);
        await page.waitForFunction(sel => document.querySelector(`${sel} img`)?.src.endsWith('prosperity-active.png'), {}, selector);
        assert.equal(await page.$eval(`${selector} img`, e => getComputedStyle(e).filter), 'none');
        await page.waitForFunction(sel => { const img = document.querySelector(`${sel} img`); return img?.complete && img.naturalWidth > 0; }, {}, selector);
        await page.click(`${selector} .bond`); await page.waitForSelector('.bpop__members');
        assert.equal(await page.$$eval('.bpop__member', els => els.length), 15);
        const text = await page.$eval('.bpop__sec--now', e => e.textContent);
        assert.match(text, /治疗效果\+60%/); assert.match(text, /范围为9格/);
        assert.match(text, /实际治疗量÷10/); assert.doesNotMatch(text, /晕眩/);
        assert.equal(await page.$eval('.bpop__disc img', e => getComputedStyle(e).filter), 'none');
        await page.waitForSelector('.pbanner--overlay', { hidden: true });
        await page.screenshot({ path: `${OUT}/prosperity-${width}.png` });
        await page.click('.bpop__member');
        const glyph = '.dpanel .dbond[data-bond="prosperityShip"] img';
        await page.waitForSelector(glyph);
        assert.ok((await page.$eval(glyph, e => e.src)).endsWith('prosperity-glyph.png'));
        await page.waitForFunction(sel => { const img = document.querySelector(sel); return img?.complete && img.naturalWidth > 0; }, {}, glyph);
        assert.notEqual(await page.$eval(glyph, e => getComputedStyle(e).filter), 'none');
        assert.equal(await page.$eval(glyph, e => getComputedStyle(e).borderRadius), '0px');
        await page.screenshot({ path: `${OUT}/prosperity-detail-${width}.png` });
        assert.deepEqual(errors, []);
        if (width === 1920) {
          const target = enemyRec({ key: 'prosperity_target', hp: 100000, atk: 0, speed: 0 });
          const ds = new DataSource({ ...DATA, enemies: { ...DATA.enemies, prosperity_target: target } }, null);
          const expected = [39, 40, 200].map(l => orbCheck({ buildBattleSpec, createBattleFromSpec }, ds, l));
          const actual = await page.evaluate(async (src, target) => {
            const { loadBrowserSim } = await import('/js/battle/runner.js');
            const { spec: S, ds } = await loadBrowserSim();
            const { DataSource } = await import('/sim/simdata.js');
            const view = new DataSource({ ...ds.raw, enemies: { ...ds.raw.enemies, prosperity_target: target } }, null);
            const check = new Function(`return (${src})`)();
            return [39, 40, 200].map(l => check(S, view, l));
          }, orbCheck.toString(), target);
          assert.deepEqual(actual, expected);
          for (const [i, result] of actual.entries()) {
            assert.ok(result.damage > 0, JSON.stringify(result)); assert.equal(result.remaining, 0); assert.deepEqual(result.errors, []);
            assert.equal(result.diagonalDamage, i ? result.damage : 0);
          }
        }
        await page.close();
      }
    } finally { await browser.close(); await srv.close(); }
  });
