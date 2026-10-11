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

function devourField({ kind = 'normal', bandId = 'band_clementia', def = 0, chain = false, foodHp = 4000, teammateBand } = {}) {
  const shared = teammateBand !== undefined;
  const markerUnits = [
    { uid: 1, kind: 'chess', chessId: 'marker_a', row: 10, col: shared ? 9 : 3, dir: 'RIGHT' },
    { uid: 2, kind: 'chess', chessId: 'helper_a', row: chain ? 10 : 12, col: chain ? 4 : 3, dir: 'RIGHT' },
    { uid: 3, kind: 'chess', chessId: 'third_a', row: 12, col: 7, dir: 'RIGHT' },
  ];
  const food = { uid: 4, kind: 'chess', chessId: 'food_a', row: 10, col: shared ? 2 : chain ? 5 : 4, dir: 'RIGHT' };
  const bonds = { egirShip: { count: 3, active: true, tier: 1, layers: 0 } };
  const h = makeBattle({ kind, autoFinish: false,
    defs: { chess: {
      marker_a: chessRec({ id: 'marker_a', bonds: ['egirShip'], skill: null, stats: { maxHp: 30000, atk: 1000, def: 0 } }),
      helper_a: chessRec({ id: 'helper_a', bonds: ['egirShip'], skill: null, stats: { maxHp: 30000, atk: 100, def: 0 } }),
      third_a: chessRec({ id: 'third_a', bonds: ['egirShip'], skill: null, stats: { maxHp: 30000, def: 0 } }),
      food_a: chessRec({ id: 'food_a', bonds: [], skill: null, stats: { maxHp: foodHp, atk: 500, def } }),
    } },
    players: [
      { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bandId, bonds, units: shared ? markerUnits : [...markerUnits, food] },
      ...(shared ? [{ playerId: 'p2', seat: 1, side: 'L', colOffset: 8, bandId: teammateBand, bonds: {}, units: [food] }] : []),
    ],
    hooks: ['damaged', 'egirDevour'], captureNoisy: true,
    setup: b => b.on('battleStart', () => {
      b.addBuff(b.allyUnits.find(u => u.uid === 4), { key: 'test:ordinary', shield: 10000 });
    }, { priority: 100 }),
  });
  h.step();
  for (const u of h.allies()) u.profile.noAttack = true;
  return h;
}

for (const kind of ['normal', 'unite', 'boss', 'hidden']) for (const def of [0, 2000, 2001]) {
  test(`initial Clementia barrier protects Aegir devour after DEF: ${kind}, DEF ${def}`, () => {
    const h = devourField({ kind, def }), food = h.unit(4), marker = h.unit(1);
    const loss = def > 2000 ? (5000 - def) / 2 : 1500;
    assert.equal(food.hp, 4000 - loss);
    assert.ok(food.alive);
    assert.equal(food.findBuff(key), null);
    assert.ok(marker.findBuff(key));
    assert.equal(food.findBuff('test:ordinary').shield, 10000);
    assert.equal(marker.s.atk, 1200);
    assert.equal(marker.s.blockCnt, 4);
    assert.equal(h.hooksOf('egirDevour').length, 1);
    const damage = h.hooksOf('damaged')[0];
    assert.equal(damage.amount, loss);
    assert.equal(damage.source, marker);
    assert.ok(damage.dmg.tags.includes('hpLoss') && damage.dmg.tags.includes('bond:egir:devour'));
    assert.equal(h.b.errorCount, 0);
    checkInvariants(h.b);
  });
}

test('devour consumes only one Clementia barrier even when multiple Aegir mark the same food', () => {
  const h = devourField({ chain: true, foodHp: 10000 });
  assert.equal(h.unit(4).hp, 3500);
  assert.deepEqual(h.hooksOf('damaged').filter(c => c.target === h.unit(4)).map(c => c.amount), [1500, 5000]);
  assert.equal(h.unit(1).s.atk, 1240);
  assert.equal(h.unit(2).s.atk, 300);
  assert.equal(h.unit(4).findBuff(key), null);
  assert.equal(h.b.errorCount, 0);
  checkInvariants(h.b);
});

test('shared-field devour uses the food owner\'s barrier, including a teammate whose band installs later', () => {
  for (const [bandId, teammateBand, loss] of [[null, 'band_clementia', 1500], ['band_clementia', null, 5000]]) {
    const h = devourField({ kind: 'unite', bandId, teammateBand, foodHp: 8000 });
    assert.equal(h.unit(4).hp, 8000 - loss);
    assert.equal(h.unit(4).findBuff('test:ordinary').shield, 10000);
    assert.equal(h.unit(4).findBuff(key), null);
    assert.equal(h.unit(1).s.atk, 1200);
    assert.equal(h.b.errorCount, 0);
    checkInvariants(h.b);
  }
  const plain = devourField({ bandId: null });
  assert.equal(plain.unit(4).alive, false);
  assert.equal(plain.b.errorCount, 0);
  checkInvariants(plain.b);
});

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
