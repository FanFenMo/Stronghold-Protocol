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
