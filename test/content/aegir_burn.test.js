import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { DATA } from '../match/harness.js';

const positions = [[10, 4], [12, 2], [12, 4], [12, 6], [12, 8], [10, 8]];
function fight({ count = 6, layers = 100, players, units, bandId } = {}) {
  const chess = Object.fromEntries(positions.map((_, i) => [`g${i}_a`, chessRec({
    id: `g${i}_a`, bonds: ['egirShip'], skill: null, rangeGrid: [],
    stats: { atk: 1000, maxHp: 1e6, def: 0, blockCnt: 2 },
  })]));
  const h = makeBattle({
    defs: { chess, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 99999, res: 100 }) } },
    units: units ?? positions.slice(0, count).map(([row, col], i) => ({ chessId: `g${i}_a`, row, col, dir: 'DOWN' })),
    players, bandId, bonds: { egirShip: { count, active: count >= 3, tier: count >= 6 ? 3 : count >= 5 ? 2 : 1, layers } },
    hooks: ['damaged', 'kill'], captureNoisy: true, autoFinish: false, timeLimit: 180,
  });
  h.step();
  return h;
}
const burns = (h, u) => h.hooksOf('damaged').filter(c => c.source === u && c.dmg.tags.includes('bond:egir:burn'));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('six Aegir: exactly 12 surrounding tiles, every 0.5 s; true damage uses live ATK and layers', () => {
  const h = fight();
  const u = h.unit('g0_a');
  const offsets = [[1,-1],[1,0],[1,1],[0,-1],[0,1],[-1,-1],[-1,0],[-1,1],[2,0],[-2,0],[0,2],[0,-2]];
  const targets = offsets.map(([dr, dc]) => h.spawn('dummy', { pos: [u.tileR + dr, u.tileC + dc] }));
  const outside = [[0,0],[2,1],[1,2],[0,3]].map(([dr, dc]) => h.spawn('dummy', { pos: [u.tileR + dr, u.tileC + dc] }));
  h.run(0.4);
  assert.equal(burns(h, u).length, 0);
  h.run(0.1);
  assert.equal(burns(h, u).length, 12);
  for (const c of burns(h, u)) { assert.equal(c.dmg.type, 'true'); close(c.amount, 350); assert.ok(targets.includes(c.target)); }
  assert.ok(burns(h, u).every(c => !outside.includes(c.target)));
  h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 }, persist: true });
  h.b.addLayers('p1', 'egirShip', 100, 'test');
  h.run(0.5);
  for (const c of burns(h, u).slice(12)) close(c.amount, 2200);
  assert.equal(burns(h, u).length, 24);
  checkInvariants(h.b);
});

test('five Aegir do not burn; six remove only devour block, retaining ATK and layer gain', () => {
  const five = fight({ count: 5 });
  five.spawn('dummy', { pos: [10,5] });
  five.run(1);
  assert.equal(burns(five, five.unit('g0_a')).length, 0);
  for (const count of [5, 6]) {
    const h = fight({ count, layers: 0, units: [{ chessId: 'g0_a', row: 10, col: 4 }, { chessId: 'g1_a', row: 10, col: 5 }] });
    close(h.unit('g0_a').s.atk, 2000);
    assert.equal(h.unit('g0_a').s.blockCnt, count === 6 ? 2 : 4);
    assert.equal(h.b.getPlayer('p1').bonds.egirShip.layers, 1);
  }
});

test('burn kill is credited to its operator; dead sources stop pulsing', () => {
  const h = fight();
  const u = h.unit('g0_a');
  const e = h.spawn('dummy', { pos: [9, 3] });
  e.hp = 1;
  h.run(0.5);
  assert.equal(h.hooksOf('kill').find(c => c.victim === e)?.killer, u);
  const n = burns(h, u).length;
  h.b.retreat(u);
  h.spawn('dummy', { pos: [9, 3] });
  h.run(1);
  assert.equal(burns(h, u).length, n);
});

test('calibration: 100+ layers clear a 10000 HP mob; 200 layers beat the normal 675000 HP pool, 400 dominate', () => {
  const hp = DATA.bosses.boss_1.bloodPoint.NORMAL;
  const times = [];
  for (const layers of [100, 200, 400]) {
    const h = fight({ layers });
    const e = h.spawn('dummy', { pos: [11, 5] }); // three 1000-ATK members overlap this tile
    e.hp = hp;
    h.runUntil(() => !e.alive, 150);
    times.push(e.alive ? Infinity : h.b.time);
    checkInvariants(h.b);
  }
  assert.equal(times[0], Infinity);
  assert.ok(times[1] > 80 && times[1] < 120, String(times));
  assert.ok(times[2] < 35 && times[2] < times[1] / 3, String(times));
  const h = fight({ layers: 120 });
  const e = h.spawn('dummy', { pos: [9, 3] });
  e.hp = 10000;
  assert.ok(h.runUntil(() => !e.alive, 12));
});
