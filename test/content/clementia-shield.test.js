import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { DATA, makeMatch } from '../match/harness.js';

const key = 'band:band_clementia:barrier';
function field(kind = 'normal', bandId = 'band_clementia') {
  const h = makeBattle({ kind, bandId, defs: {
    chess: { op: chessRec({ id: 'op', skill: null, bonds: [], stats: { maxHp: 50000, def: 1000 } }) },
    enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0 }) },
  }, units: [{ uid: 1, chessId: 'op', row: 10, col: 4 }, { uid: 2, chessId: 'op', row: 12, col: 4 }],
    autoFinish: false, hooks: ['damaged', 'kill'], captureNoisy: true });
  h.step();
  for (const u of h.allies()) u.profile.noAttack = true;
  return h;
}
const hit = (h, amount, type = 'true') => h.b.dealDamage(null, h.unit(1), { amount, type, canDodge: false });

test('barrier appears at battle start, refreshes every 15 seconds without stacking and protects each operator once', () => {
  const h = field();
  assert.ok(h.unit(1).findBuff(key));
  assert.ok(h.unit(2).findBuff(key));
  assert.equal(hit(h, 2000), 1000);
  assert.equal(hit(h, 2000), 2000);
  h.run(14.9);
  assert.equal(h.unit(1).findBuff(key), null);
  h.run(.1);
  assert.ok(h.unit(1).findBuff(key));
  assert.ok(h.unit(2).findBuff(key));
  h.run(15);
  assert.equal(h.unit(1).buffs.filter(b => b.key === key).length, 1);
  const hp = h.unit(1).hp;
  assert.equal(hit(h, 2000), 1000);
  assert.equal(h.unit(1).hp, hp - 1000);
  assert.equal(hit(h, 2000), 2000);
  assert.ok(h.unit(2).findBuff(key));
  h.run(15);
  assert.equal(hit(h, 2000), 1000);
  checkInvariants(h.b);
});

for (const delay of [0, 15]) for (const amount of [2999, 3000, 3001, 100000]) test(`barrier boundary ${amount} at ${delay}s: high damage includes exactly 3000`, () => {
  const h = field(); if (delay) h.run(delay);
  const hp = h.unit(1).hp;
  assert.equal(hit(h, amount), amount < 3000 ? amount / 2 : 0);
  assert.equal(h.unit(1).hp, hp - (amount < 3000 ? amount / 2 : 1500));
  assert.equal(h.unit(1).findBuff(key), null);
  checkInvariants(h.b);
});

test('barrier measures mitigated damage, HP loss bypasses it and high-hit loss can kill', () => {
  const h = field(); h.run(15);
  assert.equal(hit(h, 3999, 'phys'), 1499.5);
  h.run(15);
  const u = h.unit(1), hp = u.hp;
  h.b.loseHp(u, 200);
  assert.ok(u.findBuff(key));
  assert.equal(hit(h, 4000, 'phys'), 0);
  assert.equal(u.hp, hp - 1700);
  h.run(15); u.hp = 1000;
  hit(h, 3000);
  assert.equal(u.alive, false);
  checkInvariants(h.b);
});

test('barrier skips retreated operators and works in shared combat without requiring Aegir', () => {
  for (const kind of ['normal', 'unite']) {
    const h = field(kind);
    assert.ok(h.unit(1).findBuff(key));
    assert.equal(h.b.dealDamage(null, h.unit(2), { amount: 1000, type: 'true' }), 500);
    h.b.retreat(h.unit(2)); h.run(15);
    assert.ok(h.unit(1).findBuff(key));
    assert.equal(h.unit(2).findBuff(key), null);
    assert.equal(hit(h, 3000), 0);
    assert.deepEqual(h.result().perPlayer.p1.layerGains, {});
    checkInvariants(h.b);
  }
  const plain = field('normal', null);
  assert.equal(plain.unit(1).findBuff(key), null);
  plain.run(15);
  assert.equal(hit(plain, 3000), 3000);
});

test('Clementia no longer grants recruits from devours between rounds', () => {
  const data = structuredClone(DATA);
  for (const b of Object.values(data.config.bans)) if (typeof b === 'object') { b.core = 0; b.addon = 0; }
  const h = makeMatch({ mode: 'solo', fake: true, data, seed: 41 }).start(); h.toPrep(1);
  const ps = h.ps('p_0'); ps.bandId = 'band_clementia'; ps.counters = {};
  h.m.dispatch(ps, 'onBattleResult', { result: { egirDevoured: 20 } });
  h.m.round = 2; h.m.dispatch(ps, 'onRoundStart', { round: 2 });
  assert.equal(ps.counters['band:clementia:pending'], undefined);
  assert.equal(ps.counters['band:clementia:devoured'], undefined);
  h.m.dispose();
});
