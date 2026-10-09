import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { DATA, makeMatch } from '../match/harness.js';
import { compactResult, resultDigest, buildBattleSpec } from '../../server/sim/spec.js';
import { isBattleResult } from '../../shared/protocol.js';
import { validateClientResult } from '../../server/match/fields.js';

function chain({ count = 6, band = 'band_clementia', kind = 'normal', foreignLast = false } = {}) {
  const chess = Object.fromEntries(Array.from({ length: count }, (_, i) => [`g${i}_a`, chessRec({
    id: `g${i}_a`, skill: null, bonds: foreignLast && i === count - 1 ? ['yanShip'] : ['egirShip'],
    rangeGrid: [], stats: { atk: 1000, maxHp: 1e6, def: 0, blockCnt: 2 },
  })]));
  const h = makeBattle({
    kind, bandId: band, defs: { chess, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0 }) } },
    units: Array.from({ length: count }, (_, i) => ({ uid: i + 1, chessId: `g${i}_a`, row: 10, col: 3 + i })),
    bonds: { egirShip: { count: foreignLast ? count - 1 : count, active: true, tier: count >= 6 ? 3 : 2, layers: 0 } },
    autoFinish: false,
  });
  h.step();
  return h;
}

test('Clementia counts each real devoured operator once, even across several marks and other bonds', () => {
  const h = chain();
  assert.ok(h.allies().every(u => u.alive));
  assert.equal(h.unit('g0_a').s.blockCnt, 12, 'devour always grants all five block counts');
  h.b.forceEnd();
  assert.equal(h.result().perPlayer.p1.egirDevoured, 5);
  assert.deepEqual(h.result().perPlayer.p1.layerGains, {}, 'neither devour nor the band grants layers');
  const other = chain({ foreignLast: true });
  other.b.forceEnd();
  assert.equal(other.result().perPlayer.p1.egirDevoured, 5, 'the other-bond operator also counts');
  const uploaded = compactResult(other.result());
  const otherSpec = buildBattleSpec({ ...other.b.opts, players: other.b.players.map(p => p.input), timeLimit: 60 });
  assert.ok(validateClientResult(otherSpec, uploaded).ok, 'non-Aegir food remains valid in browser uploads');
  const plain = chain({ band: null });
  assert.equal(plain.unit('g0_a').s.blockCnt, 12, 'block no longer depends on choosing Clementia');
  plain.b.forceEnd();
  assert.equal(plain.result().perPlayer.p1.egirDevoured, undefined);
});

test('Clementia in 联防 also records devour while IN_BATTLE layer gains remain disabled', () => {
  const h = chain({ kind: 'unite' });
  h.b.forceEnd();
  assert.equal(h.result().perPlayer.p1.egirDevoured, 5);
  assert.deepEqual(h.result().perPlayer.p1.layerGains, {});
});

function prep() {
  const data = structuredClone(DATA);
  for (const b of Object.values(data.config.bans)) if (typeof b === 'object') { b.core = 0; b.addon = 0; }
  const h = makeMatch({ mode: 'solo', fake: true, data, seed: 41 }).start();
  h.toPrep(1);
  const ps = h.ps('p_0'), m = h.m;
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null);
  ps.bandId = 'band_clementia'; ps.counters = {}; ps.shop.level = 1;
  const grants = [];
  const acquire = ps.acquireChess.bind(ps);
  ps.acquireChess = (id, opts = {}) => {
    const p = acquire(id, opts);
    if (p && opts.source === 'band') grants.push(id);
    return p;
  };
  const settle = (own, unite = 0) => m.dispatch(ps, 'onBattleResult', { result: { egirDevoured: own }, unite: { perPlayer: { p_0: { egirDevoured: unite } } } });
  const round = (n) => { m.round = n; m.dispatch(ps, 'onRoundStart', { round: n }); };
  return { h, ps, m, grants, settle, round };
}

test('9+1 devours across rounds grant exactly one recruit next round, limited by the receiving shop level', () => {
  const s = prep();
  s.settle(9); s.round(2);
  assert.equal(s.grants.length, 0);
  assert.equal(s.ps.counters['band:clementia:devoured'], 9);
  s.settle(1);
  s.round(2);
  assert.equal(s.grants.length, 0, 'same round is too early');
  s.ps.shop.level = 3; s.round(3);
  assert.equal(s.grants.length, 1);
  const c = s.m.gd.chess(s.grants[0]);
  assert.ok(c.bonds.includes('egirShip') && c.tier <= 3);
  s.round(3); s.round(4);
  assert.equal(s.grants.length, 1, 'consumed reward cannot repeat');
  s.m.dispose();
});

test('own and 联防 counts combine; multiple rewards, remainder and an exhausted pool are retained correctly', () => {
  const s = prep();
  s.settle(9, 12);
  assert.equal(s.ps.counters['band:clementia:pending'], 2);
  assert.equal(s.ps.counters['band:clementia:devoured'], 1);
  const roll = s.m.pool.roll;
  s.m.pool.roll = () => null;
  s.round(2);
  assert.equal(s.grants.length, 0);
  assert.equal(s.ps.counters['band:clementia:pending'], 2);
  s.m.pool.roll = roll;
  s.round(3);
  assert.equal(s.grants.length, 2);
  assert.ok(s.grants.every(id => s.m.gd.chess(id).tier === 1 && s.m.gd.chess(id).bonds.includes('egirShip')));
  assert.equal(s.ps.counters['band:clementia:pending'], 0);
  s.m.dispose();
});

test('devour count survives browser compression and validation, participates in verification digest, rejects impossible counts', () => {
  const h = chain();
  h.b.forceEnd();
  const raw = h.result(), upload = compactResult(raw);
  assert.equal(upload.perPlayer.p1.egirDevoured, 5);
  assert.ok(isBattleResult(upload));
  assert.equal(resultDigest(upload).hash, resultDigest(raw).hash);
  const cheated = structuredClone(upload); cheated.perPlayer.p1.egirDevoured = 4;
  assert.notEqual(resultDigest(cheated).hash, resultDigest(upload).hash);
  const spec = buildBattleSpec({ ...h.b.opts, players: h.b.players.map(p => p.input), timeLimit: 60 });
  const accepted = validateClientResult(spec, upload);
  assert.ok(accepted.ok, accepted.reason);
  assert.equal(accepted.result.perPlayer.p1.egirDevoured, 5);
  cheated.perPlayer.p1.egirDevoured = 7;
  assert.equal(validateClientResult(spec, cheated).reason, 'devour bound');
  cheated.perPlayer.p1.egirDevoured = -1;
  assert.equal(isBattleResult(cheated), false);
  cheated.perPlayer.p1.egirDevoured = 1;
  spec.players[0].bandId = null;
  assert.equal(validateClientResult(spec, cheated).reason, 'devour bound');
});
