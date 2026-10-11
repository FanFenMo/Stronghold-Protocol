import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { DATA, makeMatch } from '../match/harness.js';

const on = (active = true) => ({ count: active ? 3 : 0, active, tier: active ? 1 : 0, layers: 0 });
const gains = h => h.result().perPlayer.p1.layerGains;
function field(id, opts = {}) {
  const h = makeBattle({
    defs: { chess: { ally: chessRec({ id: 'ally', bonds: [], skill: null }), ...(opts.chess || {}) },
      enemies: { target: enemyRec({ key: 'target', hp: 100, speed: 0 }) } },
    units: opts.units || [{ uid: 1, chessId: id, row: 10, col: 4, dir: 'UP' }, { uid: 2, chessId: 'ally', row: 12, col: 8 }],
    bonds: opts.bonds || Object.fromEntries([...DATA.chess[id].bonds, 'sargonShip'].map(b => [b, on()])),
    kind: opts.kind, autoFinish: false,
  });
  h.step();
  for (const u of h.allies()) { u.profile.noAttack = true; if (u.skill) u.skill.rule = 'NEVER'; }
  return h;
}
function enemyKill(h, unit = h.unit(1)) {
  const victim = h.spawn('target', { pos: [10, 8] });
  h.b.dealDamage(unit, victim, { amount: 1000, type: 'phys', isAttack: true, canDodge: false });
  assert.ok(!victim.alive);
}

for (const [id, per, cap] of [['chess_char_3_05_a', 2, 18], ['chess_char_3_05_b', 4, 36]]) {
  test(`Skadi ${id}: enemy attack kills retain gains to own active bonds and round caps`, () => {
    const h = field(id), own = DATA.chess[id].bonds;
    for (let n = 1; n <= 20; n++) {
      enemyKill(h);
      assert.deepEqual(gains(h), Object.fromEntries(own.map(b => [b, Math.min(n * per, cap)])));
    }
    assert.equal(gains(h).sargonShip, undefined);
    checkInvariants(h.b);
  });
}

for (const [suffix, mul] of [['a', 1], ['b', 2]]) {
  const shark = `chess_char_2_07_${suffix}`, doll = `chess_char_5_13_${suffix}`;
  test(`Specter ${suffix}: each attributed enemy kill gives Aegir only; cap ${20 * mul}, fresh next round`, () => {
    const h = field(shark);
    for (let n = 1; n <= 60; n++) {
      enemyKill(h);
      const expected = Math.min(n * mul, 20 * mul);
      assert.deepEqual(gains(h), expected ? { egirShip: expected } : {});
    }
    assert.equal(h.unit(1).stats.kills, 60);
    h.b.kill(h.unit(2), h.unit(1));
    assert.deepEqual(gains(h), { egirShip: 20 * mul }, 'devouring an ally is not an enemy kill');
    const next = field(shark);
    enemyKill(next);
    assert.deepEqual(gains(next), { egirShip: mul });
    const off = field(shark, { bonds: { egirShip: on(false), steadShip: on() } });
    for (let i = 0; i < 10; i++) enemyKill(off);
    assert.deepEqual(gains(off), {}, 'inactive Aegir cannot gain; other active bonds receive nothing');
    checkInvariants(h.b); checkInvariants(next.b); checkInvariants(off.b);
  });

  test(`Specter and Specter alter ${suffix}: acquire grants specific layers without activation`, () => {
    const data = structuredClone(DATA);
    for (const b of Object.values(data.config.bans)) if (typeof b === 'object') { b.core = 0; b.addon = 0; }
    const h = makeMatch({ fake: true, data, seed: 41 }).start(); h.toPrep(1);
    const ps = h.ps('p_0');
    ps.bandId = null; ps.layers = {}; ps.recompute();
    assert.ok(ps.acquireChess(shark, { source: 'test' }));
    assert.equal(ps.layers.egirShip, 2 * mul);
    assert.equal(ps.layers.steadShip || 0, 0);
    assert.ok(ps.acquireChess(doll, { source: 'test' }));
    assert.equal(ps.layers.egirShip, 6 * mul);
    assert.equal(ps.layers.indomShip, 6 * mul);
    h.m.dispose();
  });

  test(`Specter alter ${suffix}: kill stacking and fixed doll gains coexist, independent of row count`, () => {
    for (const rowCount of [1, 2, 3, 4]) {
      const h = field(doll, { units: [{ uid: 1, chessId: doll, row: 10, col: 2, dir: 'UP' },
        ...Array.from({ length: rowCount - 1 }, (_, i) => ({ uid: i + 2, chessId: 'ally', row: 10, col: 4 + i * 2 }))] });
      const u = h.unit(1);
      for (let i = 0; i < 5; i++) enemyKill(h);
      assert.deepEqual(gains(h), { egirShip: 10 * mul });
      h.b.emit('dollSwitch', { unit: u, done: false });
      assert.equal(u.trait.doll, true);
      assert.deepEqual(gains(h), { egirShip: 15 * mul, indomShip: 10 * mul });
      h.run(21);
      assert.equal(u.trait.doll, false);
      assert.deepEqual(gains(h), { egirShip: 15 * mul, indomShip: 10 * mul }, 'returning to body adds nothing');
      h.b.emit('dollSwitch', { unit: u, done: false });
      assert.deepEqual(gains(h), { egirShip: 20 * mul, indomShip: 20 * mul });
      checkInvariants(h.b);
    }
  });

  test(`Specter alter ${suffix}: inactive bonds do not gain, and kill cap does not consume doll gains`, () => {
    const h = field(doll, { units: [
      { uid: 1, chessId: doll, row: 10, col: 2, dir: 'UP' },
      { uid: 2, chessId: 'ally', row: 10, col: 4 },
      { uid: 3, chessId: 'ally', row: 12, col: 6 },
    ], bonds: { egirShip: on(), indomShip: on(false) } });
    h.b.retreat(h.unit(2));
    h.b.emit('dollSwitch', { unit: h.unit(1), done: false });
    assert.deepEqual(gains(h), { egirShip: 5 * mul });
    h.run(21); h.b.redeploy(h.unit(2), { free: true });
    h.b.emit('dollSwitch', { unit: h.unit(1), done: false });
    assert.deepEqual(gains(h), { egirShip: 10 * mul });
    for (let i = 0; i < 40; i++) enemyKill(h);
    assert.deepEqual(gains(h), { egirShip: 40 * mul });
    const next = field(doll);
    enemyKill(next);
    assert.deepEqual(gains(next), { egirShip: 2 * mul });
    checkInvariants(h.b);
  });
}

test('Specter round caps belong to each operator instance', () => {
  const id = 'chess_char_2_07_a';
  const h = field(id, { units: [{ uid: 1, chessId: id, row: 10, col: 4, dir: 'UP' }, { uid: 2, chessId: id, row: 12, col: 4, dir: 'UP' }] });
  for (const uid of [1, 2]) for (let n = 0; n < 50; n++) enemyKill(h, h.unit(uid));
  assert.deepEqual(gains(h), { egirShip: 40 });
  checkInvariants(h.b);
});
