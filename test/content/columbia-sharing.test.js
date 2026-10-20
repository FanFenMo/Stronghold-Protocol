import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { columbiaTechItemId } from '../../shared/columbia.js';

const ID = 'columbiaShip';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' ~= ' + b);
function field(loadouts = {}, { layers = 0, tier = 2, definitions = {} } = {}) {
  const chess = Object.fromEntries(Array.from({ length: 6 }, (_, i) => ['op' + i, chessRec({
    id: 'op' + i, bonds: [ID], skill: null, rangeGrid: [[0, 0]],
    stats: { atk: 100, maxHp: 10000, blockCnt: 0 },
  })]));
  const h = makeBattle({ autoFinish: false, timeLimit: 1000,
    defs: { chess: { ...chess, ...definitions }, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1000000, atk: 0, speed: 0 }) } },
    units: Array.from({ length: 6 }, (_, i) => ({ chessId: 'op' + i, row: 10, col: 2 + i, items: loadouts[i] ?? [] })),
    bonds: { [ID]: { active: tier > 0, tier, count: tier === 2 ? 6 : 3, layers } },
    enemies: [{ key: 'dummy', pos: [10, 9] }],
  });
  h.step(); assert.deepEqual(h.b.errors, []); return h;
}

test('六人档不再共享普通装备，自身装备仍享受三人增幅', () => {
  const h = field({ 0: ['chess_item_1_01_e_a'], 1: ['chess_item_1_01_e_b'] });
  close(h.unit('op0').s.atk, 122.5); close(h.unit('op1').s.atk, 137.5); close(h.unit('op2').s.atk, 100);
  for (const u of h.b.allyUnits) assert.equal(u.findBuff('bond:columbiaShip:equipmentShare'), null);
});

test('三人档初始装备增幅50%，每百层再加30%，未激活时不放大', () => {
  for (const [layers, tier, expected] of [[0, 1, 122.5], [100, 1, 127], [500, 1, 145], [500, 0, 115]]) {
    const h = field({ 0: ['chess_item_1_01_e_a'] }, { layers, tier });
    close(h.unit('op0').s.atk, expected); close(h.unit('op1').s.atk, 100);
  }
});

test('战斗内层数增长立即更新已有装备，重复刷新不叠加', () => {
  const h = field({ 0: ['chess_item_1_01_e_b'] });
  close(h.unit('op0').s.atk, 137.5);
  h.b.getPlayer('p1').bonds[ID].layers = 500;
  h.b.emit('layerGain', { playerId: 'p1', bondId: ID, layers: 500 });
  close(h.unit('op0').s.atk, 175); close(h.unit('op1').s.atk, 100);
  h.run(0.5); close(h.unit('op0').s.atk, 175);
});

test('六人档源石溶剂保留原装备代价，不再对其他成员扣血', () => {
  const h = field({ 0: ['chess_item_1_05_e_a'] });
  h.run(1.05);
  close(h.unit('op0').hp, 9940);
  for (let i = 1; i < 6; i++) close(h.unit('op' + i).hp, 10000);
});

test('双星完整借用保留，其他四人不获得通用装备加成', () => {
  const definition = (id, charId, gid) => ({ ...chessRec({ id, charId, bonds: [ID], skill: null,
    rangeGrid: [[0, 0]], stats: { atk: 100, maxHp: 10000, blockCnt: 0 } }), garrisonIds: [gid] });
  const h = field({ 1: ['chess_item_1_01_e_a'] }, { definitions: {
    op0: definition('op0', 'char_274_astesi', 'garrison_custom_twin_chess_columbia_astesi_a'),
    op1: definition('op1', 'char_135_halo', 'garrison_custom_twin_chess_columbia_halo_a'),
  } });
  h.run(0.3);
  close(h.unit('op0').s.atk, 122.5); close(h.unit('op1').s.atk, 122.5); close(h.unit('op2').s.atk, 100);
});

test('相邻灰质引擎不递归汇总借来的攻击，时间推移与层数重算结果稳定', () => {
  const item = columbiaTechItemId('graymatter');
  const h = field({ 0: [item], 1: [item] }, { tier: 1 });
  h.run(0.5);
  close(h.unit('op0').s.atk, 205.1875); close(h.unit('op1').s.atk, 227.6875);
  h.run(1);
  close(h.unit('op0').s.atk, 205.1875); close(h.unit('op1').s.atk, 227.6875);
  assert.deepEqual(h.b.errors, []);
});
