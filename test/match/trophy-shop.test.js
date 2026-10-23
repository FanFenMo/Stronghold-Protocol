import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { trophyProduct, TROPHY_SHOP_PRODUCTS } from '../../shared/trophyShop.js';
import { planTrophyPurchase } from '../../server/match/trophyShop.js';

test('商品按确认价格全部启用，信标只在博士投影档且装备共用一局一次限制', () => {
  const prices = group => TROPHY_SHOP_PRODUCTS.filter(product => product.group === group).map(product => product.price);
  assert.ok(TROPHY_SHOP_PRODUCTS.every(product => Number.isSafeInteger(product.price) && product.price >= 0));
  assert.deepEqual(prices('slow'), [3, 4, 5, 6, 7]);
  assert.deepEqual(prices('attack'), [2, 4, 6]);
  const equipmentPrices = { basic: 1, phone: 3, material: 8, special: 10, hr: 15 };
  assert.ok(TROPHY_SHOP_PRODUCTS.filter(product => product.group === 'equipment')
    .every(product => product.price === equipmentPrices[product.tier]));
  assert.deepEqual(['funds', 'last_stand', 'strategy', 'round12', 'mystery'].map(id => trophyProduct(id).price), [10, 8, 10, 1, 20]);
  const beacons = TROPHY_SHOP_PRODUCTS.filter(product => product.value === 'chess_item_5_04_e_a');
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].tier, 'special');
  assert.ok(TROPHY_SHOP_PRODUCTS.filter(product => product.group === 'equipment').every(product => product.limit === 1));
});

test('隐藏事件固定在购买时选择的回合，前五种各约19%，无效果约5%，替换怪物不选Boss回合', () => {
  const counts = new Array(6).fill(0);
  const ps = { playerId: 'p1', canUseChess: () => true };
  const match = { seed: 1, disabledBonds: [], gd: { lastRound: 14, visibleChess: ['op'], bondIds: ['b'],
    modeInactiveBonds: new Set(), bond: () => ({ noStack: false }), isBossRound: round => round === 14 } };
  for (let seed = 1; seed <= 10000; seed++) {
    match.seed = seed;
    const plan = planTrophyPurchase(match, ps, trophyProduct('mystery'));
    assert.deepEqual(plan, planTrophyPurchase(match, ps, trophyProduct('mystery')));
    counts[plan.kind - 1]++;
    assert.ok(plan.round >= 1 && plan.round <= 14);
    if (plan.kind === 3) assert.notEqual(plan.round, 14);
  }
  for (const count of counts.slice(0, 5)) assert.ok(count > 1700 && count < 2100);
  assert.ok(counts[5] > 350 && counts[5] < 650);
});

test('保命只触发一次；第二次致命漏怪照常淘汰', () => {
  const h = makeMatch({ fake: true, humans: 1, seed: 301 }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    ps.lp = 1;
    ps.trophyShop.counts.last_stand = 1;
    const leaked = [{ enemyKey: 'enemy_1422_lrsldr' }];
    h.m.lastResults.set(ps.playerId, { leaked, layerGains: {} });
    h.m.settle(null, null);
    assert.equal(ps.lp, 1);
    assert.equal(ps.alive, true);
    h.m.settle(null, null);
    assert.equal(ps.lp, 0);
    assert.equal(ps.alive, false);
  } finally { h.m.dispose(); }
});

test('怪物替换仅作用于购买者，并将本回合漏怪转为最多30点治疗', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', fake: true, humans: 2, seed: 302 }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0'), mate = h.ps('p_1');
    ps.trophyShop.mystery = { kind: 3, round: 1 };
    ps.lp = mate.lp = 5;
    assert.ok(h.m.normalSpawnsFor(ps).every(spawn => spawn.enemyKey === 'enemy_1207_sfji_2' && spawn.mods.trophyFragments));
    assert.ok(h.m.normalSpawnsFor(mate).every(spawn => !spawn.mods?.trophyFragments));
    h.m.lastResults.set(ps.playerId, { leaked: new Array(40).fill({ enemyKey: 'enemy_1208_msfji_2' }), layerGains: {} });
    h.m.lastResults.set(mate.playerId, { leaked: new Array(2).fill({ enemyKey: 'enemy_1422_lrsldr' }), layerGains: {} });
    h.m.settle(null, null);
    assert.equal(ps.lp, 35);
    assert.equal(mate.lp, 3);
  } finally { h.m.dispose(); }
});

test('特殊调度站只刷新六阶干员且价格恒为2，下一回合恢复正常', () => {
  const h = makeMatch({ difficulty: 'HARD', fake: true, seed: 303 }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    ps.trophyShop.mystery = { kind: 5, round: 1 };
    ps.rollShop();
    assert.ok(ps.shop.slots.some(Boolean));
    assert.ok(ps.shop.slots.filter(Boolean).every(slot => slot.kind === 'chess' && ps.gd.tierOf(slot.id) === 6 && ps.priceOf(slot) === 2));
    h.m.round = 2;
    ps.rollShop();
    assert.ok(ps.shop.slots.filter(Boolean).every(slot => slot.kind !== 'chess' || ps.gd.tierOf(slot.id) <= ps.shop.level));
  } finally { h.m.dispose(); }
});

test('特殊干员在实际战斗输入中保持指定属性，购买者的攻击增益不会影响队友', () => {
  const h = makeBattle({ content: 'none', players: [
    { playerId: 'p1', trophyAttack: 0.3, units: [{ chessId: 'chess_char_1_01_a', uid: 1, row: 10, col: 5,
      fixedStats: { atk: 79999, def: 799, aspd: 325 } }, { chessId: 'chess_char_1_01_a', uid: 3, row: 9, col: 4 }] },
    { playerId: 'p2', units: [{ chessId: 'chess_char_1_01_a', uid: 2, row: 11, col: 6 }] },
  ] });
  h.b.start();
  const special = h.unit(1), normal = h.unit(2);
  assert.equal(special.s.atk, 79999);
  assert.equal(special.s.def, 799);
  assert.equal(special.s.aspd, 325);
  assert.equal(normal.s.atk, normal.base.atk);
  assert.equal(h.unit(3).s.atk, h.unit(3).base.atk * 1.3);
  assert.deepEqual(h.b.errors, []);
});

test('怪物减速只作用于购买者所属怪物，序列化战斗输入后仍生效', () => {
  const players = JSON.parse(JSON.stringify([
    { playerId: 'p1', trophySlow: true, units: [] },
    { playerId: 'p2', units: [] },
  ]));
  const h = makeBattle({ content: 'none', players });
  h.b.start();
  const own = h.spawn('enemy_1422_lrsldr', { ownerPlayerId: 'p1' });
  const mate = h.spawn('enemy_1422_lrsldr', { ownerPlayerId: 'p2' });
  assert.equal(own.s.moveSpeed, own.base.moveSpeed * 0.8);
  assert.equal(mate.s.moveSpeed, mate.base.moveSpeed);
  assert.deepEqual(h.b.errors, []);
});
