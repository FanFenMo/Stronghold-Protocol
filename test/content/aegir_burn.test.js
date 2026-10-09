import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const positions = [[10, 4], [12, 2], [12, 4], [12, 6], [12, 8], [10, 8]];
function fight({ count = 5, layers = 100, units, bandId, garrisonId, players } = {}) {
  const chess = Object.fromEntries(positions.map((_, i) => [`g${i}_a`, chessRec({
    id: `g${i}_a`, bonds: ['egirShip'], skill: null, rangeGrid: [],
    stats: { atk: i === 0 ? 2000 : i === 1 ? 1500 : 1000, maxHp: 1e6, def: 0, blockCnt: 2 },
  })]));
  if (garrisonId) chess.g0_a.garrisonIds = [garrisonId];
  const h = makeBattle({
    defs: { chess, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 99999, res: 100 }) } },
    units: units ?? positions.slice(0, count).map(([row, col], i) => ({ chessId: `g${i}_a`, row, col, dir: 'DOWN' })),
    players, bandId, bonds: { egirShip: { count, active: count >= 3, tier: count >= 5 ? 2 : 1, layers } },
    hooks: ['damaged', 'kill'], captureNoisy: true, autoFinish: false, timeLimit: 180,
  });
  h.step();
  return h;
}
const burns = (h, u) => h.hooksOf('damaged').filter(c => (!u || c.source === u) && c.dmg.tags.includes('bond:egir:burn'));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('five Aegir: 12 surrounding tiles every 0.5 s; true damage is 5% of live ATK with no layer term', () => {
  const h = fight(), u = h.unit('g0_a');
  const offsets = [[1,-1],[1,0],[1,1],[0,-1],[0,1],[-1,-1],[-1,0],[-1,1],[2,0],[-2,0],[0,2],[0,-2]];
  const targets = offsets.map(([dr, dc]) => h.spawn('dummy', { pos: [u.tileR + dr, u.tileC + dc] }));
  const outside = [[0,0],[2,1],[1,2],[0,3]].map(([dr, dc]) => h.spawn('dummy', { pos: [u.tileR + dr, u.tileC + dc] }));
  h.run(0.4); assert.equal(burns(h, u).length, 0);
  h.run(0.1); assert.equal(burns(h, u).length, 12);
  for (const c of burns(h, u)) { assert.equal(c.dmg.type, 'true'); close(c.amount, 100); assert.ok(targets.includes(c.target)); }
  assert.ok(burns(h, u).every(c => !outside.includes(c.target)));
  h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 }, persist: true });
  h.b.addLayers('p1', 'egirShip', 400, 'test');
  h.run(0.5);
  for (const c of burns(h, u).slice(12)) close(c.amount, 200);
  assert.equal(burns(h, u).length, 24);
  checkInvariants(h.b);
});

test('four Aegir do not burn; five and six activate, with only the two strongest sources', () => {
  for (const count of [4, 5, 6]) {
    const h = fight({ count }); h.spawn('dummy', { pos: [11, 3] }); h.run(0.5);
    assert.deepEqual(burns(h).map(c => c.source.defId), count >= 5 ? ['g0_a', 'g1_a'] : []);
    checkInvariants(h.b);
  }
});

test('8 s burn / 6 s rest repeats; 16 pulses per active window, no hits in the rest window', () => {
  const h = fight(), u = h.unit('g0_a'); h.spawn('dummy', { pos: [9, 3] });
  const times = [];
  h.b.on('damaged', c => { if (c.source === u && c.dmg.tags.includes('bond:egir:burn')) times.push(h.b.time); });
  h.run(8); assert.equal(times.length, 16); close(times[0], 0.5); close(times.at(-1), 8);
  h.run(5.9); assert.equal(times.length, 16);
  h.run(0.5); assert.equal(times.length, 16);
  h.run(0.1); assert.equal(times.length, 17); close(times.at(-1), 14.5);
  h.run(7.5); assert.equal(times.length, 32); close(times.at(-1), 22);
  checkInvariants(h.b);
});

test('top two sources update after ATK changes and exclude dead or retreated operators', () => {
  const h = fight(); h.spawn('dummy', { pos: [11, 3] }); h.run(0.5);
  assert.deepEqual(burns(h).map(c => c.source.defId), ['g0_a', 'g1_a']);
  const boosted = h.unit('g2_a');
  h.b.addBuff(boosted, { key: 'test:atk', mods: { atkFlat: 5000 }, persist: true }); h.run(0.5);
  assert.deepEqual(burns(h).slice(2).map(c => c.source.defId), ['g2_a', 'g0_a']);
  h.b.retreat(boosted); h.run(0.5);
  assert.deepEqual(burns(h).slice(4).map(c => c.source.defId), ['g0_a', 'g1_a']);
  h.b.dealDamage(null, h.unit('g0_a'), { amount: 1e9, type: 'true' }); // first knock-out revives at five
  h.b.dealDamage(null, h.unit('g0_a'), { amount: 1e9, type: 'true' });
  h.run(0.5);
  assert.ok(burns(h).slice(6).every(c => c.source.alive && c.source !== boosted && c.source !== h.unit('g0_a')));
  checkInvariants(h.b);
});

test('equal-ATK sources have a deterministic left-then-top tie break', () => {
  const h = fight();
  for (const u of h.allies()) h.b.addBuff(u, { key: 'test:equal', mods: { atkFlat: 1000 - u.base.atk } });
  h.spawn('dummy', { pos: [11, 3] }); h.run(0.5);
  assert.deepEqual(burns(h).map(c => c.source.defId), ['g1_a', 'g2_a']);
});

test('burn kill is credited to its source and uses updated Skadi/Specter caps', () => {
  for (const [gid, cap] of [['garrison_38_a',20], ['garrison_38_b',30], ['garrison_46_a',10], ['garrison_46_b',20]]) {
    const h = fight({ garrisonId: gid });
    for (let i = 0; i < 50; i++) h.spawn('dummy', { pos: [9, 3] }).hp = 1;
    h.run(0.5);
    const u = h.unit('g0_a');
    assert.equal(u.stats.kills, 50);
    assert.ok(h.hooksOf('kill').every(c => c.killer === u));
    assert.equal(h.result().perPlayer.p1.layerGains.egirShip, cap, gid);
    checkInvariants(h.b);
  }
});

test('devour ATK scales 50%, 100%, 200%, 300% and beyond; block is always added, layers never are', () => {
  for (const bandId of [null, 'band_clementia']) for (const count of [3, 5, 6]) for (const [layers, scale] of [[0,.5],[100,1],[300,2],[500,3],[700,4]]) {
    const h = fight({ bandId, count, layers, units: [{ chessId: 'g0_a', row: 10, col: 4 }, { chessId: 'g1_a', row: 10, col: 5 }] });
    close(h.unit('g0_a').s.atk, 2000 + 1500 * scale);
    assert.equal(h.unit('g0_a').s.blockCnt, 4);
    assert.equal(h.b.getPlayer('p1').bonds.egirShip.layers, layers);
    assert.deepEqual(h.result().perPlayer.p1.layerGains, {});
    checkInvariants(h.b);
  }
});
