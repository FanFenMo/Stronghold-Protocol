import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { acquireTargets, effectiveProfile } from '../../server/sim/ai.js';
import { TICK } from '../../server/sim/constants.js';
import { DATA } from '../match/harness.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fight({ depth = 2, count = 5, layers = 0, bandId, source = {}, terminal = {} } = {}) {
  const chess = {}, units = [];
  for (let i = 0; i <= depth; i++) {
    const id = `g${i}_a`;
    chess[id] = chessRec({ id, bonds: ['egirShip'], skill: null, rangeGrid: [],
      stats: { atk: i ? 100 : 1000, maxHp: 1e6, def: 0, blockCnt: 2 },
      ...(i === 0 ? source : i === depth ? terminal : {}) });
    units.push({ chessId: id, row: 10, col: 3 + i, dir: 'RIGHT' });
  }
  for (let i = depth + 1; i < count; i++) {
    const id = `g${i}_a`;
    chess[id] = chessRec({ id, bonds: ['egirShip'], skill: null, rangeGrid: [], stats: { maxHp: 1e6 } });
    units.push({ chessId: id, row: 12, col: 2 * (i - depth), dir: 'UP' });
  }
  const h = makeBattle({ defs: { chess, enemies: {
    dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 100 }),
    ranged: enemyRec({ key: 'ranged', hp: 1e8, speed: 0, range: 2 }),
    fly: enemyRec({ key: 'fly', hp: 1e8, speed: 0, motion: 'FLY' }),
  } }, units, bandId, bonds: { egirShip: { count, active: count >= 3, tier: count >= 5 ? 2 : 1, layers } },
    hooks: ['damaged', 'kill', 'attack', 'attackStart', 'spGain'], captureNoisy: true, autoFinish: false, timeLimit: 180 });
  h.step();
  for (const u of h.allies()) u.profile.noAttack = true;
  const u = h.unit('g0_a'), food = h.unit(`g${depth}_a`);
  const e = h.spawn('dummy', { pos: [food.tileR, food.tileC] });
  h.step();
  assert.equal(e.blockedBy, food);
  return { h, u, food, e };
}
const hits = (h, u) => h.hooksOf('damaged').filter(c => c.source === u && c.target.side === 'enemy');
const kill = (h, u) => {
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  if (u.alive) h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.equal(u.alive, false);
};

test('five-member relay replaces true burn; four do not relay, five/six do, every consumer qualifies', () => {
  for (const count of [4, 5, 6]) {
    const { h, u, e } = fight({ count });
    h.b.addBuff(h.unit('g3_a'), { key: 'test:strongest', mods: { atkFlat: 9999 } });
    h.b.addBuff(h.unit(`g${count - 1}_a`), { key: 'test:second', mods: { atkFlat: 9998 } });
    assert.equal(h.b.forceAttack(u), count >= 5);
    const got = hits(h, u);
    assert.equal(got.length, count >= 5 ? 1 : 0);
    if (got.length) { assert.equal(got[0].dmg.type, 'phys'); close(got[0].amount, (u.s.atk - e.s.def) * .64); }
    h.run(30);
    assert.equal(h.hooksOf('damaged').filter(c => c.dmg.tags.includes('bond:egir:burn')).length, 0);
    checkInvariants(h.b);
  }
});

test('one, two and three original hops reduce final damage to 80%, 64% and 51.2% after DEF', () => {
  for (const depth of [1, 2, 3]) {
    const { h, u, e } = fight({ depth });
    assert.ok(h.b.forceAttack(u));
    close(hits(h, u)[0].amount, (u.s.atk - e.s.def) * .8 ** depth);
    assert.equal(hits(h, u)[0].dmg.type, 'phys');
    checkInvariants(h.b);
  }
});

test('dead intermediate nodes preserve living front blockers and their ORIGINAL hop count', () => {
  const { h, u, e, food } = fight({ depth: 3 });
  kill(h, h.unit('g1_a')); kill(h, h.unit('g2_a'));
  assert.ok(food.alive);
  assert.ok(h.b.forceAttack(u));
  close(hits(h, u).at(-1).amount, (u.s.atk - e.s.def) * .512);
  // Killing the terminal blocker stops relay; bringing that same operator back resumes its original depth.
  kill(h, food);
  assert.equal(h.b.forceAttack(u), false);
  assert.ok(h.b.redeploy(food, { free: true })); h.step();
  assert.equal(e.blockedBy, food); assert.ok(h.b.forceAttack(u));
  close(hits(h, u).at(-1).amount, (u.s.atk - e.s.def) * .512);
  checkInvariants(h.b);
});

test('an intermediate survivor can relay even when another front node dies; consumer death prevents attacks', () => {
  const { h, u, food, e } = fight({ depth: 3 });
  kill(h, food);
  const middle = h.unit('g1_a'), blocked = h.spawn('dummy', { pos: [middle.tileR, middle.tileC] });
  h.step(); assert.equal(blocked.blockedBy, middle);
  assert.ok(h.b.forceAttack(u));
  assert.equal(hits(h, u).at(-1).target, blocked);
  close(hits(h, u).at(-1).amount, (u.s.atk - blocked.s.def) * .8);
  assert.equal(e.blockedBy, null);
  kill(h, u); assert.equal(h.b.forceAttack(u), false);
  checkInvariants(h.b);
});

test('valid own-range target takes priority at full damage; invalid local targets do not stop relay', () => {
  const { h, u, e } = fight({ source: { rangeGrid: [[0, 0]] } });
  const local = h.spawn('dummy', { pos: [u.tileR, u.tileC] }); h.step();
  assert.ok(h.b.forceAttack(u));
  assert.equal(hits(h, u).at(-1).target, local);
  close(hits(h, u).at(-1).amount, u.s.atk - local.s.def);
  h.b.dealDamage(null, local, { amount: 1e9, type: 'true' });
  h.spawn('fly', { pos: [u.tileR, u.tileC] }); h.step();
  assert.ok(h.b.forceAttack(u)); assert.equal(hits(h, u).at(-1).target, e);
  close(hits(h, u).at(-1).amount, (u.s.atk - e.s.def) * .64);
  checkInvariants(h.b);
});

test('own blocked enemy is a local target even outside the attack grid; ranged enemy never relays', () => {
  const { h, u, food, e } = fight();
  const local = h.spawn('dummy', { pos: [u.tileR, u.tileC] }); h.step();
  assert.equal(local.blockedBy, u);
  assert.ok(h.b.forceAttack(u)); assert.equal(hits(h, u).at(-1).target, local);
  close(hits(h, u).at(-1).amount, u.s.atk - local.s.def);
  h.b.dealDamage(null, local, { amount: 1e9, type: 'true' });
  h.b.dealDamage(null, e, { amount: 1e9, type: 'true' });
  const ranged = h.spawn('ranged', { pos: [food.tileR, food.tileC] }); h.step();
  assert.equal(ranged.blockedBy, food);
  assert.deepEqual(acquireTargets(h.b, u, effectiveProfile(u)), []);
  assert.equal(h.b.forceAttack(u), false);
  checkInvariants(h.b);
});

test('relay uses consumer attack cadence, stats and kill credit without extra attacks', () => {
  const { h, u, e } = fight();
  u.profile.noAttack = false;
  const start = h.b.time;
  h.run(2.1);
  const attacks = h.hooksOf('attack').filter(c => c.attacker === u);
  assert.equal(attacks.length, 3);
  for (let i = 1; i < attacks.length; i++) {
    const interval = attacks[i].t - attacks[i - 1].t;
    assert.ok(interval >= u.s.interval - 1e-9 && interval <= u.s.interval + TICK + 1e-9);
  }
  close(attacks[0].t - start, 0);
  e.hp = 1; h.run(1.1);
  assert.equal(h.hooksOf('kill').at(-1).killer, u);
  assert.equal(u.stats.kills, 1);
  assert.equal(u.stats.attacks, 4);
  close(u.stats.dmg, hits(h, u).slice(0, -1).reduce((s, c) => s + c.amount, 0) + 1);
  checkInvariants(h.b);
});

test('ranged projectile snapshots relay decay before the blocker dies, including splash and multihit', () => {
  const { h, u, food, e } = fight({ depth: 2 });
  Object.assign(u.profile, { attack: 'ranged', projectile: 'arrow', hits: 2, splashRadius: 1, splashScale: .5 });
  const nearby = h.spawn('dummy', { pos: [food.tileR + 1, food.tileC] }); h.step();
  assert.ok(h.b.forceAttack(u));
  assert.equal(hits(h, u).length, 0);
  kill(h, food); h.run(2);
  const primary = hits(h, u).filter(c => c.target === e), splash = hits(h, u).filter(c => c.target === nearby);
  assert.equal(primary.length, 2); assert.equal(splash.length, 1);
  for (const c of primary) close(c.amount, (u.s.atk - e.s.def) * .64);
  close(splash[0].amount, (u.s.atk * .5 - nearby.s.def) * .64);
  assert.equal(new Set(hits(h, u).map(c => c.dmg.attackId)).size, 1);
  checkInvariants(h.b);
});

test('chain attack and arts damage keep their own mitigation and inherit relay decay', () => {
  const { h, u, food, e } = fight();
  e.base.res = 50; e.markDirty();
  Object.assign(u.profile, { dmgType: 'arts', chain: { count: 2, radius: 2, falloff: .15 } });
  const next = h.spawn('dummy', { pos: [food.tileR + 1, food.tileC] }); h.step();
  assert.ok(h.b.forceAttack(u));
  close(hits(h, u).find(c => c.target === e).amount, u.s.atk * .5 * .64);
  close(hits(h, u).find(c => c.target === next).amount, u.s.atk * .85 * .64);
  checkInvariants(h.b);
});

test('non-Aegir food also relays; released/stale blocks and sleeping targets cannot relay', () => {
  const { h, u, food, e } = fight({ depth: 1, terminal: { bonds: [] } });
  assert.ok(h.b.forceAttack(u));
  close(hits(h, u).at(-1).amount, (u.s.atk - e.s.def) * .8);
  h.b.applyStatus(e, 'sleep', { duration: 1 });
  assert.equal(e.blockedBy, null); assert.equal(h.b.forceAttack(u), false);
  h.run(1.2); assert.equal(e.blockedBy, food); assert.ok(h.b.forceAttack(u));
  h.b.retreat(food); assert.equal(h.b.forceAttack(u), false);
  checkInvariants(h.b);
});

for (const suffix of ['a', 'b']) for (let skillIndex = 0; skillIndex < 3; skillIndex++) {
  test(`real Skadi → Specter → Underflow ${suffix} S${skillIndex + 1}: dead Specter still relays at 64% with the selected skill`, () => {
    const ids = ['chess_char_3_05_', 'chess_char_2_07_', 'chess_char_1_04_', 'chess_char_4_12_', 'chess_char_5_13_'].map(id => id + suffix);
    const h = makeBattle({ defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 300 }) } },
      units: ids.map((chessId, i) => ({ chessId, uid: i + 1, skillIndex: i ? undefined : skillIndex,
        row: i < 3 ? 10 : 12, col: i < 3 ? 3 + i : i === 3 ? 2 : 7, dir: i < 3 ? 'RIGHT' : 'UP' })),
      bonds: { egirShip: { count: 5, active: true, tier: 2, layers: 100 } },
      hooks: ['damaged'], captureNoisy: true, autoFinish: false });
    h.step();
    for (const a of h.allies()) { a.profile.noAttack = true; if (a.skill) a.skill.rule = 'NEVER'; }
    const [u, middle, food] = [1, 2, 3].map(id => h.unit(id));
    kill(h, middle); assert.ok(food.alive);
    const e = h.spawn('dummy', { pos: [food.tileR, food.tileC] });
    const control = h.spawn('dummy', { pos: [12, 9] }); h.step();
    assert.equal(e.blockedBy, food);
    if (!u.skill.active) { u.skill.addCharge(1); assert.ok(u.skill.activate('test')); }
    assert.deepEqual(acquireTargets(h.b, u, effectiveProfile(u)), [e]);
    assert.ok(h.b.forceAttack(u, [control]));
    const full = hits(h, u).at(-1).amount;
    assert.ok(h.b.forceAttack(u));
    const relay = hits(h, u).at(-1);
    assert.equal(relay.target, e); close(relay.amount, full * .64);
    assert.deepEqual(h.b.errors, []); checkInvariants(h.b);
  });
}

test('shared-field teammate food and dead intermediate retain original depth independently of the consumer owner', () => {
  // Start a separate real shared field with A → teammate B → teammate C across the two board halves.
  const chess = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => [id, chessRec({ id,
    bonds: ['egirShip'], skill: null, rangeGrid: [], stats: { maxHp: 1e6, atk: 1000, def: 0 } })]));
  const bonds = { egirShip: { count: 5, active: true, tier: 2, layers: 0 } };
  const shared = makeBattle({ kind: 'unite', defs: { chess, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 100 }) } },
    players: [
      { playerId: 'p1', side: 'L', colOffset: 0, bonds, units: [
        { uid: 1, chessId: 'a', row: 10, col: 9, dir: 'RIGHT' },
        ...['d', 'e', 'f', 'g'].map((chessId, i) => ({ uid: i + 2, chessId, row: 12, col: 2 + i * 2, dir: 'UP' })),
      ] },
      { playerId: 'p2', side: 'R', colOffset: 8, bonds: { egirShip: { count: 3, active: true, tier: 1, layers: 0 } }, units: [
        { uid: 10, chessId: 'b', row: 10, col: 2, dir: 'RIGHT' },
        { uid: 11, chessId: 'c', row: 10, col: 3, dir: 'RIGHT' },
      ] },
    ], hooks: ['damaged'], captureNoisy: true, autoFinish: false });
  shared.step();
  for (const a of shared.allies()) a.profile.noAttack = true;
  const u = shared.unit('a'), middle = shared.unit('b'), food = shared.unit('c');
  kill(shared, middle);
  const e = shared.spawn('dummy', { pos: [food.tileR, food.tileC] }); shared.step();
  assert.equal(e.blockedBy, food); assert.ok(shared.b.forceAttack(u));
  close(hits(shared, u).at(-1).amount, (u.s.atk - e.s.def) * .64);
  checkInvariants(shared.b);
});

for (const suffix of ['a', 'b']) for (const [base, skillIndex, tag] of [
  ['chess_char_4_09_', 1, 'talent'], ['chess_char_5_13_', 2, 'ghost2Weight'],
]) {
  test(`${base}${suffix}: attached attack damage inherits the three-hop final multiplier`, () => {
    const id = base + suffix, source = structuredClone(DATA.chess[id]);
    source.stats.maxHp = 1e6; // keep the real attack kit, prevent a swap during this isolated damage comparison
    const chess = { [id]: source };
    for (const foodId of ['food1', 'food2', 'food3', 'filler']) chess[foodId] = chessRec({ id: foodId,
      bonds: ['egirShip'], skill: null, rangeGrid: [], stats: { maxHp: 1e6, def: 0 } });
    const h = makeBattle({ defs: { chess, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 100, res: 40 }) } },
      units: [{ chessId: id, uid: 1, row: 10, col: 3, dir: 'RIGHT', skillIndex },
        ...['food1', 'food2', 'food3'].map((chessId, i) => ({ chessId, uid: i + 2, row: 10, col: 4 + i, dir: 'RIGHT' })),
        { chessId: 'filler', uid: 5, row: 12, col: 2, dir: 'UP' }],
      bonds: { egirShip: { count: 5, active: true, tier: 2, layers: 0 } },
      hooks: ['damaged'], captureNoisy: true, autoFinish: false });
    h.step();
    for (const a of h.allies()) { a.profile.noAttack = true; if (a.skill) a.skill.rule = 'NEVER'; }
    const u = h.unit(1), food = h.unit('food3');
    const e = h.spawn('dummy', { pos: [food.tileR, food.tileC] });
    const control = h.spawn('dummy', { pos: [12, 9] }); h.step();
    u.skill.addCharge(1); assert.ok(u.skill.activate('test')); u.hp = u.s.maxHp;
    assert.deepEqual(acquireTargets(h.b, u, effectiveProfile(u)), [e]);
    assert.ok(h.b.forceAttack(u, [control]));
    const full = hits(h, u).filter(c => c.target === control);
    assert.ok(full.some(c => c.dmg.tags.includes(tag)), 'real attached damage fired');
    assert.ok(h.b.forceAttack(u));
    const relay = hits(h, u).filter(c => c.target === e);
    assert.equal(relay.length, full.length);
    for (let i = 0; i < full.length; i++) close(relay[i].amount, full[i].amount * .512);
    checkInvariants(h.b);
  });
}

test('devour ATK starts at 20%, reaches 80% at 100 layers and grows linearly; block is always added, layers never are', () => {
  for (const bandId of [null, 'band_clementia']) for (const count of [3, 5, 6]) for (const [layers, scale] of [[0,.2],[50,.5],[100,.8],[300,2],[500,3.2],[700,4.4]]) {
    const { h, u, food } = fight({ bandId, count, layers, depth: 1 });
    close(u.s.atk, 1000 + food.base.atk * scale);
    assert.equal(u.s.blockCnt, 4);
    assert.equal(h.b.getPlayer('p1').bonds.egirShip.layers, layers);
    assert.deepEqual(h.result().perPlayer.p1.layerGains, {});
    checkInvariants(h.b);
  }
});
