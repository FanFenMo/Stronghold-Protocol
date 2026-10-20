// 哥伦比亚盟约：数据生成与共用数值；战斗行为见 columbia-battle.test.js。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../match/harness.js';
import { applyColumbiaData, COLUMBIA_MEMBERS } from '../../tools/columbia-data.mjs';
import {
  COLUMBIA_BOND, COLUMBIA_TECH_CAP, COLUMBIA_TECH_LAYERS,
  COLUMBIA_TECH_ITEMS, columbiaTechCount, columbiaEquipmentBonus, columbiaTechItem, columbiaTechItemId,
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

test('指定层数各开放一次选择，三人装备成长保留初始50%增幅', () => {
  assert.deepEqual(COLUMBIA_TECH_LAYERS, [20, 50, 100, 170, 250, 350]);
  for (const [i, layer] of COLUMBIA_TECH_LAYERS.entries()) {
    assert.equal(columbiaTechCount(layer - 1), i);
    assert.equal(columbiaTechCount(layer), i + 1);
  }
  assert.equal(columbiaTechCount(999), COLUMBIA_TECH_CAP, '封顶不随层数继续增长');
  assert.equal(columbiaEquipmentBonus(0), 0.5);
  assert.equal(columbiaEquipmentBonus(100), 0.8);
  assert.equal(columbiaEquipmentBonus(300), 1.4);
});

test('科技装备移除旧过载、削攻、锁血与浮空参数', () => {
  const pioneer = columbiaTechItem('pioneer');
  assert.deepEqual(pioneer.normal, { atkScale: 1.15, perThree: 0.01, cap: 2.0 });
  for (const it of COLUMBIA_TECH_ITEMS) assert.equal(it.overload, undefined);
  assert.deepEqual(columbiaTechItem('mapland').normal, { healRatio: 0.15 });
  assert.deepEqual(columbiaTechItem('shield').base, { hp: 2000, block: 3, aroundHp: 500 });
  assert.equal(columbiaTechItem('shield').normal.hp, undefined);
  assert.equal(columbiaTechItem('graymatter').base.atkPct, 0.45);
  assert.equal(columbiaTechItem('graymatter').normal.atkPct, undefined);
  assert.deepEqual(columbiaTechItem('dover').base, { healUp: 0.5, healTargets: 1 });
  assert.equal(columbiaTechItem('dover').normal.healUp, undefined);
  assert.equal(columbiaTechItem('shield').normal.lockHpSeconds, undefined);
  assert.equal(columbiaTechItem('antigrav').normal.floatSeconds, undefined);
});

test('溯光星源不再叠加哥伦比亚，原有奥术灵巧与双星保留', () => {
  for (const [suffix, mul] of [['a', 1], ['b', 2]]) {
    const owner = `chess_char_6_16_${suffix}`;
    const gid = `garrison_custom_columbia_astgenne_${suffix}`;
    assert.ok(!DATA.chess[owner].garrisonIds.includes(gid));
    assert.equal(DATA.garrisons[gid], undefined);
  }
  // 原特质原样保留
  const src = DATA.garrisons.garrison_121_a;
  assert.equal(src.bb.layer, 2);
  assert.equal(src.bbStr.bond, 'skillfulShip,arcaneShip');
});

test('v1.2响石坚守、霍尔海雅独行及赫默休整结束叠层同步', () => {
  for (const suffix of ['a', 'b']) {
    for (const [stem, bonds] of [
      ['astesi', [ID, 'arcaneShip']], ['cairn', [ID, 'steadShip']],
      ['heyak', [ID, 'soloShip']], ['aphris', [ID, 'preciShip']],
    ]) assert.deepEqual(DATA.chess[`chess_columbia_${stem}_${suffix}`].bonds, bonds);
    assert.equal(DATA.garrisons[`garrison_custom_columbia_astesi_${suffix}`].bbStr.bond, `${ID},arcaneShip`);
    assert.equal(DATA.garrisons[`garrison_custom_columbia_cairn_${suffix}`].bbStr.bond_id, ID);
    const silent = DATA.garrisons[`garrison_custom_columbia_silent_${suffix}`];
    assert.equal(silent.eventType, 'SERVER_PREP_FIN');
    assert.equal(silent.bbStr.bond, `visiShip,${ID}`);
    assert.equal(silent.bbStr.count, suffix === 'a' ? '2,3' : '4,6');
    assert.deepEqual(DATA.chess[`chess_char_2_02_${suffix}`].garrisonIds, [silent.garrisonId]);
    assert.ok(!DATA.garrisons[`garrison_80_${suffix}`].owners.includes(`chess_char_2_02_${suffix}`));
  }
});

test('多萝西保留五六阶外援，只归属哥伦比亚，技能与召唤物入口保留', () => {
  assert.ok(DATA.backups.diy.ownedPool.includes('char_4048_doroth'));
  assert.deepEqual(DATA.backups.diy.operators.char_4048_doroth.bonds, [ID]);
  const entries = Object.values(DATA.chess).filter(c => c.charId === 'char_4048_doroth');
  assert.equal(entries.length, 4);
  for (const c of entries) {
    assert.equal(c.supportOperator, true);
    assert.deepEqual(c.bonds, [ID]);
    assert.equal(c.skills.length, 3);
    assert.ok(c.tokens.includes('token_10025_doroth_recttp'));
    assert.ok(!DATA.bonds.emptyShip.members.includes(c.baseId));
  }
});

test('双星仅出现在三名干员的普通与精锐特性中，不占盟约或禁用名额', () => {
  assert.equal(DATA.bonds.twinShip, undefined);
  assert.equal(DATA.effects.bondeffect_twin, undefined);
  assert.equal(DATA.assets.bonds.twinShip, undefined);
  for (const mode of Object.values(DATA.config.modes)) {
    assert.ok(!mode.activeBondIds.includes('twinShip'));
    assert.ok(!mode.inactiveBondIds.includes('twinShip'));
  }
  const bases = ['chess_columbia_astesi_a', 'chess_columbia_halo_a', 'chess_char_6_16_a'];
  for (const base of bases) for (const suffix of ['a', 'b']) {
    const c = DATA.chess[base.replace(/_a$/, '_' + suffix)];
    assert.ok(!c.bonds.includes('twinShip'));
    const features = c.garrisonIds.map(id => DATA.garrisons[id]).filter(g => g.effectKey === 'CUSTOM_TWIN_STARS');
    assert.equal(features.length, 1);
    assert.match(features[0].desc, /双星.*星极.*星源.*共享装备/);
  }
});
