import { PROSPERITY_BOND as ID, PROSPERITY_LAYER_CAP } from '../shared/prosperity.js';
import { contentHash } from './assets/manifest.mjs';

export const PROSPERITY_MEMBERS = [
  'chess_char_1_06_a', 'chess_char_1_10_a',
  'chess_char_2_02_a', 'chess_char_2_05_a', 'chess_char_2_06_a', 'chess_char_2_14_a',
  'chess_char_4_21_a', 'chess_char_4_26_a',
  'chess_char_5_02_a', 'chess_char_5_10_a', 'chess_char_5_11_a', 'chess_char_5_23_a',
  'chess_char_6_08_a', 'chess_char_6_14_a', 'chess_char_6_20_a',
];
export const RETIRED_CHESS = ['chess_char_4_15_a', 'chess_char_4_15_b', 'chess_char_5_09_a', 'chess_char_5_09_b'];

export function applyProsperityAssets(assets) {
  assets.bonds[ID] = '/img/bonds/prosperity-inactive.png';
  assets.bondStates = { ...assets.bondStates, [ID]: {
    inactive: '/img/bonds/prosperity-inactive.png', active: '/img/bonds/prosperity-active.png',
  } };
  if (assets.stats) assets.stats.bonds = Object.keys(assets.bonds).length;
  if (assets.hash) {
    const { version, hash, generator, stats, ...body } = assets;
    assets.hash = contentHash(body);
  }
}

// 与官方数据一样生成盟约、特性和成员，重复运行不会追加重复条目。
export function applyProsperityData(files) {
  const { chess, bonds, effects, garrisons, config } = files;
  const desc = '<在场2名不同【繁盛】干员>【繁盛】干员治疗效果+20%，每50层额外+10%，最多200层（最高+60%）。\n'
    + '<在场3名不同【繁盛】干员>各自累计对其他干员实际恢复的生命值。攻击范围内有敌人时，每秒释放生命球并清空全部计数：伤害为治疗计数÷5，单次最多5000；爆炸范围内敌人受到真实伤害和0.5秒晕眩，我方干员恢复伤害值一半的生命。初始范围为中心与上下左右五格，40层起扩大为九宫格。生命球不触发咒愈，也不再次累计治疗计数。';
  const bb = { base_heal: 0.2, heal_per_50: 0.1, layer_cap: PROSPERITY_LAYER_CAP,
    orb_damage_cap: 5000, orb_heal_divide: 5, orb_ally_ratio: 0.5, orb_interval: 1, orb_stun: 0.5, wide_layers: 40 };
  const bbStr = { key: 'custom_bond_eff_prosperity' };
  const effectDesc = '【繁盛】干员治疗效果+{0:0%}（每50层额外+10%，最多200层，最高+60%）。\n'
    + '<在场3名不同【繁盛】干员>实际治疗量÷5转为生命球伤害（上限5000），每秒有敌人在攻击范围内时释放并清空计数。当前爆炸范围为{1}格，对敌方造成群体真伤及0.5秒晕眩，对我方干员治疗伤害量的一半。';
  bonds[ID] = { ...structuredClone(bonds.preciShip), bondId: ID, name: '繁盛', identifier: 24,
    iconId: 'icon_prosperityShip', effectId: 'bondeffect_prosperity', effectName: '繁盛',
    desc, descRaw: desc, effectDesc, effectDescRaw: effectDesc, effectDescParams: [],
    bb, bbStr, buffs: [{ key: 'env_gbuff_new', bb, bbStr }], baseParams: ['base_heal'], perStackParams: [],
    members: [...PROSPERITY_MEMBERS], visibleMembers: [...PROSPERITY_MEMBERS], layerCap: PROSPERITY_LAYER_CAP,
    spec: { tiers: [{ need: '2 distinct', effect: '成员治疗效果提升20%，每50层+10%。' },
      { need: '3 distinct', effect: '实际治疗其他干员累积计数，每秒释放生命球，释放后清空全部计数。' }],
      formulas: { healingBonus: '0.20 + 0.10 * floor(min(L, 200) / 50)',
        orbDamage: 'min(actualHealing / 5, 5000)', orbHealing: 'orbDamage / 2' },
      layerGain: '刺玫休整期结束+1；莎草获得时+3；华法琳获得时+4；纯烬艾雅法拉开技能时同行每人+1；精锐均翻倍。', assumed: [] } };
  effects.bondeffect_prosperity = { ...structuredClone(effects.bondeffect_preci), effectId: 'bondeffect_prosperity',
    name: '繁盛', desc: effectDesc, descRaw: effectDesc, buffs: [{ key: 'env_gbuff_new', countType: 'NONE', bb, bbStr }], params: { ...bb, ...bbStr } };
  for (const base of PROSPERITY_MEMBERS) for (const suffix of ['a', 'b']) {
    const c = chess[base.replace(/_a$/, `_${suffix}`)];
    if (!c.bonds.includes(ID)) c.bonds.push(ID);
  }
  for (const mode of Object.values(config.modes)) {
    mode.inactiveBondIds = mode.inactiveBondIds.filter(id => id !== ID);
    if (!mode.activeBondIds.includes(ID)) mode.activeBondIds.push(ID);
  }
  for (const [suffix, mul] of [['a', 1], ['b', 2]]) {
    const add = (stem, tier, index, template, desc, bb, bbStr, fields = {}) => {
      const owner = `chess_char_${tier}_${index}_${suffix}`, gid = `garrison_custom_prosperity_${stem}_${suffix}`;
      garrisons[gid] = { ...structuredClone(garrisons[`${template}_${suffix}`]), ...fields,
        garrisonId: gid, owners: [owner], desc, descRaw: desc, bb, bbStr };
      if (!chess[owner].garrisonIds.includes(gid)) chess[owner].garrisonIds.push(gid);
    };
    add('vendla', 1, '06', 'garrison_154', `<休整期结束时>使已激活的【繁盛】层数+${mul}`,
      { count: mul }, { bond: ID, conditionkey: 'character_target_inboard' });
    for (const [stem, tier, index, count] of [['papyrus', 2, '06', 3], ['warfarin', 4, '26', 4]]) {
      add(stem, tier, index, 'garrison_25', `<获得时>【繁盛】层数+${count * mul}（无需激活盟约）`,
        { count: count * mul }, { bond: ID }, { effectType: 'SERVER_ADD_BOND', effectKey: 'SERVER_ADD_BOND' });
    }
    add('eyja2', 6, '20', 'garrison_140', `<战斗中>开启技能时，同一行每有1名在场干员（含自身），使已激活的【繁盛】层数+${mul}`,
      { bond_add_count_multi: mul, bond_add_count_divide: 1 },
      { key: 'act1autochess_gar_event_useskill', bond_type: 'bond_by_id', bond_id: ID, bond_add_type: 'by_charcount_samerow' });
  }
  for (const id of RETIRED_CHESS) delete chess[id];
  for (const b of Object.values(bonds)) for (const key of ['members', 'visibleMembers']) {
    if (b[key]) b[key] = b[key].filter(id => !RETIRED_CHESS.includes(id));
  }
  for (const [id, g] of Object.entries(garrisons)) {
    const hadOwners = g.owners?.length;
    if (hadOwners) {
      g.owners = g.owners.filter(id => !RETIRED_CHESS.includes(id));
      if (!g.owners.length) delete garrisons[id];
    }
  }
  if (files.assets) applyProsperityAssets(files.assets);
}
