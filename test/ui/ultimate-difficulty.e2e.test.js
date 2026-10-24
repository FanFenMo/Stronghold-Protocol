import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../helpers/server.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { DataSource } from '../../server/sim/simdata.js';
import { chessRec, enemyRec, flatStage } from '../helpers/battleHarness.js';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const enabled = process.env.SP_E2E === '1' && existsSync(CHROME);
const OUT = fileURLToPath(new URL('../e2e/out/', import.meta.url));

function combatCheck(S, raw) {
  const data = new S.DataSource(raw);
  const spec = S.buildBattleSpec({ seed: 17, kind: 'boss', modeId: 'mode_multi_abyss', round: 12,
    stageId: 'flat', timeLimit: Infinity, flags: { ultimateLevel: 16, startOpCooldown: 0 },
    players: [{ playerId: 'p1', units: [{ uid: 1, chessId: 'op_test', row: 10, col: 5 }] }], spawns: [], routes: [] });
  const b = S.createBattleFromSpec(JSON.parse(JSON.stringify(spec)), data, { content: 'none', quiet: true });
  b.autoFinish = false; b.start();
  const u = b.allyUnits[0]; u.profile.noAttack = true;
  const e = b.spawnEnemy('enemy_test', { tag: 'boss', pos: [3, 5] });
  e.profile.noAttack = true; e.base.moveSpeed = 0; e.markDirty();
  const hits = [];
  for (let i = 0; i < 31; i++) hits.push(b.dealDamage(u, e, { amount: 10, type: 'true' }));
  while (b.time < 60.1) b.step();
  return { hits, atk: u.s.atk, def: u.s.def, enemyAtk: e.s.atk, enemyDef: e.s.def, enemyRes: e.s.res,
    enemyHp: e.s.maxHp, reflected: u.s.maxHp - u.hp, shield: e.findBuff('ultimate:trueShield')?.shieldHits,
    errors: b.errors };
}

test('n16 picker, two announced bosses and Node/browser combat parity on desktop and mobile',
  { skip: !enabled && 'SP_E2E=1 + Chrome required', timeout: 120000 }, async () => {
    const raw = { chess: { op_test: chessRec({ id: 'op_test', stats: { maxHp: 10000, atk: 500 }, skill: null }) },
      enemies: { enemy_test: enemyRec({ hp: 1e6, atk: 200, def: 100, res: 20, speed: 0 }) }, stages: { flat: flatStage() } };
    const expected = combatCheck({ DataSource, buildBattleSpec, createBattleFromSpec }, raw);
    assert.deepEqual(expected.hits, [...new Array(30).fill(0), 9]);
    assert.equal(expected.shield, 30); assert.equal(expected.reflected, 0);
    assert.equal(expected.atk, 405); assert.equal(expected.def, 180);
    assert.ok(Math.abs(expected.enemyDef - 110) < 1e-8); assert.equal(expected.enemyRes, 22);
    const P = (await import('puppeteer-core')).default;
    const srv = await startServer({ host: '127.0.0.1', port: 0, quiet: true });
    const browser = await P.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
    mkdirSync(OUT, { recursive: true });
    try {
      for (const [width, height] of [[1920, 1080], [844, 390]]) {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setViewport({ width, height });
        await page.setRequestInterception(true);
        page.on('request', r => r.url().startsWith('https://fonts.googleapis.com/')
          ? r.respond({ status: 200, contentType: 'text/css', body: '' }) : r.continue());
        await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=INFO_CHECK`);
        await page.waitForFunction(() => !!globalThis.__MOCK__);
        await page.evaluate(() => {
          Object.assign(globalThis.__MOCK__.S().pub, { difficulty: 'ABYSS', ultimateLevel: 16, bossRound: 20,
            hiddenRound: 21, middleBossRound: 12, middleBossId: 'boss_1', bossId: 'boss_2' });
          globalThis.__MOCK__.pushPublic();
        });
        await page.waitForFunction(() => document.querySelectorAll('.brief-boss').length === 2);
        const text = await page.$eval('.brief__left', el => el.textContent);
        assert.match(text, /12.*中间 BOSS/); assert.match(text, /20.*最终攻势/);
        await page.screenshot({ path: `${OUT}/ultimate-n16-briefing-${width}.png` });
        const actual = await page.evaluate(async (src, raw) => {
          const S = await import('/sim/spec.js'), { DataSource } = await import('/sim/simdata.js');
          return new Function(`return (${src})`)()({ ...S, DataSource }, raw);
        }, combatCheck.toString(), raw);
        assert.deepEqual(actual, expected);
        await page.evaluate(async () => {
          const { render, h } = await import('/vendor/preact.module.js');
          const { UltimateDifficultyPicker } = await import('/js/ui/ultimateDifficulty.js');
          render(h(UltimateDifficultyPicker, { value: 16 }), document.getElementById('app'));
        });
        await page.waitForSelector('.udepth__effects li');
        assert.equal(await page.$eval('.udepth', el => getComputedStyle(el).display), 'grid');
        assert.equal(await page.$$eval('.udepth__effects li', els => els.length), 16);
        assert.equal(await page.$$eval('.is-locked', els => els.length), 0);
        const effects = await page.$eval('.udepth__brief', el => el.textContent);
        assert.match(effects, /受到的任何伤害降低 10%/);
        assert.match(effects, /30 次真伤击破/); assert.doesNotMatch(effects, /反伤|防御提升 80%|未完待续|次数怪|联机时|悬赏金额/);
        await page.screenshot({ path: `${OUT}/ultimate-n16-picker-${width}.png` });
        assert.deepEqual(errors, []); await page.close();
      }
    } finally { await browser.close(); await srv.close(); }
  });
