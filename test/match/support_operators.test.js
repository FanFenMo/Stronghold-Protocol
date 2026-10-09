import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';
import { bondMembers } from '../../public/js/ui/gameLogic.js';
import { ownerBoard } from '../../public/js/ui/watchBonds.js';
import { checkSupportOperators, EMPTY_SUPPORT_OPERATORS, supportAvailable } from '../../shared/supportOperators.js';

const id5 = 'chess_custom_5_ascln_a', id6 = 'chess_custom_6_ascln_a';
const lookup = id => DATA.chess[id];
test('external roster validates capacity, tier, identity across tiers and rejects ordinary operators', () => {
  assert.equal(checkSupportOperators({ 5: [id5], 6: [] }, lookup).ok, true);
  assert.equal(checkSupportOperators({ 5: [], 6: [id6] }, lookup).ok, true);
  assert.ok(checkSupportOperators({ 5: [id5], 6: [id6] }, lookup).error);
  assert.ok(checkSupportOperators({ 5: [id5, id5, id5], 6: [] }, lookup).error);
  assert.ok(checkSupportOperators({ 5: [id6], 6: [] }, lookup).error);
  const regular = Object.values(DATA.chess).find(c => c.visible && !c.isGolden && !c.supportOperator).chessId;
  assert.ok(checkSupportOperators({ 5: [regular], 6: [] }, lookup).error);
});

test('unselected external operators are excluded from the default pool and bond member list', () => {
  const gd = new GameData(DATA, 'mode_single_funny');
  for (const c of Object.values(DATA.chess).filter(c => c.supportOperator)) assert.ok(!gd.visibleChess.includes(c.chessId));
  const bond = DATA.bonds.emptyShip;
  assert.ok(!bondMembers(bond, {}, [], lookup).some(c => lookup(c.id)?.supportOperator));
  const rows = bondMembers(bond, { supportOperators: { 5: [], 6: [id6] } }, [], lookup);
  assert.ok(rows.some(c => c.id === id6));
  assert.ok(!rows.some(c => c.id === id5));
});

test('selected external operators have the requested tier, original kit and normal/elite variants', () => {
  for (const c of Object.values(DATA.chess).filter(c => c.supportOperator && !c.isGolden)) {
    for (const tier of [5, 6]) {
      const rec = lookup(c.supportVariants[tier]);
      assert.equal(rec.tier, tier);
      assert.equal(rec.charId, c.charId);
      assert.equal(lookup(rec.goldenId).tier, tier);
      assert.equal(rec.supportKitId, c.supportKitId);
    }
  }
});

test('watching a teammate keeps their deployed external member visible without revealing unselected candidates', () => {
  const field = { units: [{ kind: 'op', ownerId: 'p2', defId: lookup(id6).goldenId }] };
  const rows = bondMembers(DATA.bonds.emptyShip, ownerBoard(field, 'p2'), [], lookup);
  assert.equal(rows.find(c => c.id === id6)?.onBoard, true);
  assert.deepEqual(rows.filter(c => lookup(c.id)?.supportOperator).map(c => c.id), [id6]);
  const mine = { board: [{ kind: 'chess', id: id6 }], supportOperators: EMPTY_SUPPORT_OPERATORS };
  assert.ok(!bondMembers(DATA.bonds.emptyShip, mine, [], lookup).some(c => lookup(c.id)?.supportOperator));
});

test('external picks are personal: shop, rewards and direct grants cannot bypass selection', () => {
  const h = makeMatch({ difficulty: 'FUNNY', humans: 2, fake: true });
  h.start();
  assert.equal(h.m.setSupportOperators('p_0', { 5: [id5], 6: [] }).ok, true);
  const a = h.m.players.get('p_0'), b = h.m.players.get('p_1');
  assert.equal(a.canUseChess(id5), true);
  assert.equal(b.canUseChess(id5), false);
  assert.equal(a.canUseChess(id6), false);
  h.toPrep(1);
  const entry = h.m.pool.entries.get(id5);
  assert.ok(entry);
  h.m.pool.entries = new Map([[id5, entry]]);
  a.shop.level = b.shop.level = 6;
  a.rollShop(); b.rollShop();
  assert.ok(a.shop.slots.some(s => s?.id === id5));
  assert.ok(!b.shop.slots.some(s => s?.id === id5));
  assert.equal(b.pushRewardOffer('test', { ids: [id5] }), null);
  assert.equal(b.acquireChess(id5), null);
  assert.ok(a.acquireChess(id5));
  assert.deepEqual(a.privateView().supportOperators, { 5: [id5], 6: [] });
  assert.equal(h.m.setSupportOperators('p_0', EMPTY_SUPPORT_OPERATORS).error, 'WRONG_PHASE');
  assert.equal(a.canUseChess(id5), true);
});

test('external selection arriving on the seat applies before the shared pool is built', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'FUNNY', fake: true, seats: [{
    seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, supportOperators: { 5: [], 6: [id6] },
  }] });
  assert.ok(h.m.pool.has(id6));
  assert.ok(!h.m.pool.has(id5));
  assert.equal(h.m.pool.cap(id6), 5);
  assert.equal(supportAvailable(lookup(id6), h.m.players.get('p_0').supportOperators), true);
});
