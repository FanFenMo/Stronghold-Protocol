import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getData } from '../../server/data.js';

const DATA = getData({ log: { warn() {}, error() {}, info() {} } });
const on = (active = true) => ({ count: active ? 3 : 0, active, tier: active ? 1 : 0, layers: 0 });
const cases = [
  ['chess_char_3_05_a', 2, 20], ['chess_char_3_05_b', 4, 30],
  ['chess_char_2_07_a', 2, 20], ['chess_char_2_07_b', 4, 30],
  ['chess_char_5_13_a', 3, 30], ['chess_char_5_13_b', 6, 54],
];
const gains = (h) => h.result().perPlayer.p1.layerGains;

function field(id, opts = {}) {
  const h = makeBattle({
    defs: {
      chess: { ally: chessRec({ id: 'ally', bonds: [], skill: null }), ...(opts.chess || {}) },
      enemies: { target: enemyRec({ key: 'target', hp: 100, speed: 0 }) },
    },
    units: [{ uid: 1, chessId: id, row: 10, col: 4 }, { uid: 2, chessId: 'ally', row: 12, col: 8 }],
    bonds: opts.bonds || Object.fromEntries([...DATA.chess[id].bonds, 'sargonShip'].map((b) => [b, on()])),
    autoFinish: false,
  });
  h.step();
  h.unit(1).profile.noAttack = true;
  h.unit(2).profile.noAttack = true;
  return h;
}

function burnKill(h, unit = h.unit(1)) {
  const victim = h.spawn('target', { pos: [10, 8] });
  h.b.dealDamage(unit, victim, { amount: 1000, type: 'true', canDodge: false, tags: ['bond:egir:burn'] });
  assert.ok(!victim.alive);
}

for (const [id, per, cap] of cases) {
  test(`${DATA.chess[id].name} ${id.slice(-1)}: attributed true burn kills grant +${per} to own active bonds, capped at ${cap} per round`, () => {
    const h = field(id);
    const own = DATA.chess[id].bonds;
    burnKill(h);
    assert.deepEqual(gains(h), Object.fromEntries(own.map((b) => [b, per])));
    assert.equal(h.unit(1).stats.kills, 1, 'true damage credits the operator');
    assert.equal(h.hooksOf('kill')[0].killer, h.unit(1));
    for (let n = 2; n <= 20; n++) {
      burnKill(h);
      assert.deepEqual(gains(h), Object.fromEntries(own.map((b) => [b, Math.min(n * per, cap)])));
    }
    assert.equal(h.unit(1).stats.kills, 20);
    assert.equal(gains(h).sargonShip, undefined, 'an active bond the operator does not own receives nothing');
    const next = field(id);
    burnKill(next);
    assert.deepEqual(gains(next), Object.fromEntries(own.map((b) => [b, per])), 'the next round has a fresh cap');
    checkInvariants(h.b);
    checkInvariants(next.b);
  });

  test(`${DATA.chess[id].name} ${id.slice(-1)}: consuming an ally and being knocked out grant no kill-trait layers`, () => {
    const h = field(id);
    h.b.kill(h.unit(2), h.unit(1));
    assert.deepEqual(gains(h), {}, 'an allied operator is not an enemy kill');
    h.b.dealDamage(null, h.unit(1), { amount: 1e9, type: 'true' });
    h.step();
    assert.deepEqual(gains(h), {}, 'own knock-out or body → doll adds no layers');
    if (DATA.chess[id].subProfessionId === 'dollkeeper') {
      assert.equal(h.unit(1).trait.doll, true);
      h.run(21);
      assert.equal(h.unit(1).trait.doll, false);
      assert.deepEqual(gains(h), {}, 'doll → body adds no layers');
    }
    checkInvariants(h.b);
  });
}

test('阿戈尔 kill traits use the operator\'s current bonds: an added active bond gains layers, an inactive owned bond does not', () => {
  const id = 'chess_char_3_05_a';
  const h = field(id, {
    chess: { [id]: { ...DATA.chess[id], bonds: ['egirShip', 'steadShip', 'yanShip'] } },
    bonds: { egirShip: on(), steadShip: on(false), yanShip: on(), raidShip: on() },
  });
  burnKill(h);
  assert.deepEqual(gains(h), { egirShip: 2, yanShip: 2 });
  checkInvariants(h.b);
});

test('阿戈尔 kill-trait caps belong to each operator instance, even for copies of the same operator', () => {
  const id = 'chess_char_3_05_a';
  const h = makeBattle({
    defs: { enemies: { target: enemyRec({ key: 'target', hp: 100, speed: 0 }) } },
    units: [{ uid: 1, chessId: id, row: 10, col: 4 }, { uid: 2, chessId: id, row: 12, col: 4 }],
    bonds: { egirShip: on(), steadShip: on(), raidShip: on() }, autoFinish: false,
  });
  h.step();
  for (const uid of [1, 2]) for (let n = 0; n < 12; n++) burnKill(h, h.unit(uid));
  assert.deepEqual(gains(h), { egirShip: 40, steadShip: 40, raidShip: 40 });
  checkInvariants(h.b);
});
