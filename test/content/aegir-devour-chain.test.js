import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { devourChains } from '../../server/sim/content/bonds/aegirRelay.js';

const bonds = { egirShip: { count: 3, active: true, tier: 1, layers: 0 } };
const defs = { chess: {
  fish_a: chessRec({ id: 'fish_a', bonds: ['egirShip'], skill: null, stats: { maxHp: 10000, atk: 1000, def: 0 } }),
  food_a: chessRec({ id: 'food_a', bonds: [], skill: null, stats: { maxHp: 10000, atk: 500, def: 0 } }),
} };
const fish = (uid, row, col, dir) => ({ uid, kind: 'chess', chessId: 'fish_a', row, col, dir });
const food = (uid, row, col) => ({ uid, kind: 'chess', chessId: 'food_a', row, col, dir: 'RIGHT' });
const hits = h => h.hooksOf('damaged').filter(c => c.dmg.tags.includes('bond:egir:devour'));
const pairs = h => hits(h).map(c => [c.source.uid, c.target.uid]);
const start = opts => {
  const h = makeBattle({ defs, bonds, autoFinish: false, hooks: ['damaged', 'egirDevour'], captureNoisy: true, ...opts });
  h.step();
  return h;
};

for (const kind of ['normal', 'unite', 'boss', 'hidden']) {
  test(`longest devour chain wins even when marked last; independent chains still resolve: ${kind}`, () => {
    // Marking order: 1 → 4, 2 → 1 → 4, 3 → 2 → 1 → 4, then independent 5 → 6.
    const h = start({ kind, units: [
      fish(1, 11, 4, 'UP'), fish(2, 10, 4, 'UP'), fish(3, 10, 5, 'LEFT'), food(4, 12, 4),
      fish(5, 10, 7, 'RIGHT'), food(6, 10, 8),
    ] });
    assert.deepEqual(pairs(h), [[3, 2], [3, 1], [3, 4], [5, 6]]);
    assert.equal(new Set(hits(h).map(c => c.target)).size, hits(h).length);
    assert.equal(h.unit(4).hp, 5000);
    assert.equal(h.unit(6).hp, 5000);
    assert.deepEqual(h.hooksOf('egirDevour').map(c => [c.source.uid, c.target.uid]), pairs(h));
    assert.equal(h.unit(1).s.atk, 1400);
    assert.equal(h.unit(2).s.atk, 2200);
    assert.equal(h.unit(3).s.atk, 3000);
    assert.equal(h.unit(1).s.blockCnt, 4);
    assert.equal(h.unit(2).s.blockCnt, 6);
    assert.equal(h.unit(3).s.blockCnt, 8);
    assert.equal(devourChains(h.b).get(h.unit(2)).get(h.unit(4)), 2);
    assert.equal(devourChains(h.b).get(h.unit(3)).get(h.unit(4)), 3);
    assert.equal(h.b.errorCount, 0);
    checkInvariants(h.b);
  });
}

test('equal-length overlapping chains use the original marking order', () => {
  const h = start({ units: [
    fish(1, 10, 3, 'RIGHT'), fish(2, 11, 4, 'DOWN'), food(3, 10, 4), fish(4, 12, 7, 'RIGHT'),
  ] });
  assert.deepEqual(pairs(h), [[1, 3]]);
  assert.equal(h.unit(3).hp, 5000);
  assert.equal(h.unit(1).s.atk, 1400);
  assert.equal(h.unit(2).s.atk, 1400);
  checkInvariants(h.b);
});

for (const kind of ['unite', 'boss', 'hidden']) {
  test(`overlap selection includes both players before any devour damage: ${kind}`, () => {
    const h = start({ kind, players: [
      { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds, units: [
        fish(1, 10, 9, 'LEFT'), fish(2, 12, 3, 'RIGHT'), fish(3, 12, 7, 'RIGHT'), food(4, 10, 8),
      ] },
      { playerId: 'p2', seat: 1, side: 'L', colOffset: 8, bonds, units: [
        fish(5, 10, 2, 'LEFT'), fish(6, 12, 3, 'RIGHT'), fish(7, 12, 5, 'RIGHT'),
      ] },
    ] });
    assert.deepEqual(pairs(h), [[5, 1], [5, 4]]);
    assert.equal(h.unit(4).hp, 5000);
    assert.equal(h.unit(1).hp, h.unit(1).s.maxHp - 5000);
    assert.ok(h.hooksOf('egirDevour').every(c => c.playerId === 'p2'));
    assert.equal(h.unit(1).s.atk, 1400);
    assert.equal(h.unit(5).s.atk, 2200);
    assert.equal(h.b.errorCount, 0);
    checkInvariants(h.b);
  });
}

test('a cyclic layout terminates and damages each retained-chain target once', () => {
  const h = start({ units: [
    fish(1, 10, 3, 'RIGHT'), fish(2, 10, 4, 'LEFT'), fish(3, 12, 7, 'RIGHT'),
  ] });
  assert.deepEqual(pairs(h), [[1, 2]]);
  assert.equal(h.unit(1).hp, h.unit(1).s.maxHp);
  assert.equal(h.unit(2).hp, h.unit(2).s.maxHp - 5000);
  checkInvariants(h.b);
});
