import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { makeMatch, give, DATA } from '../match/harness.js';
import { columbiaTechItemId } from '../../shared/columbia.js';
import { itemGrants } from '../../server/sim/content/items/battle.js';


const ID = 'columbiaShip';
const tech = columbiaTechItemId;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ~= ${b}`);
const record = (id, more = {}) => chessRec({ id, bonds: [ID], skill: null,
  stats: { atk: 0, maxHp: 2000, blockCnt: 0 }, ...more });
function field(items, tier = 1, extra = {}) {
  const h = makeBattle({ autoFinish: false, timeLimit: 1000,
    defs: { chess: { carrier: record('carrier'), patient: record('patient') },
      enemies: { dummy: enemyRec({ key: 'dummy', hp: 100000, speed: 0, atk: 0 }) } },
    bonds: { [ID]: { count: tier === 2 ? 6 : 3, tier, active: true, layers: 0 } },
    units: [{ chessId: 'carrier', row: 10, col: 4, items }, { chessId: 'patient', row: 10, col: 5 }],
    enemies: [{ key: 'dummy', pos: [10, 8] }], ...extra });
  h.step(); return h;
}

test('三人档真实层数入口发装，跨多个里程碑不重复且最多六件', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start().toPrep(1), ps = h.ps('p_0');
  h.m.gd.modeInactiveBonds.delete(ID);
  for (const [id, tile] of [['chess_columbia_quartz_a', [10, 3]], ['chess_columbia_halo_a', [10, 4]], ['chess_char_2_02_a', [10, 5]]]) give(h.m, ps, id, 'board', tile);
  ps.recompute();
  assert.equal(ps.bonds[ID].tier, 1);
  ps.addLayers(ID, 50);
  assert.equal(ps.columbiaTech.length, 1);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.addLayers(ID, 250);
  assert.equal(ps.columbiaTech.length, 6);
  assert.equal(new Set(ps.columbiaTech).size, 6);
  ps.addLayers(ID, 100);
  assert.equal(ps.columbiaTech.length, 6);
});

test('六人档两件科技装备只给一次50攻速；灰质引擎累计真实伤害并产生神经损伤', () => {
  const h = field([tech('graymatter'), tech('pioneer')], 2);
  const u = h.unit('carrier'), e = h.b.enemies[0];
  close(u.s.aspd, 150);
  close(u.s.atk, 0);
  h.b.dealDamage(u, e, { amount: 1000, type: 'true', isAttack: true });
  assert.ok(e.elem.neural > 0);
  close(u.findBuff(`item:${tech('graymatter')}:atk`).mods.atkPct, 0.92);
});

test('梅兰德治疗最低生命比例成员并叠加削攻，持续时间结束后恢复', () => {
  const h = field([tech('mapland')]);
  const u = h.unit('carrier'), patient = h.unit('patient'), e = h.b.enemies[0];
  patient.hp = 500;
  h.b.dealDamage(u, e, { amount: 100, type: 'true' });
  close(patient.hp, 515);
  assert.equal(e.findBuff(`item:${tech('mapland')}:atkDown`).stacks, 1);
  h.run(15.1);
  assert.equal(e.findBuff(`item:${tech('mapland')}:atkDown`), null);
});

test('拓荒者按攻击次数提升倍率，第三次攻击开始获得首层加成', () => {
  const h = field([tech('pioneer')]), u = h.unit('carrier'), e = h.b.enemies[0];
  u.base.atk = 100; u.markDirty();
  const damage = [];
  for (let i = 0; i < 3; i++) {
    const before = e.hp;
    h.b.forceAttack(u, [e]);
    damage.push(before - e.hp);
  }
  close(damage[0], 115); close(damage[1], 115); close(damage[2], 116);
});

test('多维尔按实际治疗扩散，扩散治疗不会再次扩散', () => {
  const h = field([tech('dover')]), u = h.unit('carrier'), patient = h.unit('patient');
  u.hp = 1000; patient.hp = 1000;
  h.b.heal(u, u, 100);
  close(u.hp, 1120);
  close(patient.hp, 1018);
});

test('反重力在开技能时浮空，光环随技能结束移除', () => {
  const h = field([tech('antigrav')], 1, {
    defs: { chess: { carrier: record('carrier', { rangeGrid: [[0, 0], [0, 1]],
      skill: { spCost: 100, duration: 10, trigger: { rule: 'NEVER' } } }), patient: record('patient') },
      enemies: { dummy: enemyRec({ key: 'dummy', hp: 100000, speed: 0, atk: 0 }) } },
    enemies: [{ key: 'dummy', pos: [10, 5] }],
  });
  const u = h.unit('carrier'), patient = h.unit('patient'), e = h.b.enemies[0];
  u.skill.activate('test', { free: true });
  assert.equal(e.s.flags.levitate, true);
  close(patient.s.aspd, 140);
  h.run(10.2);
  close(patient.s.aspd, 100);
});

test('过载护盾增加生命与双抗，锁血窗口内存活且结束后可以死亡', () => {
  const h = field([tech('shield')]);
  const u = h.unit('carrier');
  close(u.s.maxHp, 4000);
  close(u.s.res, 24);
  h.b.dealDamage(null, u, { type: 'true', amount: 5000 });
  assert.equal(u.alive, true);
  assert.equal(u.hp, 1);
  h.run(6.1);
  h.b.dealDamage(null, u, { type: 'true', amount: 5000 });
  assert.equal(u.alive, false);
});

test('双星是干员特性：两名星源不产生共享，星极可分别与两种星源联动', () => {
  for (const partner of ['chess_columbia_halo_a', 'chess_char_6_16_a']) {
    const h = makeBattle({ autoFinish: false, bonds: {}, units: [
      { chessId: 'chess_columbia_astesi_a', row: 10, col: 4 },
      { chessId: partner, row: 10, col: 5, items: ['chess_item_1_01_e_a'] },
    ] });
    h.step();
    assert.ok(itemGrants(h.b, h.unit('chess_columbia_astesi_a')).some(g => g.lent));
  }
  const h = makeBattle({ autoFinish: false, units: [
    { chessId: 'chess_columbia_halo_a', row: 10, col: 4 },
    { chessId: 'chess_char_6_16_a', row: 10, col: 5, items: ['chess_item_1_01_e_a'] },
  ] });
  h.step();
  assert.equal(itemGrants(h.b, h.unit('chess_columbia_halo_a')).some(g => g.lent), false);
});

test('双星共享装备与重叠范围；同伴离场后移除共享效果，保留其他范围来源', () => {
  const astesi = { ...record('star', { charId: 'char_274_astesi', rangeGrid: [[0, 0], [0, 1]] }),
    garrisonIds: ['garrison_custom_twin_chess_columbia_astesi_a'] };
  const halo = { ...record('halo', { charId: 'char_135_halo', rangeGrid: [[0, 0], [0, 1]] }),
    garrisonIds: ['garrison_custom_twin_chess_columbia_halo_a'] };
  const h = makeBattle({ autoFinish: false, defs: { chess: { star: astesi, halo } },
    units: [{ chessId: 'star', row: 10, col: 4 }, { chessId: 'halo', row: 10, col: 5, items: ['chess_item_1_01_e_a'] }] });
  h.step();
  const a = h.unit('star'), b = h.unit('halo');
  assert.ok(itemGrants(h.b, a).some(g => g.id === 'chess_item_1_01_e_a' && g.lent));
  assert.ok(a.rangeKeySet.has(10 * 21 + 6));
  h.b.setExtraRange(a, [10 * 21 + 8], 'other');
  h.b.kill(b);
  h.run(0.2);
  assert.equal(itemGrants(h.b, a).some(g => g.lent), false);
  assert.equal(a.rangeKeySet.has(10 * 21 + 6), false);
  assert.equal(a.rangeKeySet.has(10 * 21 + 8), true);
});

test('双星只联动同一玩家的在场特性成员，不向队友借用装备', () => {
  const h = makeBattle({ autoFinish: false, kind: 'unite', players: [
    { playerId: 'p1', units: [{ uid: 1, chessId: 'chess_columbia_astesi_a', row: 10, col: 4 }], bonds: {} },
    { playerId: 'p2', units: [{ uid: 2, chessId: 'chess_columbia_halo_a', row: 10, col: 5, items: ['chess_item_1_01_e_a'] }], bonds: {} },
  ] });
  h.step();
  assert.equal(itemGrants(h.b, h.unit(1)).some(g => g.lent), false);
  assert.deepEqual(h.b.errors, []);
});

test('科技装备在战斗中也拒绝非哥伦比亚干员，即使盟约已过载', () => {
  const h = field([tech('shield'), tech('graymatter')], 2, { enemies: [], defs: { chess: {
    carrier: record('carrier', { bonds: [] }), patient: record('patient'),
  } } });
  const u = h.unit('carrier');
  close(u.s.maxHp, 2000); close(u.s.aspd, 100); close(u.s.atk, 0);
  assert.deepEqual(h.b.errors, []);
});
