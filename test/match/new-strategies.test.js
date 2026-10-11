import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, DATA } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { planWTransfers, applyWTransfers } from '../../server/match/strategyWaves.js';
import { W_PENDING, isStrategyMedic } from '../../shared/strategies.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { applyStrategyData, applyStrategyAssets } from '../../tools/strategy-data.mjs';
import { readFileSync } from 'node:fs';

const REG = createRegistry({ log: { warn() {}, error() {}, info() {} } });
function prep(humans = 1) {
  const h = makeMatch({ mode: humans > 1 ? 'coop' : 'solo', humans, registry: REG, seed: 31 }).start();
  h.toPrep(1); h.setStage('act2autochess_m01');
  for (const ps of h.m.players.values()) {
    for (const p of ps.allChess()) ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.bandId = null; ps.counters = {}; ps.offers = [];
    ps.recompute();
  }
  return h;
}
const count = xs => xs.reduce((n, s) => n + (s.count || 1), 0);

test('Touch chooser deploys and faces the independent medic without using a slot; teammates retain automatic position', () => {
  const h = prep(2), m = h.m, ps = h.ps('p_0'), other = h.ps('p_1');
  ps.bandId = 'band_amedic';
  ps.startRound(2);
  const medic = ps.hand.find(p => p && isStrategyMedic(p, ps.bandId));
  assert.ok(medic);
  const cap = ps.deployCap;
  assert.deepEqual(ps.move(medic.uid, { area: 'board', row: 10, col: 4, dir: 'LEFT' }), { ok: true });
  assert.equal(ps.deployCount, 0); assert.equal(ps.deployCap, cap);
  assert.equal(other.hand.filter(p => p?.kind === 'token').length, 0);
  const b = m.newBattle(m._normalOpts(ps)); b.start(); b.step();
  const medics = b.allyUnits.filter(u => u.kind === 'token' && /cmed/.test(u.defId));
  assert.equal(medics.length, 1);
  assert.deepEqual([medics[0].tileR, medics[0].tileC, medics[0].dir], [10, 4, 'LEFT']);
  const ob = m.newBattle(m._normalOpts(other)); ob.start(); ob.step();
  assert.deepEqual(ob.allyUnits.filter(u => u.kind === 'token').map(u => [u.defId, u.tileR, u.tileC]), [['char_605_cmedic', 10, 2]]);
  assert.equal(b.errors.length, 0); assert.equal(ob.errors.length, 0);
  h.invariants();
  ps.startRound(3);
  assert.equal([...ps.board.values(), ...ps.hand, ...ps.temp].filter(p => p && isStrategyMedic(p, ps.bandId)).length, 1);
});

test('Touch transforms at two deployed elites and back; unmarked ownerless tokens still cannot be deployed', () => {
  const h = prep(), ps = h.ps('p_0'), m = h.m;
  ps.bandId = 'band_amedic'; ps.startRound(2);
  const medic = ps.hand.find(p => p && isStrategyMedic(p, ps.bandId));
  ps.move(medic.uid, { area: 'board', row: 10, col: 4 });
  const ids = Object.values(DATA.chess).filter(c => c.visible && c.isGolden && c.tier === 1).slice(0, 2).map(c => c.chessId);
  const a = give(m, ps, ids[0], 'board', [9, 3]);
  const second = give(m, ps, ids[1], 'board', [9, 4]);
  ps.recompute(); assert.equal(medic.id, 'char_613_acmedc');
  const b = m.newBattle(m._normalOpts(ps)); b.start(); b.step();
  assert.equal(b.allyUnits.filter(u => u.defId === 'char_613_acmedc').length, 1);
  ps.tileOverrides['9,4'] = 'none'; ps.invalidateDeployMap(); ps.recompute();
  assert.equal(medic.id, 'char_605_cmedic', 'a terrain eviction leaves only one deployed elite');
  delete ps.tileOverrides['9,4']; ps.invalidateDeployMap();
  assert.deepEqual(ps.move(second.uid, { area: 'board', row: 9, col: 4 }), { ok: true });
  assert.equal(medic.id, 'char_613_acmedc');
  ps.move(a.uid, { area: 'hand', idx: 0 });
  assert.equal(medic.id, 'char_605_cmedic');
  const orphan = ps.newPiece('token', 'char_605_cmedic'); ps.stow(orphan);
  assert.equal(ps.move(orphan.uid, { area: 'board', row: 11, col: 4 }).error, 'BAD_TARGET');
});

for (const [round, level, tier] of [[6, 1, 6], [6, 6, 1], [9, 1, 6], [9, 6, 3], [12, 1, 6], [12, 6, 4]]) {
  test(`青枳 R${round} level${level}: exactly tier${tier}, only one free refresh, automatic shop roll stays ordinary`, () => {
    const h = prep(), ps = h.ps('p_0'), m = h.m; ps.bandId = 'band_qingzhi'; ps.shop.level = level;
    m.round = round; ps.startRound(round); m.dispatch(ps, 'onRoundStart', { round });
    assert.equal(ps.shop.freeRefreshes, 1);
    assert.ok(ps.shop.slots.filter(s => s?.kind === 'chess').every(s => DATA.chess[s.id].tier <= level));
    const funds = ps.funds; ps.refresh();
    assert.equal(ps.funds, funds);
    assert.ok(ps.shop.slots.some(s => s?.kind === 'chess'));
    assert.ok(ps.shop.slots.filter(s => s?.kind === 'chess').every(s => DATA.chess[s.id].tier === tier));
    assert.equal(ps.shop.freeRefreshes, 0);
    assert.equal(ps.counters['qingzhi:pending'], 0);
  });
}

for (const humans of [1, 2, 4]) {
  test(`W transfers exactly one ordinary enemy in a ${humans}-player match; spec requests cannot change the plan`, () => {
    const h = prep(humans), m = h.m, ps = h.ps('p_0');
    ps.bandId = 'band_w'; ps.counters[W_PENDING] = 2;
    m.startRound(2);
    const n = count(m.wave.spawns), plan = m.wTransfers.get(ps.playerId);
    assert.ok(plan.remove);
    const own = m.normalSpawnsFor(ps);
    assert.equal(count(own), n - 1);
    assert.equal(count(m.nextEnemiesFor(ps)), n - 1);
    assert.deepEqual(m._normalOpts(ps), m._normalOpts(ps));
    for (const other of m.alivePlayers().filter(p => p !== ps)) {
      const list = m.normalSpawnsFor(other), added = list.filter(s => s.tag === 'w_transfer');
      assert.equal(count(list), n + 1); assert.equal(added.length, 1);
      assert.equal(added[0].enemyKey, plan.remove.enemyKey);
      assert.equal(added[0].mods.defMul, 0.7); assert.equal(added[0].mods.resMul, 0.7);
      assert.equal(added[0].bounty.chance, 0.5);
    }
    const funds = ps.funds;
    m._normalOpts(ps); m.nextEnemiesFor(ps);
    assert.equal(ps.funds, funds);
    assert.equal(ps.counters[W_PENDING], 0);
  });
}

test('W never removes ducks, bounties or bosses, preserves multi-count timing, and grants no funds for an empty candidate set', () => {
  const h = prep(2), m = h.m, ps = h.ps('p_0');
  const normal = m.wave.spawns.find(s => !s.tag), boss = Object.values(DATA.enemies).find(e => e.rank === 'BOSS');
  m.round = 2; ps.bandId = 'band_w'; ps.counters[W_PENDING] = 2;
  m.wave.spawns = [{ ...normal, count: 3, time: 10, interval: 2, actionIndex: 1 },
    { ...normal, tag: 'bounty', bounty: { coins: 3 }, actionIndex: 2 },
    { ...normal, enemyKey: 'enemy_2001_duckmi', actionIndex: 3 },
    { ...normal, enemyKey: boss.key, actionIndex: 4 }];
  const before = ps.funds;
  m.rngMeta.int = () => 1;
  const plans = planWTransfers(m, m.alivePlayers());
  assert.equal(ps.funds, before + 2);
  const out = applyWTransfers(m.gd, m.wave.spawns, plans.get(ps.playerId));
  assert.deepEqual(out.filter(s => s.actionIndex === 1).map(s => [s.time, s.count]), [[10, 1], [14, 1]]);
  assert.equal(out.filter(s => s.tag === 'bounty').length, 1);
  m.wave.spawns = m.wave.spawns.slice(1); ps.counters[W_PENDING] = 2;
  assert.equal(planWTransfers(m, m.alivePlayers()).get(ps.playerId).remove, null);
  assert.equal(ps.funds, before + 2);
});

test('W weakened enemy has 70% HP/ATK/DEF/RES/speed; successful kills pay only on the 50% roll and never twice', () => {
  const h = makeBattle({ defs: { enemies: { w_target: enemyRec({ key: 'w_target', hp: 1000, atk: 100, def: 100, res: 50, speed: 1 }) } } });
  h.step();
  for (const win of [true, false]) {
    const e = h.b.spawnEnemy('w_target', { pos: [10, 8], mods: { hpMul: .7, atkMul: .7, defMul: .7, resMul: .7, speedMul: .7 },
      tag: 'w_transfer', ownerPlayerId: 'p1', bounty: { coins: 1, chance: .5, ownerPlayerId: 'p1' } });
    assert.deepEqual([e.s.maxHp, e.s.atk, e.s.def, e.s.res, e.s.moveSpeed], [700, 70, 70, 35, .7]);
    h.b.rng.chance = p => { assert.equal(p, .5); return win; };
    const coins = h.b._pp('p1').coins; h.b.kill(e); h.b.kill(e);
    assert.equal(h.b._pp('p1').coins, coins + (win ? 1 : 0));
  }
});

test('W has no transfer or extra funds in a boss round, even if a stale pending flag points there', () => {
  const h = prep(2), ps = h.ps('p_0'), m = h.m;
  ps.bandId = 'band_w'; ps.counters[W_PENDING] = m.gd.bossRound;
  const funds = ps.funds;
  m.startRound(m.gd.bossRound);
  assert.equal(ps.funds, funds + m.gd.income(m.gd.bossRound));
  assert.equal(m.wTransfers.get(ps.playerId).remove, null);
  assert.deepEqual(m.wTransfers.get(ps.playerId).add, []);
  assert.ok(m.bossWaves.length);
});

test('new strategy source rebuild is idempotent, names and icons are correct, and rolling logs stays blank', () => {
  const files = structuredClone({ bands: DATA.bands, effects: DATA.effects });
  applyStrategyData(files); const first = JSON.stringify(files); applyStrategyData(files);
  assert.equal(JSON.stringify(files), first);
  assert.equal(files.bands.band_qingzhi.name, '青枳');
  const assets = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url)));
  applyStrategyAssets(assets); const once = JSON.stringify(assets); applyStrategyAssets(assets);
  assert.equal(JSON.stringify(assets), once);
  for (const id of ['band_qingzhi', 'band_w']) assert.ok(readFileSync(new URL(`../../public${assets.bands[id]}`, import.meta.url)).length > 1000);
  assert.equal(files.bands.band_rolling_logs.iconBlank, true);
  assert.equal(assets.bands.band_rolling_logs, undefined);
});
