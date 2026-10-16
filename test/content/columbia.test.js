// 哥伦比亚盟约：数据生成与共用数值。战斗级效果由 npm run golden 与 UI 测试覆盖。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../match/harness.js';
import { applyColumbiaData, COLUMBIA_MEMBERS } from '../../tools/columbia-data.mjs';
import {
  COLUMBIA_BOND, COLUMBIA_TECH_CAP, COLUMBIA_TECH_STEP, COLUMBIA_OVERLOAD_ATK_SPEED,
  COLUMBIA_TECH_ITEMS, columbiaTechCount, columbiaOverloaded, columbiaTechItem, columbiaTechItemId,
} from '../../shared/columbia.js';

const ID = COLUMBIA_BOND;

test('哥伦比亚：数据生成幂等', () => {
  const copy = structuredClone(DATA);
  applyColumbiaData(copy);
  const once = JSON.stringify(copy);
  applyColumbiaData(copy);
  assert.equal(JSON.stringify(copy), once);
});

test('哥伦比亚是核心盟约，阈值 3/6，成员为手写名单', () => {
  const b = DATA.bonds[ID];
  assert.ok(b, '盟约记录存在');
  assert.equal(b.isCore, true);
  assert.equal(b.name, '哥伦比亚');
  assert.deepEqual(b.thresholds, [3, 6]);
  assert.equal(b.activeCount, 3);
  assert.deepEqual(b.powerIdList, [], '手写名单：不走向 powerIdList 自动圈人的官方路线');
  assert.deepEqual(b.members, COLUMBIA_MEMBERS);
  assert.deepEqual(b.visibleMembers, COLUMBIA_MEMBERS);
  assert.equal(b.effectId, 'bondeffect_columbia');
  assert.ok(DATA.effects.bondeffect_columbia, '效果记录存在');
});

test('名单里的干员都带上了 columbiaShip（普通与精锐各一份）', () => {
  for (const base of COLUMBIA_MEMBERS) {
    for (const suffix of ['a', 'b']) {
      const c = DATA.chess[base.replace(/_a$/, `_${suffix}`)];
      assert.ok(c, `${base} 的 _${suffix} 版本存在`);
      assert.ok(c.bonds.includes(ID), `${c.name}(${suffix}) 属于哥伦比亚`);
    }
  }
});

test('六件科技装备：仅哥伦比亚可用、不可合并、不进商店', () => {
  assert.equal(COLUMBIA_TECH_ITEMS.length, 6);
  for (const it of COLUMBIA_TECH_ITEMS) {
    const rec = DATA.items[columbiaTechItemId(it.key, false)];
    assert.ok(rec, `${it.name} 记录存在`);
    assert.equal(rec.requiresBondId, ID, '仅哥伦比亚干员可用');
    assert.equal(rec.mergeable, false, '“不重复”：不能合成进阶装备');
    assert.equal(rec.category, 'BOND_SIGNATURE');
    assert.equal(rec.hideInShop, true);
    assert.equal(rec.upgradeChessId, null);
    assert.equal(rec.goldenId, null);
  }
});

test('每 50 层一件、6 件封顶；过载在 (6) 档生效', () => {
  assert.equal(columbiaTechCount(0), 0);
  assert.equal(columbiaTechCount(49), 0);
  assert.equal(columbiaTechCount(50), 1);
  assert.equal(columbiaTechCount(150), 3);
  assert.equal(columbiaTechCount(300), COLUMBIA_TECH_CAP);
  assert.equal(columbiaTechCount(999), COLUMBIA_TECH_CAP, '封顶不随层数继续增长');
  assert.equal(COLUMBIA_TECH_STEP, 50);

  assert.equal(columbiaOverloaded(0), false);
  assert.equal(columbiaOverloaded(3), false);
  assert.equal(columbiaOverloaded(6), true);
});

test('拓荒者蓄力装具是过载特例：不是简单翻倍', () => {
  const pioneer = columbiaTechItem('pioneer');
  assert.deepEqual(pioneer.normal, { atkScale: 1.15, perThree: 0.01, cap: 2.0 });
  assert.deepEqual(pioneer.overload, { atkScale: 1.3, perThree: 0.02, cap: 4.0 });

  // 其余五件的**效果数值**恰好是普通值的两倍；但**层数上限不翻倍**
  // —— 设计里梅兰德 15 层、灰质引擎 100 层在两档相同。
  const CAP_KEYS = new Set(['atkDownMax', 'maxStacks']);
  for (const it of COLUMBIA_TECH_ITEMS) {
    if (it.key === 'pioneer') continue;
    for (const [k, v] of Object.entries(it.normal)) {
      const want = CAP_KEYS.has(k) ? v : v * 2;
      assert.equal(it.overload[k], want, `${it.name} 的 ${k}`);
    }
  }
  assert.equal(COLUMBIA_OVERLOAD_ATK_SPEED, 50);
});

test('溯光星源的双星：新增一条与奥术/灵巧同层数的哥伦比亚特质', () => {
  for (const [suffix, mul] of [['a', 1], ['b', 2]]) {
    const owner = `chess_char_6_16_${suffix}`;
    const gid = `garrison_custom_columbia_astgenne_${suffix}`;
    assert.ok(DATA.chess[owner].garrisonIds.includes(gid), `${owner} 挂上了 ${gid}`);
    const g = DATA.garrisons[gid];
    assert.equal(g.bb.layer, 2 * mul, '层数与原特质一致');
    assert.equal(g.bb.count, 3, '同样是每花费 3 资金');
    assert.equal(g.bbStr.bond, ID);
  }
  // 原特质原样保留
  const src = DATA.garrisons.garrison_121_a;
  assert.equal(src.bb.layer, 2);
  assert.equal(src.bbStr.bond, 'skillfulShip,arcaneShip');
});
