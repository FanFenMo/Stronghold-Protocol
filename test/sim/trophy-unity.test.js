import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function linked() {
  const h = makeBattle({ content: 'none', autoFinish: false,
    defs: { chess: {
      unity_a: chessRec({ id: 'unity_a', skill: null, stats: { maxHp: 1000, atk: 200, def: 0 } }),
      unity_b: chessRec({ id: 'unity_b', skill: null, stats: { maxHp: 3000, atk: 1000, def: 0 } }),
    } },
    players: [{ playerId: 'p1', trophyUnity: true, units: [
      { uid: 1, chessId: 'unity_a', row: 10, col: 4 }, { uid: 2, chessId: 'unity_b', row: 10, col: 5 },
    ] }, { playerId: 'p2', units: [{ uid: 3, chessId: 'unity_b', row: 11, col: 5 }] }],
  });
  h.b.start();
  return { h, b: h.b, a: h.unit(1), c: h.unit(2), other: h.unit(3) };
}

test('伤害减免一次后进入共享生命池，不同生命上限的干员始终保持同一百分比，治疗同步恢复', () => {
  const { b, a, c, other } = linked();
  near(b.dealDamage(null, a, { amount: 1000, type: 'true' }), 700);
  near(a.hp, 825); near(c.hp, 2475);
  near(a.hpRatio, c.hpRatio);
  near(other.hp, other.s.maxHp);
  near(b.heal(other, a, 400), 400);
  near(a.hp, 925); near(c.hp, 2775);
  near(b.heal(other, c, 10000), 300);
  near(a.hpRatio, 1); near(c.hpRatio, 1);
  checkInvariants(b); assert.deepEqual(b.errors, []);
});

test('命中者护盾在分摊之前吸收，其他成员不会再次减免或扣护盾', () => {
  const { b, a, c } = linked();
  b.addBuff(a, { key: 'barrier-a', shield: 100 });
  b.addBuff(c, { key: 'barrier-c', shield: 500 });
  near(b.dealDamage(null, a, { amount: 1000, type: 'true' }), 600);
  near(a.hp, 850); near(c.hp, 2550);
  near(c.findBuff('barrier-c').shield, 500);
});

test('攻击力实时跟随技能装备增益，也随增益结束下降，不会把共享后的攻击力重复放大', () => {
  const { b, a, c, other } = linked();
  near(a.s.atk, 1000); near(c.s.atk, 1000);
  b.addBuff(c, { key: 'skill', mods: { atkPct: 1 } });
  near(a.s.atk, 2000); near(c.s.atk, 2000);
  b.addBuff(a, { key: 'equipment', mods: { atkFlat: 2500 } });
  near(c.s.atk, 2700); near(a.s.atk, 2700);
  for (let i = 0; i < 30; i++) { a.markDirty(); c.markDirty(); near(a.s.atk, 2700); near(c.s.atk, 2700); }
  b.removeBuff(a, 'equipment'); near(a.s.atk, 2000);
  b.removeBuff(c, 'skill'); near(a.s.atk, 1000);
  near(other.s.atk, 1000);
});

test('共享生命归零时全员同帧倒下，个人致死拦截和击杀回满不能把一人独立留下', () => {
  const { b, a, c, other } = linked();
  b.on('fatal', ctx => { ctx.prevented = true; ctx.unit.hp = 1; });
  b.on('kill', ({ victim }) => { if (victim === a) victim.hp = victim.s.maxHp; });
  b.dealDamage(null, c, { amount: 100000, type: 'true' });
  assert.equal(a.alive, false); assert.equal(c.alive, false);
  assert.equal(a.deathAt, c.deathAt); near(a.hp, 0); near(c.hp, 0);
  assert.equal(other.alive, true);
  checkInvariants(b);
});

test('退场成员不再参与共享，重新部署加入当前百分比，全队倒下后正常再部署开启新生命池', () => {
  const { b, a, c } = linked();
  b.dealDamage(null, a, { amount: 1000, type: 'true' });
  b.retreat(a);
  b.dealDamage(null, c, { amount: 300, type: 'true' });
  near(c.hpRatio, 0.755);
  b._deploy(a, { initial: true });
  near(a.hpRatio, c.hpRatio);
  b.kill(a);
  assert.equal(a.alive, false); assert.equal(c.alive, false);
  b._deploy(a, { initial: true });
  near(a.hpRatio, 1);
  b._deploy(c, { initial: true });
  near(c.hpRatio, 1);
});

test('BattleSpec往返保留同心协议，真实引擎和浏览器所用序列化输入产生一致结果', () => {
  const spec = buildBattleSpec({ stageId: 'act2autochess_m01', kind: 'normal', seed: 89,
    players: [{ playerId: 'p1', trophyUnity: true, units: [
      { uid: 1, chessId: 'chess_char_1_01_a', row: 10, col: 4 }, { uid: 2, chessId: 'chess_char_2_01_a', row: 10, col: 5 },
    ] }], flags: { startOpCooldown: 0 } });
  const first = createBattleFromSpec(spec), second = createBattleFromSpec(JSON.parse(JSON.stringify(spec)));
  for (const battle of [first, second]) {
    battle.start(); const units = battle.allyUnits.filter(u => u.kind === 'op');
    battle.dealDamage(null, units[0], { amount: 500, type: 'true' });
    near(units[0].hpRatio, units[1].hpRatio);
    near(units[0].s.atk, units[1].s.atk);
    assert.deepEqual(battle.errors, []);
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
});
