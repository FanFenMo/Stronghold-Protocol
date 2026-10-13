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

for (const level of [1, 2, 3, 4, 5, 6]) {
  for (const hit of [true, false]) {
    test(`可露希尔 level${level}: a real elite merge ${hit ? 'upgrades' : 'keeps'} the free-choice tier with a six-tier cap`, () => {
      const h = prep(), ps = h.ps('p_0'), m = h.m;
      ps.bandId = 'band_closure'; ps.shop.level = level;
      const baseId = Object.values(DATA.chess).find(c => c.visible && !c.isGolden && c.tier === 1
        && (c.garrisonIds || []).every(g => DATA.garrisons[g].eventType === 'IN_BATTLE')
        && ps.canUseChess(c.chessId) && m.pool.left(c.chessId) >= 3).chessId;
      give(m, ps, baseId); give(m, ps, baseId);
      let rolls = 0;
      m.rngMeta.chance = chance => { assert.equal(chance, 0.2); rolls++; return hit; };
      const funds = ps.funds, merges = ps.stats.merges;
      const elite = ps.acquireChess(baseId, { source: 'effect' });
      assert.ok(m.gd.isGolden(elite.id));
      assert.equal(ps.stats.merges, merges + 1);
      assert.equal(rolls, 1, 'one roll per elite merge');
      const offer = ps.privateView().shop.rewardOffer;
      const tier = Math.min(6, level + 1 + (hit ? 1 : 0));
      assert.equal(offer.source, 'merge');
      assert.equal(offer.tier, tier);
      assert.equal(offer.slots.length, 3);
      assert.equal(new Set(offer.slots.map(s => s.id)).size, 3);
      assert.ok(offer.slots.every(s => DATA.chess[s.id].tier === tier && s.price === 0));
      const copies = offer.slots.map(s => m.pool.left(s.id));
      assert.deepEqual(ps.pickReward(1), { ok: true });
      assert.equal(ps.funds, funds);
      assert.equal(ps.privateView().shop.rewardOffer, null);
      assert.deepEqual(offer.slots.map(s => m.pool.left(s.id)), [copies[0], copies[1] - 1, copies[2]]);
      assert.equal(ps.pickReward(0).error, 'BAD_TARGET');
      assert.equal(rolls, 1);
      h.invariants();
    });
  }
}

test('可露希尔 changes only its owner\'s promotion reward, leaving other chess and item offers untouched', () => {
  const h = prep(2), ps = h.ps('p_0'), other = h.ps('p_1'), m = h.m;
  ps.bandId = 'band_closure'; ps.shop.level = 2; other.shop.level = 2;
  let rolls = 0;
  m.rngMeta.chance = chance => { assert.equal(chance, 0.2); rolls++; return true; };
  const special = ps.pushRewardOffer('effect', { tier: 3 });
  const teammate = other.pushRewardOffer('merge');
  const itemId = Object.values(DATA.items).find(i => !i.isGolden && i.itemType === 'EQUIP').id;
  const items = ps.pushItemOffer([itemId]);
  assert.equal(special.tier, 3);
  assert.equal(teammate.tier, 3);
  assert.equal(items.slots[0].kind, 'item');
  assert.equal(rolls, 0);
  const promotion = ps.pushRewardOffer('merge');
  assert.equal(promotion.tier, 4);
  assert.equal(rolls, 1);
  h.invariants();
});

for (const golden of [false, true]) {
  test(`绮良 ${golden ? 'elite' : 'normal'} sale: misses carry across rounds and stay per player; a proc pays the original price immediately and resets`, () => {
    const h = prep(2), m = h.m, ps = h.ps('p_0'), other = h.ps('p_1');
    ps.bandId = other.bandId = 'band_kirara';
    const id = Object.values(DATA.chess).find(c => c.visible && c.isGolden === golden && c.tier === 3
      && (c.garrisonIds || []).every(g => DATA.garrisons[g].eventType === 'IN_BATTLE')
      && ps.canUseChess(c.chessId) && m.pool.left(m.gd.baseIdOf(c.chessId)) >= (golden ? m.gd.goldenCopies : 1)).chessId;
    const rolls = [];
    m.rngMeta.chance = chance => { rolls.push(chance); return 0.15 < chance; };
    const sell = who => {
      const piece = give(m, who, id), funds = who.funds;
      assert.deepEqual(who.sell(piece.uid), { ok: true });
      return who.funds - funds;
    };
    assert.equal(sell(ps), m.gd.sellPrice(id));
    m.round = 2; ps.startRound(2); other.startRound(2);
    assert.equal(sell(other), m.gd.sellPrice(id), 'the other player starts with its own initial probability');
    assert.equal(sell(ps), m.gd.chessPrice(id), 'second attempt after a miss pays the full price now');
    assert.equal(sell(ps), m.gd.sellPrice(id), 'a proc resets the next attempt to the initial probability');
    assert.equal(sell(other), m.gd.chessPrice(id), 'the other player keeps its own missed attempt');
    assert.equal(rolls.length, 5);
    assert.ok(rolls[0] < 0.15 && rolls[2] > 0.15);
    assert.equal(rolls[1], rolls[0]); assert.equal(rolls[3], rolls[0]); assert.equal(rolls[4], rolls[2]);
    assert.equal(ps.pendingFunds, 0); assert.equal(other.pendingFunds, 0);
    assert.ok(!ps.privateView().effects.some(e => e.id === 'band:kirara:sell_rebate'));
    h.invariants();
  });
}

test('绮良 sale PRD: rejected sales do not roll; repeated misses reach a guaranteed proc and then reset', () => {
  const h = prep(), m = h.m, ps = h.ps('p_0');
  ps.bandId = 'band_kirara';
  const id = Object.values(DATA.chess).find(c => c.visible && !c.isGolden && c.tier === 3
    && (c.garrisonIds || []).every(g => DATA.garrisons[g].eventType === 'IN_BATTLE')
    && ps.canUseChess(c.chessId) && m.pool.left(c.chessId) > 0).chessId;
  const rolls = [];
  m.rngMeta.chance = chance => { rolls.push(chance); return 0.999 < chance; };
  assert.equal(ps.sell(-1).error, 'BAD_TARGET');
  assert.equal(rolls.length, 0);
  for (let attempt = 1; attempt <= 13; attempt++) {
    const piece = give(m, ps, id), funds = ps.funds;
    assert.deepEqual(ps.sell(piece.uid), { ok: true });
    assert.equal(ps.funds - funds, attempt === 12 ? m.gd.chessPrice(id) : m.gd.sellPrice(id));
  }
  assert.equal(rolls.length, 13);
  for (let i = 1; i < 12; i++) assert.ok(rolls[i] > rolls[i - 1]);
  assert.equal(rolls[11], 1);
  assert.equal(rolls[12], rolls[0]);
  assert.equal(ps.pendingFunds, 0);
  h.invariants();
});

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

for (const [round, level, tier] of [[6, 1, 5], [6, 6, 1], [8, 1, 6], [8, 6, 2], [10, 1, 6], [10, 6, 4], [12, 1, 6], [12, 6, 5]]) {
  test(`青织 R${round} level${level}: three distinct tier${tier} choices, pick one free and discard the others`, () => {
    const h = prep(), ps = h.ps('p_0'), m = h.m; ps.bandId = 'band_qingzhi'; ps.shop.level = level;
    m.round = round; ps.startRound(round); m.dispatch(ps, 'onRoundStart', { round });
    assert.equal(ps.shop.freeRefreshes, 1);
    assert.ok(ps.shop.slots.filter(s => s?.kind === 'chess').every(s => DATA.chess[s.id].tier <= level));
    const funds = ps.funds;
    assert.deepEqual(ps.refresh(), { ok: true });
    assert.equal(ps.funds, funds);
    const offer = ps.privateView().shop.rewardOffer;
    assert.equal(offer.label, '否极泰来');
    assert.equal(offer.slots.length, 3);
    assert.equal(new Set(offer.slots.map(s => s.id)).size, 3);
    assert.ok(offer.slots.every(s => DATA.chess[s.id].tier === tier && s.price === 0));
    assert.equal(ps.shop.freeRefreshes, 0);
    assert.equal(ps.counters['qingzhi:pending'], 0);
    const copies = offer.slots.map(s => m.pool.left(s.id));
    assert.deepEqual(ps.pickReward(1), { ok: true });
    assert.equal(ps.funds, funds);
    assert.equal(ps.privateView().shop.rewardOffer, null);
    assert.deepEqual(ps.allChess().map(p => p.id), [offer.slots[1].id]);
    assert.deepEqual(offer.slots.map(s => m.pool.left(s.id)), [copies[0], copies[1] - 1, copies[2]]);
    assert.equal(ps.pickReward(0).error, 'BAD_TARGET');
    assert.ok(ps.shop.slots.filter(s => s?.kind === 'chess').every(s => ps.priceOf(s) > 0));
    assert.deepEqual(ps.refresh(), { ok: true });
    assert.equal(ps.funds, funds - m.gd.refreshPrice);
    assert.equal(ps.privateView().shop.rewardOffer, null);
    h.invariants();
  });
}

test('青织 has no special refresh in the former R9 or other unscheduled rounds', () => {
  const h = prep(), ps = h.ps('p_0');
  ps.bandId = 'band_qingzhi'; ps.funds = 50;
  for (const round of [5, 7, 9, 11, 13]) {
    h.m.round = round; ps.startRound(round); h.m.dispatch(ps, 'onRoundStart', { round });
    assert.equal(ps.shop.freeRefreshes, 0);
    assert.deepEqual(ps.refresh(), { ok: true });
    assert.equal(ps.privateView().shop.rewardOffer, null);
  }
});

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
      assert.equal(added[0].bounty.chance, 0.2);
      assert.equal(added[0].mods.bountyChance, 0.2);
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

test('W weakened enemy has 70% HP/ATK/DEF/RES/speed; successful kills pay only on the 20% roll and never twice', () => {
  const h = makeBattle({ defs: { enemies: { w_target: enemyRec({ key: 'w_target', hp: 1000, atk: 100, def: 100, res: 50, speed: 1 }) } } });
  h.step();
  for (const win of [true, false]) {
    const e = h.b.spawnEnemy('w_target', { pos: [10, 8], mods: { hpMul: .7, atkMul: .7, defMul: .7, resMul: .7, speedMul: .7 },
      tag: 'w_transfer', ownerPlayerId: 'p1', bounty: { coins: 1, chance: .2, ownerPlayerId: 'p1' } });
    assert.deepEqual([e.s.maxHp, e.s.atk, e.s.def, e.s.res, e.s.moveSpeed], [700, 70, 70, 35, .7]);
    h.b.rng.chance = p => { assert.equal(p, .2); return win; };
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
  assert.equal(files.bands.band_qingzhi.name, '青织');
  assert.equal(files.bands.band_lisa.totalHp, 28);
  assert.equal(files.bands.band_closure.name, '可露希尔');
  assert.equal(files.bands.band_closure.effectName, '意外收获');
  assert.equal(files.bands.band_closure.desc, '【意外收获】每次干员精锐后有20%使选择干员阶数+1');
  assert.deepEqual(files.bands.band_closure.buffs, [{ key: 'custom_closure_reward_upgrade', bb: { chance: 0.2 }, bbStr: {} }]);
  const kirara = files.bands.band_kirara;
  assert.match(kirara.desc, /每使用20资金/);
  assert.match(kirara.desc, /25%概率原价售出.*伪随机/);
  assert.equal(kirara.desc, files.effects[kirara.effectId].desc);
  assert.deepEqual(kirara.buffs.find(b => b.key === 'custom_kirara_sell_rebate'),
    { key: 'custom_kirara_sell_rebate', bb: { chance: 0.25 }, bbStr: {} });
  assert.ok(kirara.buffs.some(b => b.key === 'band_coin_cost_gain_random_char_by_shop_level'));
  const assets = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url)));
  applyStrategyAssets(assets); const once = JSON.stringify(assets); applyStrategyAssets(assets);
  assert.equal(JSON.stringify(assets), once);
  for (const id of ['band_qingzhi', 'band_w', 'band_closure']) assert.ok(readFileSync(new URL(`../../public${assets.bands[id]}`, import.meta.url)).length > 1000);
  assert.equal(files.bands.band_rolling_logs.iconBlank, true);
  assert.equal(assets.bands.band_rolling_logs, undefined);
});
