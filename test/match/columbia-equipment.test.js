import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, makeMatch, give, giveItem, legalTileFor } from './harness.js';
import { COLUMBIA_BOND, COLUMBIA_TECH_ITEMS, columbiaTechCount, columbiaTechItemId } from '../../shared/columbia.js';

const MEMBERS = ['chess_columbia_quartz_a', 'chess_columbia_halo_a', 'chess_char_2_02_a'];
const SOURCE = 'bond:' + COLUMBIA_BOND;
const TECH_IDS = new Set(COLUMBIA_TECH_ITEMS.map(it => columbiaTechItemId(it.key)));
const techItems = ps => [...ps.hand, ...ps.temp].filter(p => p && TECH_IDS.has(p.id));

function prepColumbia() {
  const h = makeMatch({ mode: 'solo', difficulty: 'FUNNY', fake: true }).start().toPrep(1);
  h.m.gd.modeInactiveBonds.delete(COLUMBIA_BOND);
  return { h, ps: h.ps('p_0') };
}

function deployMember(h, ps, id) {
  const piece = give(h.m, ps, id), [row, col] = legalTileFor(h.m, ps, id);
  assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col } }), { ok: true });
  return { piece, row, col };
}

function takeTechOffers(ps) {
  while (ps.offers[0]?.source === SOURCE) {
    const ids = ps.offers[0].slots.map(slot => slot.id);
    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
    assert.ok(ids.every(id => !ps.columbiaTech.some(key => columbiaTechItemId(key) === id)));
    assert.deepEqual(ps.pickReward(0), { ok: true });
  }
}

for (const layers of [19, 20, 50, 170, 999]) {
  test('先累积' + layers + '层后激活，休整期按门槛依次二选一，最后一种直接领取', () => {
    const { h, ps } = prepColumbia();
    ps.addLayers(COLUMBIA_BOND, layers);
    for (const id of MEMBERS.slice(0, 2)) deployMember(h, ps, id);
    assert.equal(ps.bonds[COLUMBIA_BOND].active, false);
    assert.equal(ps.offers.length, 0);
    deployMember(h, ps, MEMBERS[2]);
    assert.equal(techItems(ps).length, 0);
    const first = JSON.stringify(ps.offers);
    ps.recompute(); ps.recompute();
    assert.equal(JSON.stringify(ps.offers), first, '重算不刷新候选');
    takeTechOffers(ps);
    const expected = columbiaTechCount(layers);
    assert.equal(ps.columbiaTech.length, expected);
    assert.equal(techItems(ps).length, expected);
    assert.equal(new Set(ps.columbiaTech).size, expected);
    ps.recompute();
    assert.equal(ps.offers.length, 0);
    h.invariants(); h.m.dispose();
  });
}

test('20/50/100/170/250/350层各领取一次，销毁装备不返还领取次数', () => {
  const { h, ps } = prepColumbia();
  for (const id of MEMBERS) deployMember(h, ps, id);
  let before = 0;
  for (const [i, layer] of [20, 50, 100, 170, 250, 350].entries()) {
    ps.addLayers(COLUMBIA_BOND, layer - before - 1);
    assert.equal(ps.columbiaTech.length, i);
    assert.equal(ps.offers.length, 0);
    ps.addLayers(COLUMBIA_BOND, 1);
    takeTechOffers(ps);
    assert.equal(ps.columbiaTech.length, i + 1);
    before = layer;
  }
  const item = techItems(ps)[0];
  assert.deepEqual(ps.destroy(item.uid), { ok: true });
  ps.recompute();
  assert.equal(ps.columbiaTech.length, 6);
  assert.equal(techItems(ps).length, 5);
  assert.equal(ps.offers.length, 0);
  h.invariants(); h.m.dispose();
});

test('战斗结算达到门槛后在下一休整期开放选择，不直接发装', () => {
  const { h, ps } = prepColumbia();
  for (const id of MEMBERS) deployMember(h, ps, id);
  ps.addLayers(COLUMBIA_BOND, 19);
  ps.pendingLayerGains = { [COLUMBIA_BOND]: 1 };
  h.m.lastResults.set(ps.playerId, { leaked: [], perfect: true, layerGains: { [COLUMBIA_BOND]: 1 } });
  h.m.settle(null, null);
  assert.equal(ps.layers[COLUMBIA_BOND], 20);
  assert.equal(ps.offers.length, 0);
  assert.equal(techItems(ps).length, 0);
  h.toPrep(2);
  assert.equal(ps.offers[0].source, SOURCE);
  takeTechOffers(ps);
  assert.equal(ps.columbiaTech.length, 1);
  h.invariants(); h.m.dispose();
});

test('未领取的哥伦比亚候选跨休整期保留，其他奖励仍到期清理', () => {
  const { h, ps } = prepColumbia();
  for (const id of MEMBERS) deployMember(h, ps, id);
  ps.addLayers(COLUMBIA_BOND, 20);
  const offer = structuredClone(ps.offers[0]);
  ps.pushItemOffer(['chess_item_1_01_e_a']);
  ps.endPrep();
  assert.deepEqual(ps.offers, [offer]);
  h.m.enterPrep();
  assert.deepEqual(ps.offers, [offer]);
  takeTechOffers(ps);
  assert.equal(ps.columbiaTech.length, 1);
  h.m.dispose();
});

test('整备区满时二选一保持原候选和未领取次数，腾出空间后可领取', () => {
  const { h, ps } = prepColumbia();
  for (const id of MEMBERS) deployMember(h, ps, id);
  const fillers = Object.values(DATA.items).filter(it => !TECH_IDS.has(it.id));
  while (ps.hand.some(p => p == null)) giveItem(h.m, ps, fillers.shift().id);
  ps.addLayers(COLUMBIA_BOND, 20);
  const offer = structuredClone(ps.offers[0]);
  assert.deepEqual(ps.pickReward(0), { error: 'HAND_FULL' });
  assert.deepEqual(ps.offers, [offer]);
  assert.deepEqual(ps.columbiaTech, []);
  assert.deepEqual(ps.destroy(ps.hand.find(p => p.kind === 'item').uid), { ok: true });
  assert.deepEqual(ps.offers, [offer]);
  takeTechOffers(ps);
  assert.equal(ps.columbiaTech.length, 1);
  h.invariants(); h.m.dispose();
});

for (const tech of COLUMBIA_TECH_ITEMS) {
  test(tech.name + '拒绝非成员且不销毁旧装备，普通、精锐与外援哥伦比亚成员均可配发', () => {
    const h = makeMatch({ mode: 'solo', difficulty: 'FUNNY', fake: true }).start().toPrep(1), ps = h.ps('p_0');
    ps.hand.fill(null); ps.temp.fill(null);
    const target = give(h.m, ps, 'chess_char_1_01_a');
    for (const id of ['chess_item_1_01_e_a', 'chess_item_1_02_e_a']) {
      const item = giveItem(h.m, ps, id);
      assert.deepEqual(ps.equip(item.uid, target.uid), { ok: true });
    }
    const item = giveItem(h.m, ps, columbiaTechItemId(tech.key), 'temp');
    const before = JSON.stringify({ hand: ps.hand, temp: ps.temp, target, equipped: ps.stats.itemsEquipped });
    assert.deepEqual(h.m.handle('p_0', { t: 'g.equip', itemUid: item.uid, targetUid: target.uid, replaceUid: target.items[1].uid }),
      { error: 'BAD_TARGET', detail: '仅【哥伦比亚】干员可用' });
    assert.equal(JSON.stringify({ hand: ps.hand, temp: ps.temp, target, equipped: ps.stats.itemsEquipped }), before);
    for (const id of ['chess_columbia_quartz_a', 'chess_columbia_quartz_b', 'chess_external_5_doroth_a', 'chess_external_6_doroth_b']) {
      const member = give(h.m, ps, id);
      const equipment = id === 'chess_columbia_quartz_a' ? item : giveItem(h.m, ps, columbiaTechItemId(tech.key));
      assert.deepEqual(ps.equip(equipment.uid, member.uid), { ok: true }, id);
      assert.equal(member.items.at(-1).id, equipment.id);
    }
  });
}
