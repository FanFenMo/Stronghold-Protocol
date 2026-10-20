// 哥伦比亚（columbiaShip）的本地数据生成：盟约记录、效果、成员标记、六件科技装备与叠层特质。
//
// 挂载点：tools/custom-data.mjs 的 applyCustomData()，与阿戈尔、繁盛、策略并列，在官方数据构建之后运行。
// 重复运行不会追加重复条目（与 applyProsperityData 相同的约定）。
//
// 与繁盛的关键差异：繁盛克隆的是附加盟约 preciShip（isCore:false），哥伦比亚是**核心盟约**，因此克隆
// yanShip（bondType SEASON / isCore:true）。但成员不走向 powerIdList 自动圈人的官方路线，而是像繁盛那样
// 直接写 members —— 这是本项目主人选定的口径（见 docs/COLUMBIA.md）。

import { COLUMBIA_BOND as ID, COLUMBIA_TECH_CAP, COLUMBIA_TECH_LAYERS, COLUMBIA_TECH_ITEMS, COLUMBIA_EQUIPMENT_BASE_BONUS, COLUMBIA_RES_CAP, columbiaTechItemId } from '../shared/columbia.js';
import { contentHash } from './assets/manifest.mjs';
import { COLUMBIA_NORMAL_OPERATORS, columbiaChessId } from './columbia-roster-data.mjs';

/**
 * 哥伦比亚的成员名单（手写，`_a` 即普通版；精锐 `_b` 由同一条 base 记录共享，不单独列出）。
 *
 * 说明：干员名与数据的对应关系已逐条核对（`data/chess.json` 的 tier 与你给的名单一致）：
 *   赫默 char_2_02 / 锡人 char_2_19 / 塞雷娅 char_5_11 / 溯光星源 char_6_16
 */
const DOROTHY = 'char_4048_doroth';
const DOROTHY_CHESS = [5, 6].map(tier => `chess_external_${tier}_doroth_a`);

export const COLUMBIA_MEMBERS = [
  'chess_char_2_02_a',          // 赫默   T2
  'chess_char_2_19_a',          // 锡人   T2
  'chess_char_5_11_a',          // 塞雷娅 T5
  'chess_char_6_16_a',          // 溯光星源 T6
  ...COLUMBIA_NORMAL_OPERATORS.map(op => columbiaChessId(op.charId)),
  ...DOROTHY_CHESS,
];

const techDescription = `达到${COLUMBIA_TECH_LAYERS.join('/')}层时各获得一次科技装备选择；休整期开始或休整期内达标时，从两件随机未领取装备中选择一件，最后一种直接领取；仅【哥伦比亚】干员可用，至多${COLUMBIA_TECH_CAP}件。`;
const desc = `<在场3名不同【哥伦比亚】干员>装备加成初始提升${COLUMBIA_EQUIPMENT_BASE_BONUS * 100}%，每100层再提升30%；${techDescription}\n`
  + '<在场6名不同【哥伦比亚】干员>激活哥伦比亚科技装备的专属效果。';
const effectDesc = desc;

const bb = {
  tech_cap: COLUMBIA_TECH_CAP,
  ...Object.fromEntries(COLUMBIA_TECH_LAYERS.map((layer, i) => [`tech_layer_${i + 1}`, layer])),
  equipment_bonus_base: COLUMBIA_EQUIPMENT_BASE_BONUS,
  equipment_bonus_per_layer: 0.003,
};
const bbStr = { key: 'custom_bond_eff_columbia' };

/** 六件科技装备的记录：BOND_SIGNATURE + requiresBondId（"仅哥伦比亚干员可用"），且不可合并（"不重复"）。 */
function columbiaItems() {
  const out = {};
  COLUMBIA_TECH_ITEMS.forEach((it, i) => {
    const id = columbiaTechItemId(it.key, false);
    const v = { ...it.base, ...it.normal };
    out[id] = {
      id,
      baseId: id,
      goldenId: null,
      isGolden: false,
      // 数据校验要求 trapId 是字符串、且与 iconId 一致（test/data.test.js）
      trapId: `trap_columbia_${it.key}`,
      iconId: `trap_columbia_${it.key}`,
      identifier: 900 + i,
      name: it.name,
      itemType: 'EQUIP',
      tier: 3,
      shopSortId: 0,
      price: 0,
      // 只在盟约发放时出现，不进商店
      hideInShop: true,
      shopExcluded: true,
      shopExcludedBy: null,
      // "不重复"：同名不再合成进阶装备
      mergeable: false,
      upgradeNum: 1,
      upgradeChessId: null,
      duration: -1,
      giveBondId: null,
      givePowerId: null,
      canGiveBond: false,
      requiresBondId: ID,
      effectId: `eff_columbia_${it.key}`,
      effectName: it.name,
      desc: columbiaItemDesc(it.key, v),
      descRaw: columbiaItemDesc(it.key, v),
      buffs: [{ key: 'env_gbuff_new', countType: 'NONE', bb: { ...v }, bbStr: { key: `custom_item_eff_columbia_${it.key}`, bond_id: ID } }],
      params: { ...v, key: `custom_item_eff_columbia_${it.key}`, bond_id: ID },
      category: 'BOND_SIGNATURE',
      kind: 'passive',
      family: null,
      implFormula: COLUMBIA_ITEM_FORMULA[it.key] || '',
      note: null,
      rangeGrid: [[0, 0]],
      flavor: '',
    };
  });
  return out;
}

/** 显示基础值，并将六人档专属效果单独列出。 */
function columbiaItemDesc(key, v) {
  const pct = (n) => `${Number((n * 100).toFixed(1))}%`;
  const special = '\n在场6名不同【哥伦比亚】干员：';
  switch (key) {
    case 'pioneer':
      return `基础效果：携带者基础攻击力+${v.atkFlat}，周围四格干员基础攻击力+${v.aroundAtk}。${special}`
        + `攻击造成${pct(v.atkScale)}伤害，每三次攻击增加${pct(v.perThree)}，最高${pct(v.cap)}；层数只提升超过100%的伤害加成。`;
    case 'mapland':
      return `基础效果：携带者攻击速度+${v.aspd}，基础攻击力+${v.atkFlat}。${special}`
        + `为百分比生命值最低的干员回复相当于造成伤害${pct(v.healRatio)}的生命值。`;
    case 'shield':
      return `基础效果：携带者阻挡数+${v.block}、生命值+${v.hp}，周围八格干员生命值+${v.aroundHp}。${special}`
        + `获得${pct(v.resRatio)}最大生命值的防御与法术抗性，装备提供的法术抗性最多+${COLUMBIA_RES_CAP}。`;
    case 'graymatter':
      return `基础效果：攻击力+${pct(v.atkPct)}，额外获得周围四格干员攻击力总和的${pct(v.aroundAtkRatio)}。${special}`
        + `每造成1000点伤害，攻击力+${pct(v.perThousand)}，`
        + `最多${v.maxStacks}层；攻击附带${pct(v.necrosis)}神经损伤。`;
    case 'dover':
      return `基础效果：治疗效果+${pct(v.healUp)}，每次治疗人数+${v.healTargets}。${special}`
        + `每次治疗为自身周围四格干员sp+${v.selfAroundSp}，`
        + `为治疗目标周围四格回复${pct(v.targetAroundHeal)}的治疗量。`;
    case 'antigrav':
      return `基础效果：携带者技能持续时间+${pct(v.skillDurationPct)}、技力回复+${v.spRegen}/秒。${special}`
        + `技能持续期间攻击范围内所有干员技力回复+${v.spRegen}/秒、攻击速度+${v.atkSpeed}。`;
    default:
      return '';
  }
}

const COLUMBIA_ITEM_FORMULA = {
  pioneer: 'Base: carrier ATK +200; N4 allies ATK +75. Six Columbia: damage x min(cap, atkScale + perThree * floor(attacks / 3)).',
  mapland: 'Base: ATK +200, ASPD +50. Six Columbia: heal lowest-HP% ally for healRatio x damage dealt.',
  shield: 'Base: HP +2000, block +3; N8 allies HP +500. Six Columbia: DEF += resRatio x maxHP; RES += min(30, resRatio x maxHP).',
  graymatter: 'Base: ATK +45%; ATK final addition += 15% x N4 allies ATK, excluding borrowed ATK. Six Columbia: ATK +1% per 1000 damage, max 100 stacks; attacks carry 5% neural damage.',
  dover: 'Base: healing +50%, healing targets +1 (unscaled). Six Columbia: grant SP to N4 allies and spread 15% healing to target N4 allies without recursion.',
  antigrav: 'Base: skill duration +30%, SP +0.25/s. Six Columbia: while skill active, allies in range gain SP +0.25/s and ASPD +40.',
};

/**
 * 给成员棋子的 `bonds` 数组加上 columbiaShip（普通与精锐各一份）。幂等。
 *
 * 单独导出是有原因的：build-data 在 applyCustomData 之后还会跑 applyExpandedRoster，后者会**重建**
 * `chess_external_*` 记录并覆盖 `bonds`，多萝西的单哥伦比亚归属须同时写入外援数据源。
 * 所以构建脚本必须在 applyExpandedRoster 之后再调用一次本函数。
 */
export function applyColumbiaMemberTags(files) {
  const chess = files && files.chess ? files.chess : {};
  for (const base of COLUMBIA_MEMBERS) {
    for (const suffix of ['a', 'b']) {
      const c = chess[base.replace(/_a$/, `_${suffix}`)];
      if (c?.charId === DOROTHY) c.bonds = [ID];
      else if (c && Array.isArray(c.bonds) && !c.bonds.includes(ID)) c.bonds.push(ID);
    }
  }
}

/** 素材：盟约图标与三态图标。 */
export function applyColumbiaAssets(assets) {
  assets.bonds[ID] = '/img/bonds/columbia-glyph.png';
  assets.bondStates = { ...assets.bondStates, [ID]: {
    inactive: '/img/bonds/columbia-inactive.png', active: '/img/bonds/columbia-active.png',
  } };
  // 六件科技装备的图标。这些是本项目自己的原创素材（不是游戏素材），所以放在
  // public/img/items/ —— 该目录不在 .gitignore 里，与 public/img/bonds/* 同一存放方式；
  // 而 public/assets/ 是被忽略的（游戏素材约定）。
  assets.items = assets.items && typeof assets.items === 'object' ? assets.items : {};
  for (const it of COLUMBIA_TECH_ITEMS) {
    assets.items[`trap_columbia_${it.key}`] = `/img/items/columbia-${it.key}.png`;
  }
  delete assets.bonds.twinShip;
  for (const type of ['AFT-Y', 'CHA-Y', 'CRU-X', 'PRP-X']) {
    const icon = assets.modules?.[type.toLowerCase()];
    if (icon) assets.modules[type] = icon;
  }
  if (assets.stats) assets.stats.bonds = Object.keys(assets.bonds).length;
  if (assets.hash) {
    const { version, hash, generator, stats, ...body } = assets;
    assets.hash = contentHash(body);
  }
}

/**
 * 把哥伦比亚盟约写进构建结果。与官方数据一样生成盟约、效果、成员与装备，重复运行不会追加重复条目。
 */
export function applyColumbiaData(files) {
  const { chess, bonds, effects, garrisons, config } = files;

  // 克隆一个核心盟约的骨架，再覆盖成本盟约自己的字段。
  bonds[ID] = {
    ...structuredClone(bonds.yanShip),
    bondId: ID,
    name: '哥伦比亚',
    identifier: 25,
    isCore: true,
    bondType: 'SEASON',
    bondOrder: 9,
    // 手写名单：留空 powerIdList，成员由下面的 members 显式给出
    powerIdList: [],
    iconId: 'icon_columbiaShip',
    activeCount: 3,
    thresholds: [3, 6],
    countMode: 'BOARD',
    countsHand: false,
    countsGoldenOnly: false,
    activeType: 'BATTLE',
    isActiveInDeck: false,
    noStack: false,
    weight: 10,
    maxInactiveBondCount: -1,
    layerMilestones: [],
    desc,
    descRaw: desc,
    effectId: 'bondeffect_columbia',
    effectName: '哥伦比亚',
    effectDesc,
    effectDescRaw: effectDesc,
    effectDescParams: [],
    bb,
    bbStr,
    buffs: [{ key: 'env_gbuff_new', bb, bbStr }],
    baseParams: [],
    perStackParams: [],
    members: [...COLUMBIA_MEMBERS],
    visibleMembers: [...COLUMBIA_MEMBERS],
    spec: {
      tiers: [
        { need: '3 distinct 哥伦比亚', effect: `装备加成初始提升${COLUMBIA_EQUIPMENT_BASE_BONUS * 100}%，每100层再提升30%；${techDescription}` },
        { need: '6 distinct 哥伦比亚', effect: '激活哥伦比亚科技装备的专属效果。' },
      ],
      formulas: {
        techCount: `count(layer <= L for layer in [${COLUMBIA_TECH_LAYERS.join(',')}])`,
        equipmentBonus: `${COLUMBIA_EQUIPMENT_BASE_BONUS} + max(0, L) * 0.003`,
        special: 'tier >= 2 and at least 6 distinct on-field Columbia members of the same player',
      },
      layerGain: '石英 休整期结束 +2/4；锡人 每3层攻击力与生命值+1/2%；星源 获得时 哥伦比亚+3、奇迹+1；'
        + '响石 作战中前三次击倒哥伦比亚 +2/4；星极 休整期结束哥伦比亚 +4/8、奥术 +3/6；赫默 休整期结束远见 +2/4、哥伦比亚 +3/6；谬因 每消耗2发子弹，已激活的哥伦比亚 +1/2、精准 +2/4。',
      assumed: [],
    },
  };

  effects.bondeffect_columbia = {
    ...structuredClone(effects.bondeffect_yan),
    effectId: 'bondeffect_columbia',
    name: '哥伦比亚',
    desc: effectDesc,
    descRaw: effectDesc,
    buffs: [{ key: 'env_gbuff_new', countType: 'NONE', bb, bbStr }],
    params: { ...bb, ...bbStr },
  };

  // 六件科技装备各自的效果记录。test/data.test.js 要求每个装备的 effectId 都能查到，
  // 缺了会影响构建产物的完整性校验。
  const bondEffectType = effects.bondeffect_yan ? effects.bondeffect_yan.effectType : 'NONE';
  for (const it of COLUMBIA_TECH_ITEMS) {
    const id = `eff_columbia_${it.key}`;
    const values = { ...it.base, ...it.normal };
    const text = columbiaItemDesc(it.key, values);
    effects[id] = {
      effectId: id,
      effectType: bondEffectType,
      name: it.name,
      desc: text,
      descRaw: text,
      counterType: 'NONE',
      continuedRound: 0,
      decoIconId: `trap_columbia_${it.key}`,
      enemyPrice: 0,
      buffs: [{ key: 'env_gbuff_new', countType: 'NONE', bb: values, bbStr: { key: `custom_item_eff_columbia_${it.key}`, bond_id: ID } }],
      params: { ...values, key: `custom_item_eff_columbia_${it.key}`, bond_id: ID },
    };
  }

  // 科技装备：加进 items 表。
  if (files.items) Object.assign(files.items, columbiaItems());

  // 成员标记：给棋子的 bonds 数组加 columbiaShip（普通与精锐都要）。
  applyColumbiaMemberTags(files);

  // 按干员设计明确盟约组合；重建每个盟约的成员索引，防止迁池后残留旧归属。
  const memberships = [
    ['chess_char_2_02_a', [ID, 'visiShip']],
    ['chess_char_2_19_a', [ID, 'swiftShip', 'investShip']],
    ['chess_char_5_11_a', [ID, 'steadShip']],
    ['chess_char_6_16_a', [ID, 'arcaneShip', 'skillfulShip']],
    ...COLUMBIA_NORMAL_OPERATORS.map(op => [columbiaChessId(op.charId), op.bonds]),
    ...DOROTHY_CHESS.map(base => [base, [ID]]),
  ];
  delete bonds.twinShip;
  delete effects.bondeffect_twin;
  for (const [base, memberBonds] of memberships) {
    for (const suffix of ['a', 'b']) {
      const c = chess[base.replace(/_a$/, `_${suffix}`)];
      if (c) c.bonds = [...memberBonds];
    }
    for (const b of Object.values(bonds)) for (const key of ['members', 'visibleMembers']) {
      b[key] = b[key].filter(id => id !== base);
      if (chess[base] && memberBonds.includes(b.bondId)) b[key].push(base);
    }
  }

  for (const [suffix, mul] of [['a', 1], ['b', 2]]) {
    const silent = `chess_char_2_02_${suffix}`;
    for (const gid of chess[silent].garrisonIds) garrisons[gid].owners = garrisons[gid].owners.filter(owner => owner !== silent);
    chess[silent].garrisonIds = [];
    const add = (stem, base, template, desc, bb, bbStr, fields = {}) => {
      const owner = base.replace(/_a$/, `_${suffix}`), gid = `garrison_custom_columbia_${stem}_${suffix}`;
      if (!chess[owner]) return;
      garrisons[gid] = { ...structuredClone(garrisons[`${template}_${suffix}`]), ...fields,
        garrisonId: gid, owners: [owner], desc, descRaw: desc, bb, bbStr };
      if (!chess[owner].garrisonIds.includes(gid)) chess[owner].garrisonIds.push(gid);
    };
    add('quartz', columbiaChessId('char_4063_quartz'), 'garrison_154', `<休整期结束时>使已激活的【哥伦比亚】层数+${2 * mul}`,
      { count: 2 * mul }, { bond: ID, conditionkey: 'character_target_inboard' });
    add('silent', 'chess_char_2_02_a', 'garrison_154', `<休整期结束时>使已激活的【远见】层数+${2 * mul}、【哥伦比亚】层数+${3 * mul}`,
      {}, { bond: `visiShip,${ID}`, count: `${2 * mul},${3 * mul}`, conditionkey: 'character_target_inboard' },
      { effectType: 'SERVER_ADD_MULTIPLE_BOND', effectKey: 'SERVER_ADD_MULTIPLE_BOND' });
    add('halo', columbiaChessId('char_135_halo'), 'garrison_25', `<获得时>【哥伦比亚】层数+${3 * mul}，【奇迹】层数+${mul}（无需激活盟约）`,
      {}, { bond: `${ID},miraShip`, count: `${3 * mul},${mul}` },
      { effectType: 'SERVER_ADD_MULTIPLE_BOND', effectKey: 'SERVER_ADD_MULTIPLE_BOND' });
    add('astesi', columbiaChessId('char_274_astesi'), 'garrison_154', `<休整期结束时>使已激活的【哥伦比亚】层数+${4 * mul}，【奥术】层数+${3 * mul}`,
      {}, { bond: `${ID},arcaneShip`, count: `${4 * mul},${3 * mul}`, conditionkey: 'character_target_inboard' },
      { effectType: 'SERVER_ADD_MULTIPLE_BOND', effectKey: 'SERVER_ADD_MULTIPLE_BOND' });
    add('tinman', 'chess_char_2_19_a', 'garrison_151', `【哥伦比亚】每叠加3层，本干员攻击力和生命值+${mul}%`,
      { divide_num: 3, atk: 0.01 * mul, max_hp: 0.01 * mul },
      { key: 'act1autochess_gar_eff_attrByBond', bond_id: ID });
    for (const [stem, bond, name, amount] of [['aphris', ID, '哥伦比亚', mul], ['aphris_preci', 'preciShip', '精准', 2 * mul]]) {
      add(stem, columbiaChessId('char_4229_aphris'), 'garrison_23', `<战斗中>自身每消耗2发子弹，使已激活的【${name}】层数+${amount}`,
        { at_root: 1, consume_count: 2, bond_add_count: amount },
        { key: 'act1autochess_gar_event_consume_ammo', range_id: '0-1', bond_id: bond, bond_type: 'bond_by_id', bond_add_type: 'by_count' });
    }
    add('cairn', columbiaChessId('char_4214_cairn'), 'garrison_140', `<战斗中>前三次击倒敌人时，使已激活的【哥伦比亚】层数+${2 * mul}`,
      { bond_add_count: 2 * mul, check_cnt: 1, max_add_count_per_battle: 6 * mul },
      { key: 'act1autochess_gar_event_selfkillenemy', bond_type: 'bond_by_id', bond_id: ID, bond_add_type: 'by_count' },
      { effectKey: 'act1autochess_gar_event_selfkillenemy' });
    add('heyak_stats', columbiaChessId('char_4027_heyak'), 'garrison_08', `攻击力和生命值+${25 * mul}%`,
      { atk: 0.25 * mul, max_hp: 0.25 * mul }, { key: 'attr_common_global_buff' });
    add('heyak_weakness', columbiaChessId('char_4027_heyak'), 'garrison_01', '攻击变为弱点伤害',
      {}, { key: 'act1autochess_gar_eff_chaos' });
  }

  // 双星属于干员特性，不进入盟约统计或随机禁用池。
  const twinDesc = '<战斗中>双星：同一玩家的星极与星源或溯光星源同时在场时共享装备效果；攻击范围重叠时，互相视作攻击范围的延伸。';
  for (const base of [columbiaChessId('char_274_astesi'), columbiaChessId('char_135_halo'), 'chess_char_6_16_a']) {
    for (const suffix of ['a', 'b']) {
      const owner = base.replace(/_a$/, `_${suffix}`), gid = `garrison_custom_twin_${owner}`;
      if (!chess[owner]) continue;
      garrisons[gid] = { ...structuredClone(garrisons[`garrison_08_${suffix}`]), garrisonId: gid,
        desc: twinDesc, descRaw: twinDesc, owners: [owner], effectType: 'CUSTOM_TWIN_STARS', effectKey: 'CUSTOM_TWIN_STARS',
        battleRuneKey: null, bb: {}, bbStr: {} };
      if (!chess[owner].garrisonIds.includes(gid)) chess[owner].garrisonIds.push(gid);
    }
  }

  // v1.1 溯光星源只保留原有奥术／灵巧叠层，移除旧生成结果中的哥伦比亚追加特质。
  for (const suffix of ['a', 'b']) {
    const owner = `chess_char_6_16_${suffix}`;
    const gid = `garrison_custom_columbia_astgenne_${suffix}`;
    delete garrisons[gid];
    if (chess[owner]) chess[owner].garrisonIds = chess[owner].garrisonIds.filter(id => id !== gid);
  }

  // 模式名单：哥伦比亚是核心盟约，与其它核心盟约一样从"本局禁用"里移除、加进可用名单。
  for (const mode of Object.values(config.modes)) {
    mode.inactiveBondIds = mode.inactiveBondIds.filter((id) => id !== ID);
    if (!mode.activeBondIds.includes(ID)) mode.activeBondIds.push(ID);
    mode.activeBondIds = mode.activeBondIds.filter(id => id !== 'twinShip');
    mode.inactiveBondIds = mode.inactiveBondIds.filter(id => id !== 'twinShip');
  }

  if (files.assets) applyColumbiaAssets(files.assets);
}
