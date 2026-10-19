import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, makeMatch, give, giveItem, legalTileFor } from './harness.js';
import { COLUMBIA_BOND, COLUMBIA_TECH_ITEMS, columbiaTechItemId } from '../../shared/columbia.js';

const MEMBERS = ['chess_columbia_quartz_a', 'chess_columbia_halo_a', 'chess_char_2_02_a'];
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

for (const layers of [49, 50, 150, 999]) {
  test(`哥伦比亚未激活时累积${layers}层，部署第三名成员立即补齐科技装备且重算不重复`, () => {
    const { h, ps } = prepColumbia();
    ps.addLayers(COLUMBIA_BOND, layers);
    for (const id of MEMBERS.slice(0, 2)) deployMember(h, ps, id);
    assert.equal(ps.bonds[COLUMBIA_BOND].active, false);
    assert.equal(techItems(ps).length, 0);
    assert.deepEqual(ps.columbiaTech, []);

    const third = deployMember(h, ps, MEMBERS[2]);
    const expected = Math.min(6, Math.floor(layers / 50));
    assert.equal(ps.bonds[COLUMBIA_BOND].active, true);
    assert.equal(ps.columbiaTech.length, expected);
    const granted = techItems(ps).map(p => p.id).sort();
    assert.equal(granted.length, expected);
    assert.equal(new Set(granted).size, expected);
    const view = ps.privateView();
    assert.deepEqual([...view.hand, ...view.temp].filter(p => p && TECH_IDS.has(p.id)).map(p => p.id).sort(), granted);

    ps.recompute(); ps.recompute();
    const idx = ps.hand.findIndex(p => p == null);
    assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.move', uid: third.piece.uid, to: { area: 'hand', idx } }), { ok: true });
    assert.equal(ps.bonds[COLUMBIA_BOND].active, false);
    assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.move', uid: third.piece.uid,
      to: { area: 'board', row: third.row, col: third.col } }), { ok: true });
    assert.deepEqual(techItems(ps).map(p => p.id).sort(), granted);
    assert.equal(ps.columbiaTech.length, expected);
    h.invariants();
    h.m.dispose();
  });
}

test('哥伦比亚已激活时从49跨到50层发装，跨多个里程碑补齐且销毁装备不重发', () => {
  const { h, ps } = prepColumbia();
  for (const id of MEMBERS) deployMember(h, ps, id);
  ps.addLayers(COLUMBIA_BOND, 49);
  assert.equal(techItems(ps).length, 0);
  ps.addLayers(COLUMBIA_BOND, 1);
  assert.equal(techItems(ps).length, 1);
  ps.addLayers(COLUMBIA_BOND, 125);
  assert.equal(techItems(ps).length, 3);
  assert.equal(new Set(ps.columbiaTech).size, 3);
  const item = techItems(ps)[0];
  assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.destroy', uid: item.uid }), { ok: true });
  ps.recompute();
  assert.equal(techItems(ps).length, 2);
  assert.equal(ps.columbiaTech.length, 3);
  ps.addLayers(COLUMBIA_BOND, 125);
  assert.equal(ps.columbiaTech.length, 6);
  assert.equal(new Set(ps.columbiaTech).size, 6);
  assert.equal(techItems(ps).length, 5);
  h.invariants();
  h.m.dispose();
});

test('哥伦比亚战斗结算跨过50层时发装，下一回合不重复领取', () => {
  const { h, ps } = prepColumbia();
  for (const id of MEMBERS) deployMember(h, ps, id);
  ps.addLayers(COLUMBIA_BOND, 49);
  ps.pendingLayerGains = { [COLUMBIA_BOND]: 1 };
  h.m.lastResults.set(ps.playerId, { leaked: [], perfect: true, layerGains: { [COLUMBIA_BOND]: 1 } });
  h.m.settle(null, null);
  assert.equal(ps.layers[COLUMBIA_BOND], 50);
  assert.equal(ps.pendingLayerGains, null);
  assert.equal(techItems(ps).length, 1);
  assert.equal(ps.columbiaTech.length, 1);
  h.toPrep(2);
  assert.equal(techItems(ps).length, 1);
  assert.equal(ps.columbiaTech.length, 1);
  h.invariants();
  h.m.dispose();
});

test('哥伦比亚两个整备区都满时保留名额，腾出空间后补发且不重复提示', () => {
  const { h, ps } = prepColumbia();
  for (const id of MEMBERS) deployMember(h, ps, id);
  const fillers = Object.values(DATA.items).filter(it => !TECH_IDS.has(it.id) &&
    ![...ps.hand, ...ps.temp].some(p => p?.id === it.id));
  for (const area of ['hand', 'temp']) {
    while (ps[area].some(p => p == null)) giveItem(h.m, ps, fillers.shift().id, area);
  }
  const toasts = h.allTo(ps.playerId, 'm.toast').length;
  ps.addLayers(COLUMBIA_BOND, 100);
  ps.recompute();
  assert.deepEqual(ps.columbiaTech, []);
  assert.equal(h.allTo(ps.playerId, 'm.toast').length, toasts);
  const first = ps.hand.find(p => p.kind === 'item');
  assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.destroy', uid: first.uid }), { ok: true });
  assert.equal(ps.columbiaTech.length, 1);
  assert.equal(techItems(ps).length, 1);
  const second = ps.temp.find(p => p.kind === 'item');
  assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.destroy', uid: second.uid }), { ok: true });
  assert.equal(ps.columbiaTech.length, 2);
  assert.equal(techItems(ps).length, 2);
  assert.equal(new Set(ps.columbiaTech).size, 2);
  h.invariants();
  h.m.dispose();
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
