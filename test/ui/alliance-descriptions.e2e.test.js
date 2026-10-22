import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../helpers/server.js';
import { DATA } from '../match/harness.js';
import { chessRec, enemyRec } from '../helpers/battleHarness.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const enabled = process.env.SP_E2E === '1' && existsSync(CHROME);
const OUT = fileURLToPath(new URL('../e2e/out/', import.meta.url));

function rulesCheck(S, ds) {
  const spec = S.buildBattleSpec({ seed: 19, kind: 'normal', modeId: 'mode_multi_normal', round: 1,
    stageId: 'act2autochess_m01', timeLimit: 60, players: [{ playerId: 'p1', bandId: 'band_clementia',
      units: Array.from({ length: 5 }, (_, i) => ({ uid: i + 1, chessId: 'alliance_fixture',
        row: i < 2 ? 10 : 12, col: i < 2 ? 3 + i : 2 * i, dir: 'RIGHT' })),
      bonds: { egirShip: { count: 5, active: true, tier: 2, layers: 0 } } }] });
  const b = S.createBattleFromSpec(spec, ds, { quiet: true }); b.autoFinish = false; b.start(); b.step();
  const [source, food] = b.allyUnits;
  const initialShield = !!source.findBuff('band:band_clementia:barrier');
  for (const u of b.allyUnits) u.profile.noAttack = true;
  const e = b.spawnEnemy('alliance_target', { pos: [food.tileR, food.tileC + 1] }); b.step();
  b.forceAttack(source);
  const relayDamage = e.s.maxHp - e.hp;
  while (b.time < 15.01) b.step();
  const hp = source.hp;
  const high = b.dealDamage(null, source, { amount: 3000, type: 'true' });
  const loss = hp - source.hp;
  const next = b.dealDamage(null, source, { amount: 2000, type: 'true' });
  const low = b.dealDamage(null, food, { amount: 2999, type: 'true' });
  return { initialShield, relayDamage, blocked: !!e.blockedBy, high, loss, next, low, errors: b.errors };
}

test('one live bond paragraph, active colors, changing numbers, merged details; browser combat matches Node',
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
        const update = (count, layers) => page.evaluate(({ count, layers }) => globalThis.__MOCK__.mutate(s => {
          const ids = ['chess_char_3_05_a', 'chess_char_2_07_a', 'chess_char_1_04_a', 'chess_char_4_12_a', 'chess_char_5_13_a'];
          s.priv.board = ids.slice(0, count).map((id, i) => ({ uid: 500 + i, kind: 'chess', id, row: 10, col: 3 + i, items: [] }));
          s.priv.hand.fill(null); s.layers.egirShip = layers;
        }), { count, layers });
        await update(3, 0);
        await page.click('.bslot[data-bond="egirShip"] .bond');
        await page.waitForSelector('[data-bond-effect="egirShip"]');
        const read = () => page.$eval('[data-bond-effect="egirShip"]', p => ({
          text: p.textContent, paragraphs: p.parentElement.querySelectorAll('p').length,
          clauses: [...p.querySelectorAll('.bpop__clause')].map(c => ({ active: c.classList.contains('is-active'),
            color: getComputedStyle(c).color, values: [...c.querySelectorAll('.bpop__value')].map(v => ({ text: v.textContent, color: getComputedStyle(v).color })) })),
        }));
        let got = await read();
        assert.equal(got.paragraphs, 1);
        assert.deepEqual(got.clauses.map(c => c.active), [true, false]);
        assert.notEqual(got.clauses[0].color, got.clauses[1].color);
        assert.notEqual(got.clauses[0].values[0].color, got.clauses[1].values[0].color);
        assert.match(got.text, /生命值\+35%.*基础攻击力的80%/);
        await update(3, 100);
        await page.waitForFunction(() => document.querySelector('[data-bond-effect="egirShip"]')?.textContent.includes('基础攻击力的140%'));
        got = await read(); assert.match(got.text, /生命值\+135%/);
        await page.waitForSelector('.pbanner--overlay', { hidden: true });
        await page.screenshot({ path: `${OUT}/alliance-description-${width}.png` });
        await update(5, 100);
        await page.waitForFunction(() => document.querySelectorAll('.bpop__clause.is-active').length === 2);
        await page.click('.bpop__close');
        await page.waitForSelector('.bpop', { hidden: true });
        await page.click('.bslot[data-bond="egirShip"] .bond');
        const member = await page.$('.bpop__member[title^="归溟幽灵鲨"]'); await member.click();
        await page.waitForSelector('.dpanel .dgarrison');
        const traits = await page.$$eval('.dpanel .dgarrison', els => els.map(e => ({ text: e.textContent, ids: e.dataset.garrisonSources })));
        assert.equal(traits.length, 3);
        assert.ok(traits.some(g => /阿戈尔】层数\+5.*不屈】层数\+10/.test(g.text)));
        assert.equal(traits.flatMap(g => g.ids.split(' ')).length, 4);
        await page.waitForSelector('.pbanner--overlay', { hidden: true });
        await page.screenshot({ path: `${OUT}/alliance-traits-${width}.png` });
        if (width === 1920) {
          const fixture = chessRec({ id: 'alliance_fixture', skill: null, bonds: ['egirShip'], rangeGrid: [], stats: { atk: 1000, maxHp: 50000, def: 0 } });
          const target = enemyRec({ key: 'alliance_target', hp: 100000, atk: 0, speed: 0 });
          const ds = new DataSource({ ...DATA, chess: { ...DATA.chess, alliance_fixture: fixture }, enemies: { ...DATA.enemies, alliance_target: target } }, null);
          const expected = rulesCheck({ buildBattleSpec, createBattleFromSpec }, ds);
          const actual = await page.evaluate(async (src, fixture, target) => {
            const { loadBrowserSim } = await import('/js/battle/runner.js');
            const { spec: S, ds } = await loadBrowserSim();
            const { DataSource } = await import('/sim/simdata.js');
            const view = new DataSource({ ...ds.raw, chess: { ...ds.raw.chess, alliance_fixture: fixture }, enemies: { ...ds.raw.enemies, alliance_target: target } }, null);
            return new Function(`return (${src})`)()(S, view);
          }, rulesCheck.toString(), fixture, target);
          assert.deepEqual(actual, expected);
          assert.equal(actual.initialShield, true);
          assert.equal(actual.blocked, false); assert.ok(actual.relayDamage > 0);
          assert.deepEqual([actual.high, actual.loss, actual.next, actual.low], [0, 1500, 2000, 1499.5]);
          assert.deepEqual(actual.errors, []);
        }
        assert.deepEqual(errors, []); await page.close();
      }
    } finally { await browser.close(); await srv.close(); }
  });
