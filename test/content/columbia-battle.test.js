import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { columbiaTechItemId } from '../../shared/columbia.js';
import { itemGrants } from '../../server/sim/content/items/battle.js';
import { acquireTargets } from '../../server/sim/ai.js';

const ID = 'columbiaShip';
const tech = columbiaTechItemId;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' ~= ' + b);
const record = (id, more = {}) => chessRec({ id, bonds: [ID], skill: null,
  stats: { atk: 0, maxHp: 2000, blockCnt: 0, def: 0 }, ...more });
function field(items, tier = 1, extra = {}) {
  const filler = Object.fromEntries(Array.from({ length: 4 }, (_, i) => ['filler' + i, record('filler' + i)]));
  const { defs = {}, ...rest } = extra;
  const h = makeBattle({ autoFinish: false, timeLimit: 1000,
    defs: { ...defs, chess: { carrier: record('carrier'), patient: record('patient'), ...filler, ...defs.chess },
      enemies: { dummy: enemyRec({ key: 'dummy', hp: 100000, speed: 0, atk: 0 }), ...defs.enemies } },
    bonds: { [ID]: { count: tier === 2 ? 6 : 3, tier, active: tier > 0, layers: 0 } },
    units: [{ chessId: 'carrier', row: 10, col: 4, items }, { chessId: 'patient', row: 10, col: 5 },
      ...[[11, 4], [12, 3], [12, 4], [12, 5]].map(([row, col], i) => ({ chessId: 'filler' + i, row, col }))],
    enemies: [{ key: 'dummy', pos: [10, 8] }], ...rest });
  h.step(); return h;
}

test('基础效果在未激活盟约时生效，三人档不激活任何旧专属效果', () => {
  for (const tier of [0, 1]) {
    const shield = field([tech('shield')], tier);
    close(shield.unit('carrier').s.maxHp, tier ? 5000 : 4000);
    close(shield.unit('carrier').s.def, 0); close(shield.unit('carrier').s.res, 0);
    const map = field([tech('mapland')], tier), patient = map.unit('patient');
    close(map.unit('carrier').s.atk, tier ? 300 : 200);
    close(map.unit('carrier').s.aspd, tier ? 175 : 150);
    patient.hp = 500;
    map.b.dealDamage(map.unit('carrier'), map.b.enemies[0], { amount: 100, type: 'true' });
    close(patient.hp, 500);
    const gray = field([tech('graymatter')], tier);
    gray.b.dealDamage(gray.unit('carrier'), gray.b.enemies[0], { amount: 1000, type: 'true', isAttack: true });
    close(gray.b.enemies[0].elem.neural, 0);
    close(gray.unit('carrier').findBuff('item:' + tech('graymatter') + ':growth').mods.atkPct, 0);
    assert.deepEqual(shield.b.errors, []); assert.deepEqual(map.b.errors, []); assert.deepEqual(gray.b.errors, []);
  }
});

test('六人档激活灰质引擎伤害叠攻与神经损伤，成员退场即停止', () => {
  const h = field([tech('graymatter')], 2);
  const u = h.unit('carrier'), e = h.b.enemies[0];
  h.b.dealDamage(u, e, { amount: 1000, type: 'true', isAttack: true });
  assert.ok(e.elem.neural > 0);
  close(u.findBuff('item:' + tech('graymatter') + ':growth').mods.atkPct, 0.015);
  h.b.kill(h.unit('filler3'));
  close(u.findBuff('item:' + tech('graymatter') + ':growth').mods.atkPct, 0);
  const before = e.elem.neural;
  h.b.dealDamage(u, e, { amount: 1000, type: 'true', isAttack: true });
  close(e.elem.neural, before);
});

test('梅兰德仅在六人档治疗最低生命百分比成员，基础攻速与攻击保持', () => {
  const h = field([tech('mapland')], 2);
  const u = h.unit('carrier'), patient = h.unit('patient'), e = h.b.enemies[0];
  patient.hp = 500;
  h.b.dealDamage(u, e, { amount: 100, type: 'true' });
  close(patient.hp, 522.5);
  h.b.kill(h.unit('filler3'));
  h.b.dealDamage(u, e, { amount: 100, type: 'true' });
  close(patient.hp, 522.5);
  close(u.s.atk, 300); close(u.s.aspd, 175);
});

test('拓荒者基础攻击与四格光环保留，六人档第三次攻击开始叠伤', () => {
  const h = field([tech('pioneer')], 2), u = h.unit('carrier'), e = h.b.enemies[0];
  u.base.atk = 100; u.markDirty();
  close(u.s.atk, 400); close(h.unit('patient').s.atk, 112.5);
  const damage = [];
  for (let i = 0; i < 3; i++) {
    const before = e.hp; h.b.forceAttack(u, [e]); damage.push(before - e.hp);
  }
  close(damage[0], 490); close(damage[1], 490); close(damage[2], 496);
  h.b.kill(h.unit('filler3'));
  const before = e.hp; h.b.forceAttack(u, [e]); close(before - e.hp, 400);
});

test('多维尔基础治疗+50%，六人档才扩散，扩散不递归', () => {
  for (const tier of [1, 2]) {
    const h = field([tech('dover')], tier), u = h.unit('carrier'), patient = h.unit('patient');
    u.hp = 1000; patient.hp = 1000;
    h.b.heal(u, u, 100);
    close(u.hp, 1175); close(patient.hp, tier === 2 ? 1039.375 : 1000);
    assert.deepEqual(h.b.errors, []);
  }
});

test('多维尔治疗人数始终只加一，三人增幅不增加治疗人数或攻击目标', () => {
  const h = field([tech('dover')], 1, {
    defs: { chess: { carrier: record('carrier', { rangeGrid: [[0, 0], [0, 1], [1, 0]] }) } },
    bonds: { [ID]: { count: 3, tier: 1, active: true, layers: 500 } },
  });
  for (const name of ['carrier', 'patient', 'filler0']) h.unit(name).hp = 500;
  const u = h.unit('carrier');
  close(u.s.healTargets, 1); close(u.s.maxTargets, 0); close(u.s.healingDealtMul, 2.5);
  assert.equal(acquireTargets(h.b, u, { heal: { mode: 'single' }, dmgType: 'heal' }).length, 2);
});

test('反重力基础延长技能并回技力，六人档才提供技能范围光环', () => {
  for (const tier of [1, 2]) {
    const h = field([tech('antigrav')], tier, { defs: { chess: {
      carrier: record('carrier', { rangeGrid: [[0, 0], [0, 1]],
        skill: { spCost: 100, duration: 10, trigger: { rule: 'NEVER' } } }),
    } } });
    const u = h.unit('carrier'), patient = h.unit('patient');
    close(u.skill.duration, 14.5); close(u.s.spRecovery, 1.375);
    u.skill.activate('test', { free: true });
    close(u.skill.timeLeft, 14.5);
    close(patient.s.aspd, tier === 2 ? 160 : 100);
    h.run(14.7);
    close(patient.s.aspd, 100); close(u.s.spRecovery, 1.375);
    assert.deepEqual(h.b.errors, []);
  }
});

test('护盾基础生命、阻挡及八格生命光环保留，六人档退出撤销双抗', () => {
  const h = field([tech('shield')], 2), u = h.unit('carrier');
  close(u.s.maxHp, 5000); close(u.s.blockCnt, 5);
  close(h.unit('patient').s.maxHp, 2750);
  close(u.s.def, 45); close(u.s.res, 30);
  h.b.kill(h.unit('filler3'));
  close(u.s.def, 0); close(u.s.res, 0); close(u.s.maxHp, 5000);
});

test('灰质引擎仅汇总上下左右四格的攻击，排除对角线且不递归借攻', () => {
  const h = field([tech('graymatter')], 1, { defs: { chess: {
    patient: record('patient', { stats: { atk: 100, maxHp: 2000, blockCnt: 0 } }),
    filler0: record('filler0', { stats: { atk: 200, maxHp: 2000, blockCnt: 0 } }),
  } } });
  close(h.unit('carrier').s.atk, 67.5);
  h.b.kill(h.unit('patient'));
  h.run(0.2); close(h.unit('carrier').s.atk, 45);
});

test('谬因真实弹药按两发叠层，多目标攻击不多计，跨技能累计且分别检查盟约激活', () => {
  for (const [suffix, mul] of [['a', 1], ['b', 2]]) {
    for (const active of [[], [ID], ['preciShip'], [ID, 'preciShip']]) {
      const id = `chess_columbia_aphris_${suffix}`;
      const bonds = Object.fromEntries([ID, 'preciShip'].map(bond => [bond,
        { active: active.includes(bond), tier: active.includes(bond) ? 1 : 0, count: active.includes(bond) ? 3 : 0, layers: 0 }]));
      const h = makeBattle({ autoFinish: false, timeLimit: 1000, bonds,
        defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 10000000, atk: 0, speed: 0 }) } },
        units: [{ chessId: id, row: 9, col: 2, skillIndex: 2 }],
        enemies: [{ key: 'dummy', pos: [12, 9] }, { key: 'dummy', pos: [12, 10] }],
      });
      h.step();
      const u = h.unit(id);
      assert.equal(u.skill.kind, 'ammo');
      assert.equal(u.skill.activate('test', { free: true }), true);
      h.run(3.1);
      const shoot = () => h.b.forceAttack(u, h.b.enemies);
      const gains = () => h.result().perPlayer.p1.layerGains;
      shoot();
      assert.deepEqual(gains(), {}, '一发子弹即使命中多个目标也不触发');
      shoot();
      const expected = pairs => Object.fromEntries(active.map(bond => [bond, pairs * mul * (bond === ID ? 1 : 2)]));
      assert.deepEqual(gains(), expected(1));
      shoot();
      u.skill.end('test');
      assert.equal(u.skill.activate('test', { free: true }), true);
      h.run(3.1);
      shoot();
      assert.equal(h.hooksOf('ammoUsed').filter(c => c.unit === u).length, 4);
      assert.deepEqual(gains(), expected(2), '上一轮技能剩余的一发耗弹进度继续累计');
      assert.deepEqual(h.b.errors, []);
    }
  }
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

test('科技装备在战斗中也拒绝非哥伦比亚干员，即使六人档已激活', () => {
  const h = field([tech('shield'), tech('graymatter')], 2, { enemies: [], defs: { chess: {
    carrier: record('carrier', { bonds: [] }), patient: record('patient'),
  } } });
  const u = h.unit('carrier');
  close(u.s.maxHp, 2000); close(u.s.aspd, 100); close(u.s.atk, 0);
  assert.deepEqual(h.b.errors, []);
});
