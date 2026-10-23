import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';

function field(level, opts = {}) {
  return makeBattle({ modeId: 'mode_multi_abyss', flags: { ultimateLevel: level }, content: 'none',
    units: [{ chessId: 'op_test', row: 10, col: 5, uid: 1 }, { chessId: 'op_test', row: 10, col: 6, uid: 2 }],
    defs: { chess: { op_test: chessRec({ id: 'op_test', stats: { maxHp: 10000, atk: 500, res: 50 }, skill: null }) },
      enemies: { enemy_test: enemyRec({ hp: 1000, atk: 200, speed: 1 }) } }, ...opts });
}

test('enemy ATK/HP/speed and operator base ATK unlock cumulatively; n0 preserves base stats', () => {
  for (const n of [0, 1, 2, 4, 5, 8]) {
    const h = field(n);
    const e = h.spawn('enemy_test', { mods: { hpMul: 2, atkMul: 3, speedMul: 1.5 } });
    assert.ok(Math.abs(e.base.atk - 600 * (n >= 1 ? 1.1 : 1)) < 1e-8);
    assert.ok(Math.abs(e.base.maxHp - 2000 * (n >= 2 ? 1.15 : 1)) < 1e-8);
    assert.ok(Math.abs(e.base.moveSpeed - 1.5 * (n >= 4 ? 1.1 : 1)) < 1e-8);
    assert.equal(h.unit(1).base.atk, n >= 5 ? 450 : 500);
  }
});

test('summoned enemies and leaked enemies receive the level multiplier once per field', () => {
  const normal = field(5), unite = field(5, { kind: 'unite' });
  const spawned = normal.spawn('enemy_test', { mods: { hpMul: 2, atkMul: 3, speedMul: 1.5 } });
  const carried = unite.spawn('enemy_test', { mods: spawned.mods });
  assert.equal(carried.base.atk, spawned.base.atk);
  assert.equal(carried.base.maxHp, spawned.base.maxHp);
  assert.equal(carried.base.moveSpeed, spawned.base.moveSpeed);
  const summon = normal.spawn('enemy_test');
  assert.ok(Math.abs(summon.base.atk - 220) < 1e-8);
  assert.ok(Math.abs(summon.base.maxHp - 1150) < 1e-8);
});

test('n3 poison lasts three seconds, stacks to three and applies arts damage only on its tile', () => {
  const h = field(3);
  h.b.start();
  const here = h.unit(1), next = h.unit(2);
  for (let i = 0; i < 4; i++) h.b.kill(h.spawn('enemy_test', { pos: [10, 5] }), null);
  h.run(0.9);
  assert.equal(here.hp, 10000, 'first tick is after one second');
  h.run(0.2);
  assert.equal(here.hp, 9850, 'three 100-arts hits each reduced by 50 RES');
  h.run(2);
  assert.equal(here.hp, 9550, 'each of the three layers ticks exactly three times');
  assert.equal(next.hp, 10000, 'the neighboring tile is safe');
  h.run(2);
  assert.equal(here.hp, 9550, 'all layers have expired');
  h.b.kill(h.spawn('enemy_test', { pos: [10, 5] }), null);
  h.run(3.1);
  assert.equal(here.hp, 9400, 'an expired pool accepts a fresh layer');
});

test('n0–n2 deaths and leaked enemies create no poison', () => {
  for (const n of [0, 1, 2, 3]) {
    const h = field(n);
    h.b.start();
    const e = h.spawn('enemy_test', { pos: [10, 5] });
    if (n === 3) h.b._remove(e, 'leak');
    else h.b.kill(e, null);
    h.run(3.1);
    assert.equal(h.unit(1).hp, 10000);
  }
});

test('BattleSpec keeps the level through JSON and both simulation constructions use it', () => {
  const h = field(8);
  const spec = buildBattleSpec({ ...h.b.opts, stageId: null, battleId: 'test.n8', fieldId: 'test' });
  const remote = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), h.b.data, { content: 'none' });
  assert.equal(spec.flags.ultimateLevel, 8);
  assert.equal(remote.ultimate.enemyAtk, 1.1);
  assert.equal(remote.ultimate.enemyHp, 1.15);
  assert.equal(remote.allyUnits[0].base.atk, h.unit(1).base.atk);
  assert.deepEqual(remote.ultimate, h.b.ultimate);
});

test('n9 HP and n10 dual defense apply once, including summons and unite carry', () => {
  for (const n of [8, 9, 10, 15, 16]) {
    const h = field(n), e = h.spawn('enemy_test', { mods: { hpMul: 2, defMul: 3, resMul: 2 } });
    assert.ok(Math.abs(e.base.maxHp - 2000 * 1.15 * (n >= 9 ? 1.2 : 1)) < 1e-8);
    const def = field(n, { kind: 'unite' }).spawn('enemy_test', { mods: e.mods });
    assert.deepEqual(def.base, e.base);
  }
  const h = field(10, { defs: { enemies: { enemy_test: enemyRec({ def: 100, res: 20 }) } } });
  const e = h.spawn('enemy_test');
  assert.ok(Math.abs(e.base.def - 110) < 1e-8); assert.equal(e.base.res, 22);
});

test('n13 attack and n14 defense reduce final operator attributes without stacking on redeploy', () => {
  for (const level of [12, 13, 14, 16]) {
    const h = field(level); h.b.start(); const u = h.unit(1);
    h.b.addBuff(u, { key: 'test:stats', persist: true, mods: { atkFlat: 100, atkPct: 1, defFlat: 100, defPct: 1 } });
    assert.equal(u.s.atk, 1100 * (level >= 13 ? 0.9 : 1));
    assert.equal(u.s.def, 600 * (level >= 14 ? 0.9 : 1));
    h.b.emit('deploy', { unit: u, initial: false });
    assert.equal(u.s.atk, 1100 * (level >= 13 ? 0.9 : 1));
  }
});

test('middle boss and escorts reuse R14 stats at half HP and 80% ATK; n16 buffs only leaders', () => {
  for (const n of [12, 16]) {
    const h = field(n, { round: 12 });
    const escort = h.spawn('enemy_test');
    assert.ok(Math.abs(escort.base.maxHp - 1000 * 1.15 * 1.2 * 0.5) < 1e-8);
    assert.ok(Math.abs(escort.base.atk - 200 * 1.1 * 0.8) < 1e-8);
    const boss = h.spawn('enemy_test', { tag: 'boss' });
    assert.ok(Math.abs(boss.base.atk - escort.base.atk * (n === 16 ? 1.5 : 1)) < 1e-8);
  }
});

test('n16 enemies and bosses no longer reflect damage in any round', () => {
  for (const round of [12, 19, 20, 21]) {
    const h = field(16, { round }); h.b.start(); const u = h.unit(1);
    h.b.addBuff(u, { key: 'shield', shield: 1e6 });
    const e = h.spawn('enemy_test', { pos: [10, 5] });
    const dealt = h.b.dealDamage(u, e, { amount: 1e5, type: 'phys', canDodge: false });
    assert.ok(dealt > 0);
    assert.equal(u.hp, 10000);
    h.b.dealDamage(u, h.spawn('enemy_test', { tag: 'boss' }), { amount: 100, type: 'arts', canDodge: false });
    assert.equal(u.hp, 10000, 'bosses do not reflect either');
    const before = u.hp;
    h.b.loseHp(h.spawn('enemy_test'), 100, { source: u });
    assert.equal(u.hp, before, 'HP drain cannot trigger reflection');
    assert.equal(h.b.errorCount, 0);
  }
});

test('n16 leaders keep n10 defense and take 30% less physical, arts, true and elemental damage', () => {
  for (const round of [12, 20, 21]) {
    for (const level of [15, 16]) {
      const h = field(level, { round, defs: { enemies: { enemy_test: enemyRec({ hp: 1e6, def: 100, res: 20 }) } } });
      h.b.start();
      const boss = h.spawn('enemy_test', { tag: 'boss' }), escort = h.spawn('enemy_test');
      assert.equal(boss.base.def, escort.base.def);
      assert.equal(boss.base.res, escort.base.res);
      h.b.removeBuff(boss, 'ultimate:trueShield');
      for (const type of ['phys', 'arts', 'true', 'elemental']) {
        const ordinary = h.b.dealDamage(h.unit(1), escort, { amount: 1000, type, canDodge: false });
        const reduced = h.b.dealDamage(h.unit(1), boss, { amount: 1000, type, canDodge: false });
        assert.ok(Math.abs(reduced - ordinary * (level === 16 ? 0.7 : 1)) < 1e-8, `${round}: ${type}`);
      }
      assert.equal(h.b.errorCount, 0);
    }
  }
});

test('n16 bosses have 30-hit true-only shields, restored every 60 game seconds', () => {
  const h = field(16, { kind: 'boss', round: 20, timeLimit: Infinity });
  h.b.start(); const u = h.unit(1);
  for (const ally of h.b.allyUnits) ally.profile.noAttack = true;
  const e = h.spawn('enemy_test', { tag: 'boss', mods: { hpMul: 1000 } });
  e.profile.noAttack = true; e.base.moveSpeed = 0; e.markDirty();
  const hit = type => h.b.dealDamage(u, e, { amount: 10, type, canDodge: false });
  assert.ok(hit('phys') > 0); assert.ok(hit('arts') > 0); assert.ok(hit('elemental') > 0);
  for (let i = 0; i < 30; i++) assert.equal(hit('true'), 0);
  assert.equal(hit('true'), 7);
  h.run(59.9); assert.equal(hit('true'), 7);
  h.run(0.2); assert.equal(e.findBuff('ultimate:trueShield').shieldHits, 30);
  assert.equal(hit('true'), 0);
  h.run(60); assert.equal(e.findBuff('ultimate:trueShield').shieldHits, 30, 'refresh replaces remaining charges');
  assert.equal(hit('true'), 0);
  assert.ok(h.b.dealDamage(u, h.spawn('enemy_test'), { amount: 10, type: 'true' }) > 0);
  assert.equal(h.b.errorCount, 0);
});
