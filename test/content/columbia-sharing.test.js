import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { columbiaTechItemId } from '../../shared/columbia.js';

const ID = 'columbiaShip';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ~= ${b}`);
function field(loadouts = {}, { layers = 0, tier = 2, definitions = {}, players } = {}) {
  const chess = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`op${i}`, chessRec({
    id: `op${i}`, bonds: [ID], skill: null, rangeGrid: [[0, 0]],
    stats: { atk: 100, maxHp: 10000, blockCnt: 0 },
  })]));
  const h = makeBattle({ autoFinish: false, timeLimit: 1000,
    defs: { chess: { ...chess, ...definitions }, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1000000, atk: 0, speed: 0 }) } },
    units: Array.from({ length: 6 }, (_, i) => ({ chessId: `op${i}`, row: 10, col: 2 + i, items: loadouts[i] ?? [] })),
    bonds: { [ID]: { active: tier > 0, tier, count: tier === 2 ? 6 : 3, layers } },
    enemies: [{ key: 'dummy', pos: [10, 9] }], ...(players ? { players } : {}),
  });
  h.step(); assert.deepEqual(h.b.errors, []); return h;
}

test('六哥先汇总多件实际装备，再向每人分享5%，自身装备全额叠加', () => {
  const h = field({ 0: ['chess_item_1_01_e_a'], 1: ['chess_item_1_01_e_b'] });
  close(h.unit('op0').s.atk, 117);
  close(h.unit('op1').s.atk, 127);
  close(h.unit('op2').s.atk, 102);
});

test('三哥在零层没有额外增幅，每100层提升30%，未激活时不放大', () => {
  for (const [layers, tier, expected] of [[0, 1, 115], [100, 1, 119.5], [500, 1, 137.5], [500, 0, 115]]) {
    const h = field({ 0: ['chess_item_1_01_e_a'] }, { layers, tier });
    close(h.unit('op0').s.atk, expected); close(h.unit('op1').s.atk, 100);
  }
});

test('战斗内层数增长立即刷新自身与共享属性，重复刷新不累计', () => {
  const h = field({ 0: ['chess_item_1_01_e_b'] });
  close(h.unit('op1').s.atk, 101.25);
  h.b.getPlayer('p1').bonds[ID].layers = 500;
  h.b.emit('layerGain', { playerId: 'p1', bondId: ID, layers: 500 });
  close(h.unit('op0').s.atk, 165.625); close(h.unit('op1').s.atk, 103.125);
  h.run(0.5); close(h.unit('op1').s.atk, 103.125);
});

test('有限加速器分享实际已叠攻速的2.5%，上限仍为60层', () => {
  const h = field({ 0: ['chess_item_4_03_e_b'] }, { layers: 500 });
  const u = h.unit('op0');
  for (let i = 0; i < 65; i++) h.b.emit('attack', { attacker: u, targets: [] });
  close(u.s.aspd, 407.5); close(h.unit('op1').s.aspd, 107.5);
  assert.equal(u.findBuff('item:chess_item_4_03_e_b:stacks').stacks, 60);
});

test('源石溶剂共享代价每人每秒30，携带者不叠加旧代价，多件不重复扣血', () => {
  const h = field({ 0: ['chess_item_1_05_e_a'], 1: ['chess_item_1_05_e_b'] });
  h.run(1.05);
  for (let i = 0; i < 6; i++) close(h.unit(`op${i}`).hp, 9970);
  close(h.unit('op2').s.atk, 105);
});

test('科技装备与其他盟约专属装备均不参与六哥共享', () => {
  const h = field({ 0: [columbiaTechItemId('shield'), columbiaTechItemId('graymatter'), 'chess_item_6_02_e_a'] }, { layers: 100 });
  const other = h.unit('op1');
  close(other.s.maxHp, 10000); close(other.s.atk, 100); close(other.s.res, 0); close(other.s.aspd, 100);
  close(h.unit('op0').s.res, 30);
});

test('不共享装备的基础属性也不进入共享池', () => {
  for (const id of ['chess_item_2_01_e_a', 'chess_item_3_03_e_a', 'chess_item_4_02_e_a',
    'chess_item_4_04_e_a', 'chess_item_4_05_e_a', 'chess_item_4_07_e_a', 'chess_item_4_08_e_a',
    'chess_item_4_10_e_a', 'chess_item_4_11_e_a', 'chess_item_4_12_e_a', 'chess_item_6_09_e_a']) {
    const h = field({ 0: [id] });
    const u = h.unit('op1'); close(u.s.maxHp, 10000); close(u.s.aspd, 100); close(u.s.resIgnorePct, 0);
    assert.equal(u.findBuff('bond:columbiaShip:equipmentShare'), null, id);
  }
});

test('阿戈尔重刃分享攻击增幅但共享攻速固定减10', () => {
  const h = field({ 0: ['chess_item_3_07_e_a'] }, { layers: 500 });
  close(h.unit('op0').s.atk, 205); close(h.unit('op1').s.atk, 105);
  close(h.unit('op0').s.aspd, 80); close(h.unit('op1').s.aspd, 90);
});

test('叙拉古正装只分享自身攻速，保留原携带者左右光环', () => {
  const h = field({ 0: ['chess_item_3_01_e_a'] });
  close(h.unit('op0').s.aspd, 115.75);
  close(h.unit('op3').s.aspd, 100.75);
});

test('四种重锤只分享允许的属性，加速重锤分享攻速，锁血战栗灼燃不扩散', () => {
  for (const [id, atk, aspd] of [
    ['chess_item_2_03_e_a', 101, 100], ['chess_item_3_09_e_a', 101.25, 100],
    ['chess_item_3_10_e_a', 101.25, 101.5], ['chess_item_4_09_e_a', 101.5, 100],
  ]) {
    const h = field({ 0: [id] }), u = h.unit('op1');
    close(u.s.atk, atk); close(u.s.aspd, aspd);
    h.b.dealDamage(null, u, { type: 'true', amount: 20000 }); assert.equal(u.alive, false);
  }
});

test('休眠子裔的共享治疗按接收者最大生命计算', () => {
  const h = field({ 0: ['chess_item_4_06_e_a'] }), u = h.unit('op1');
  u.hp = 5000; h.b.emit('attack', { attacker: u, targets: [h.b.enemies[0]] }); close(u.hp, 5010);
});

test('共享精准狙击镜保留三格条件，双模机械臂不分享弱点转换', () => {
  const h = field({ 0: ['chess_item_3_02_e_a', 'chess_item_5_03_e_a'] }), u = h.unit('op1'), e = h.b.enemies[0];
  const dmg = { type: 'phys', mul: 1 }; h.b.emit('hit', { source: u, target: e, dmg });
  close(dmg.mul, 1.015); assert.equal(dmg.type, 'phys'); close(u.s.atk, 101.5);
  e.x = u.x + 1; e.y = u.y;
  const near = { type: 'phys', mul: 1 }; h.b.emit('hit', { source: u, target: e, dmg: near }); close(near.mul, 1);
});

test('六哥成员离场跌破六名时撤销共享，自身装备效果保留', () => {
  const h = field({ 0: ['chess_item_1_01_e_a'] });
  h.b.kill(h.unit('op5')); h.run(0.2);
  close(h.unit('op0').s.atk, 115); close(h.unit('op1').s.atk, 100);
});

test('双星完整借用与六哥5%可叠加，借来的装备不再次入池', () => {
  const definition = (id, charId, gid) => ({ ...chessRec({ id, charId, bonds: [ID], skill: null,
    rangeGrid: [[0, 0]], stats: { atk: 100, maxHp: 10000, blockCnt: 0 } }), garrisonIds: [gid] });
  const h = field({ 1: ['chess_item_1_01_e_a'] }, { definitions: {
    op0: definition('op0', 'char_274_astesi', 'garrison_custom_twin_chess_columbia_astesi_a'),
    op1: definition('op1', 'char_135_halo', 'garrison_custom_twin_chess_columbia_halo_a'),
  } });
  h.run(0.3);
  close(h.unit('op0').s.atk, 115.75); close(h.unit('op1').s.atk, 115.75); close(h.unit('op2').s.atk, 100.75);
  h.run(0.3); close(h.unit('op2').s.atk, 100.75);
});
