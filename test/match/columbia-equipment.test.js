import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, makeMatch, give, giveItem } from './harness.js';
import { COLUMBIA_TECH_ITEMS, columbiaTechItemId } from '../../shared/columbia.js';

for (const tech of COLUMBIA_TECH_ITEMS) {
  test(tech.name + '拒绝非成员且不销毁旧装备，普通、精锐与外援哥伦比亚成员均可配发', () => {
    const h = makeMatch({ mode: 'solo', difficulty: 'FUNNY', fake: true }).start().toPrep(1), ps = h.ps('p_0');
    ps.hand.fill(null); ps.temp.fill(null);
    const target = give(h.m, ps, 'chess_char_1_01_a');
    for (const id of ['chess_item_1_01_e_a', 'chess_item_1_02_e_a']) {
      const item = giveItem(h.m, ps, id);
      assert.deepEqual(ps.equip(item.uid, target.uid), { ok: true });
    }
    const item = giveItem(h.m, ps, columbiaTechItemId(tech.key));
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
