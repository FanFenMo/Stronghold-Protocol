import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const ID = 'chess_custom_5_chen3_a';
function wave({ dir = 'RIGHT', row = 10, col = 4, ...opts } = {}) {
  const h = makeBattle({ units: [{ chessId: ID, row, col, dir, skillIndex: 2 }],
    autoFinish: false, timeLimit: 20, ...opts });
  h.step();
  const u = h.unit(ID);
  u.profile.noAttack = true;
  u.skill.rule = 'NEVER';
  u.skill.addCharge(1);
  assert.equal(u.skill.activate('test'), true);
  return { h, u, points: () => h.eventsOf('fx').filter(e => e[1] === 'chen3Wave') };
}

for (const [dir, row, col, axis, sign] of [
  ['DOWN', 9, 4, 2, -1], ['UP', 12, 4, 2, 1],
  ['RIGHT', 10, 9, 3, -1], ['LEFT', 10, 3, 3, 1],
]) test(`Chen sword wave: ${dir} turns clockwise at the wall or field edge`, () => {
  const { h, points } = wave({ dir, row, col });
  h.run(1.3);
  const p = points().at(-1);
  assert.ok(p, 'the wave emits its existing visual effect');
  const start = axis === 2 ? col : row;
  assert.ok((p[axis] - start) * sign > 0.2, `expected a right turn: ${JSON.stringify(p)}`);
  for (const e of points()) {
    assert.ok(h.b.grid.inRect(Math.round(e[3]), Math.round(e[2])), `wave escaped: ${JSON.stringify(e)}`);
    assert.equal(h.b.grid.tile(Math.round(e[3]), Math.round(e[2])).height, 'LOW');
  }
  assert.deepEqual(h.b.errors, []);
});

test('Chen sword wave follows its facing rather than homing toward nearby enemies', () => {
  const { h, points } = wave({ dir: 'RIGHT',
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e7, speed: 0 }) } },
    enemies: [{ key: 'e', pos: [12, 4] }] });
  h.run(0.6);
  assert.ok(points().length > 0);
  for (const p of points()) assert.equal(p[3], 10);
});

for (const kind of ['normal', 'unite', 'boss', 'hidden'])
  test(`Chen sword wave stays inside ${kind} field through corners for its full lifetime`, () => {
    const { h, points } = wave({ kind, dir: 'DOWN', row: 9 });
    h.run(7);
    assert.ok(points().length >= 50);
    for (const p of points()) assert.ok(h.b.grid.inRect(Math.round(p[3]), Math.round(p[2])), JSON.stringify(p));
    assert.deepEqual(h.b.errors, []);
  });

test('Chen sword wave turns before a dynamic obstacle', () => {
  const { h, points } = wave();
  h.b.grid.setObstacle(10, 5, true);
  h.run(1);
  const p = points().at(-1);
  assert.ok(p[3] < 9.8);
  for (const p of points()) assert.equal(h.b.grid.isObstacle(Math.round(p[3]), Math.round(p[2])), false);
});

test('Chen sword wave treats invasion points as walls even on low ground', () => {
  const { h, points } = wave({ row: 9, col: 9 });
  h.run(0.5);
  assert.ok(points().at(-1)[3] < 9);
  for (const p of points()) assert.notEqual(h.b.grid.tile(Math.round(p[3]), Math.round(p[2])).special, 'start');
});

test('Chen sword wave hits once before a turn, then may hit the same enemy on the next leg', () => {
  const { h, u } = wave({ captureNoisy: true,
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e7, speed: 0 }) } },
    enemies: [{ key: 'e', pos: [9, 4] }] });
  h.b.grid.setObstacle(10, 5, true);
  const hits = () => h.hooksOf('damaged').filter(c => c.source === u && c.dmg.tags.includes('chen3:wave'));
  h.run(0.1);
  assert.equal(hits().length, 1);
  h.run(0.2);
  assert.equal(hits().length, 2);
});
