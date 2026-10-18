// 哥伦比亚（columbiaShip）的本地数据生成：盟约记录、效果、成员标记、六件科技装备与叠层特质。
//
// 挂载点：tools/custom-data.mjs 的 applyCustomData()，与阿戈尔、繁盛、策略并列，在官方数据构建之后运行。
// 重复运行不会追加重复条目（与 applyProsperityData 相同的约定）。
//
// 与繁盛的关键差异：繁盛克隆的是附加盟约 preciShip（isCore:false），哥伦比亚是**核心盟约**，因此克隆
// yanShip（bondType SEASON / isCore:true）。但成员不走向 powerIdList 自动圈人的官方路线，而是像繁盛那样
// 直接写 members —— 这是本项目主人选定的口径（见 docs/COLUMBIA.md）。

import { COLUMBIA_BOND as ID, COLUMBIA_TECH_CAP, COLUMBIA_TECH_STEP, COLUMBIA_TECH_ITEMS, columbiaTechItemId } from '../shared/columbia.js';
import { contentHash } from './assets/manifest.mjs';
import { COLUMBIA_NORMAL_OPERATORS, columbiaChessId } from './columbia-roster-data.mjs';

/**
 * 哥伦比亚的成员名单（手写，`_a` 即普通版；精锐 `_b` 由同一条 base 记录共享，不单独列出）。
 *
 * 说明：干员名与数据的对应关系已逐条核对（`data/chess.json` 的 tier 与你给的名单一致）：
 *   赫默 char_2_02 / 锡人 char_2_19 / 塞雷娅 char_5_11 / 溯光星源 char_6_16
 */
export const COLUMBIA_MEMBERS = [
  'chess_char_2_02_a',          // 赫默   T2
  'chess_char_2_19_a',          // 锡人   T2
  'chess_char_5_11_a',          // 塞雷娅 T5
  'chess_char_6_16_a',          // 溯光星源 T6
  ...COLUMBIA_NORMAL_OPERATORS.map(op => columbiaChessId(op.charId)),
];

const desc = '<在场3名不同【哥伦比亚】干员>获得哥伦比亚的科技装备，仅【哥伦比亚】干员可用；'
  + `每叠加${COLUMBIA_TECH_STEP}层随机获得一件，不重复，至多${COLUMBIA_TECH_CAP}件。\n`
  + '<在场6名不同【哥伦比亚】干员>科技装备获得过载，其效果增加100%；所有佩戴科技装备的干员获得50攻速。';

const effectDesc = '<在场3名不同【哥伦比亚】干员>获得科技装备（仅【哥伦比亚】可用），'
  + `每${COLUMBIA_TECH_STEP}层随机一件、不重复，至多${COLUMBIA_TECH_CAP}件。\n`
  + '<在场6名不同【哥伦比亚】干员>科技装备过载：效果+100%，佩戴者攻速+50。';

const bb = {
  tech_cap: COLUMBIA_TECH_CAP,
  tech_step: COLUMBIA_TECH_STEP,
  overload_atk_speed: 50,
};
const bbStr = { key: 'custom_bond_eff_columbia' };

/** 六件科技装备的记录：BOND_SIGNATURE + requiresBondId（"仅哥伦比亚干员可用"），且不可合并（"不重复"）。 */
function columbiaItems() {
  const out = {};
  COLUMBIA_TECH_ITEMS.forEach((it, i) => {
    const id = columbiaTechItemId(it.key, false);
    const v = it.normal;
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

/** 单件科技装备的说明文字（过载后的数值在战斗内按档位切换，说明里同时列出两套）。 */
function columbiaItemDesc(key, v) {
  const ov = COLUMBIA_TECH_ITEMS.find((x) => x.key === key).overload;
  const pct = (n) => `${Number((n * 100).toFixed(1))}%`;
  switch (key) {
    case 'pioneer':
      return `攻击造成${pct(v.atkScale)}（${pct(ov.atkScale)}）伤害，每三次攻击增加${pct(v.perThree)}（${pct(ov.perThree)}），最高${pct(v.cap)}（${pct(ov.cap)}）。`;
    case 'mapland':
      return `为百分比生命值最低的干员回复相当于${pct(v.healRatio)}（${pct(ov.healRatio)}）造成的伤害的生命值；`
        + `对一名敌人造成伤害后削减其${pct(v.atkDown)}（${pct(ov.atkDown)}）攻击力，持续${v.atkDownDuration}（${ov.atkDownDuration}）秒，可叠加，最高${v.atkDownMax}层。`;
    case 'shield':
      return `获得${v.hp}（${ov.hp}）生命值，获得${pct(v.resRatio)}（${pct(ov.resRatio)}）最大生命值的双抗；`
        + `生命值首次跌下50%时，锁血${v.lockHpSeconds}（${ov.lockHpSeconds}）秒。`;
    case 'graymatter':
      return `攻击力+${pct(v.atkPct)}（${pct(ov.atkPct)}）；每造成1000点伤害，攻击力+${pct(v.perThousand)}（${pct(ov.perThousand)}），`
        + `最多${v.maxStacks}层；攻击附带${pct(v.necrosis)}（${pct(ov.necrosis)}）精神损伤。`;
    case 'dover':
      return `治疗效果增加${pct(v.healUp)}（${pct(ov.healUp)}）；每次治疗为自身周围四格干员sp+${v.selfAroundSp}（${ov.selfAroundSp}），`
        + `为治疗目标周围四格回复${pct(v.targetAroundHeal)}（${pct(ov.targetAroundHeal)}）的治疗量。`;
    case 'antigrav':
      return `开启技能时使技能范围内所有敌人浮空${v.floatSeconds}（${ov.floatSeconds}）秒，同一格每5秒最多触发一次；`
        + `技能持续期间攻击范围内所有干员技力回复+${v.spRegen}（${ov.spRegen}）、攻击速度+${v.atkSpeed}（${ov.atkSpeed}）。`;
    default:
      return '';
  }
}

const COLUMBIA_ITEM_FORMULA = {
  pioneer: 'Damage x min(cap, atkScale + perThree * floor(attacks / 3)).',
  mapland: 'Heal lowest-HP% ally for healRatio x damage dealt; on damaging an enemy reduce its ATK by atkDown for atkDownDuration (max atkDownMax stacks).',
  shield: 'maxHP += hp; DEF/RES += resRatio x maxHP; first drop below 50% HP locks HP for lockHpSeconds.',
  graymatter: 'ATK% += atkPct + perThousand * floor(damageDealt / 1000), up to maxStacks; attacks carry necrosis elemental damage.',
  dover: 'Healing dealt x(1 + healUp); each heal grants selfAroundSp SP to allies in the 4 tiles around the carrier and heals targetAroundHeal x amount around the target.',
  antigrav: 'On skill cast: float enemies in range for floatSeconds (once per tile per 5 s); while the skill lasts, allies in range gain spRegen SP/s and atkSpeed ASPD.',
};

/**
 * 给成员棋子的 `bonds` 数组加上 columbiaShip（普通与精锐各一份）。幂等。
 *
 * 单独导出是有原因的：build-data 在 applyCustomData 之后还会跑 applyExpandedRoster，后者会**重建**
 * `chess_external_*` 记录并覆盖 `bonds`，把外援成员（谬因、霍尔海雅）的标记抹掉。
 * 所以构建脚本必须在 applyExpandedRoster 之后再调用一次本函数。
 */
export function applyColumbiaMemberTags(files) {
  const chess = files && files.chess ? files.chess : {};
  for (const base of COLUMBIA_MEMBERS) {
    for (const suffix of ['a', 'b']) {
      const c = chess[base.replace(/_a$/, `_${suffix}`)];
      if (c && Array.isArray(c.bonds) && !c.bonds.includes(ID)) c.bonds.push(ID);
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
  assets.bonds.twinShip = assets.bonds.skillfulShip;
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
        { need: '3 distinct 哥伦比亚', effect: '获得科技装备，仅哥伦比亚干员可用；每叠加50层随机获得一件，不重复，至多6件。' },
        { need: '6 distinct 哥伦比亚', effect: '科技装备过载，其效果增加100%；所有佩戴科技装备的干员获得50攻速。' },
      ],
      formulas: {
        techCount: `min(${COLUMBIA_TECH_CAP}, floor(L / ${COLUMBIA_TECH_STEP}))`,
        overload: 'tier >= 6 → 使用装备的过载数值',
        overloadAtkSpeed: '+50 ASPD',
      },
      layerGain: '石英 休整期结束 +2/4；锡人 每3层攻击力与生命值+1/2%；星源 获得时 哥伦比亚+3、奇迹+1；'
        + '响石 作战中前三次击倒 +2/4；星极 休整期结束 +4/8；谬因 每3层技力回复+0.015/0.03、攻速+0.5/1；'
        + '溯光星源 与奥术灵巧同层数。',
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
    const text = columbiaItemDesc(it.key, it.normal);
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
      buffs: [{ key: 'env_gbuff_new', countType: 'NONE', bb: { ...it.normal }, bbStr: { key: `custom_item_eff_columbia_${it.key}`, bond_id: ID } }],
      params: { ...it.normal, key: `custom_item_eff_columbia_${it.key}`, bond_id: ID },
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
    ['chess_char_6_16_a', [ID, 'arcaneShip', 'skillfulShip', 'twinShip']],
    ...COLUMBIA_NORMAL_OPERATORS.map(op => [columbiaChessId(op.charId),
      ['char_135_halo', 'char_274_astesi'].includes(op.charId) ? [...op.bonds, 'twinShip'] : op.bonds]),
  ];
  const twinMembers = [columbiaChessId('char_274_astesi'), columbiaChessId('char_135_halo'), 'chess_char_6_16_a'];
  const twinDesc = '星极与星源或溯光星源同时在场时共享装备；攻击范围重叠时，互相视作攻击范围的延伸。';
  bonds.twinShip = { ...structuredClone(bonds.preciShip), bondId: 'twinShip', name: '双星', identifier: 26,
    iconId: 'icon_twinShip', activeCount: 2, thresholds: [2], countMode: 'BOARD', countsHand: false,
    members: twinMembers, visibleMembers: twinMembers,
    memberGroups: [[twinMembers[0]], twinMembers.slice(1)],
    effectId: 'bondeffect_twin', effectName: '双星', desc: twinDesc, descRaw: twinDesc,
    effectDesc: twinDesc, effectDescRaw: twinDesc, effectDescParams: [], bb: {}, bbStr: {}, buffs: [],
    baseParams: [], perStackParams: [], spec: { tiers: [{ need: '星极与星源或溯光星源', effect: twinDesc }] } };
  effects.bondeffect_twin = { ...structuredClone(effects.bondeffect_preci), effectId: 'bondeffect_twin',
    name: '双星', desc: twinDesc, descRaw: twinDesc, buffs: [], params: {} };
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
    const add = (stem, base, template, desc, bb, bbStr, fields = {}) => {
      const owner = base.replace(/_a$/, `_${suffix}`), gid = `garrison_custom_columbia_${stem}_${suffix}`;
      if (!chess[owner]) return;
      garrisons[gid] = { ...structuredClone(garrisons[`${template}_${suffix}`]), ...fields,
        garrisonId: gid, owners: [owner], desc, descRaw: desc, bb, bbStr };
      if (!chess[owner].garrisonIds.includes(gid)) chess[owner].garrisonIds.push(gid);
    };
    add('quartz', columbiaChessId('char_4063_quartz'), 'garrison_154', `<休整期结束时>使已激活的【哥伦比亚】层数+${2 * mul}`,
      { count: 2 * mul }, { bond: ID, conditionkey: 'character_target_inboard' });
    add('halo', columbiaChessId('char_135_halo'), 'garrison_25', `<获得时>【哥伦比亚】层数+${3 * mul}，【奇迹】层数+${mul}（无需激活盟约）`,
      {}, { bond: `${ID},miraShip`, count: `${3 * mul},${mul}` },
      { effectType: 'SERVER_ADD_MULTIPLE_BOND', effectKey: 'SERVER_ADD_MULTIPLE_BOND' });
    add('astesi', columbiaChessId('char_274_astesi'), 'garrison_154', `<休整期结束时>使已激活的【哥伦比亚】层数+${4 * mul}，【灵巧】层数+${3 * mul}`,
      {}, { bond: `${ID},skillfulShip`, count: `${4 * mul},${3 * mul}`, conditionkey: 'character_target_inboard' },
      { effectType: 'SERVER_ADD_MULTIPLE_BOND', effectKey: 'SERVER_ADD_MULTIPLE_BOND' });
    add('tinman', 'chess_char_2_19_a', 'garrison_151', `【哥伦比亚】每叠加3层，本干员攻击力和生命值+${mul}%`,
      { divide_num: 3, atk: 0.01 * mul, max_hp: 0.01 * mul },
      { key: 'act1autochess_gar_eff_attrByBond', bond_id: ID });
    add('aphris', columbiaChessId('char_4229_aphris'), 'garrison_151', `【哥伦比亚】每叠加3层，本干员技力回复+${0.015 * mul}，攻击速度+${0.5 * mul}`,
      { divide_num: 3, sp_recovery_per_sec: 0.015 * mul, attack_speed: 0.5 * mul },
      { key: 'act1autochess_gar_eff_attrByBond', bond_id: ID });
    add('cairn', columbiaChessId('char_4214_cairn'), 'garrison_140', `<战斗中>前三次击倒敌人时，使已激活的【哥伦比亚】【坚守】层数+${2 * mul}`,
      { bond_add_count: 2 * mul, check_cnt: 1, max_add_count_per_battle: 6 * mul },
      { key: 'act1autochess_gar_event_selfkillenemy', bond_type: 'bond_by_id', bond_id: `${ID},steadShip`, bond_add_type: 'by_count' },
      { effectKey: 'act1autochess_gar_event_selfkillenemy' });
    add('heyak_stats', columbiaChessId('char_4027_heyak'), 'garrison_08', `攻击力和生命值+${25 * mul}%`,
      { atk: 0.25 * mul, max_hp: 0.25 * mul }, { key: 'attr_common_global_buff' });
    add('heyak_weakness', columbiaChessId('char_4027_heyak'), 'garrison_01', '攻击变为弱点伤害',
      {}, { key: 'act1autochess_gar_eff_chaos' });
  }

  // 溯光星源的双星：与它原有的奥术／灵巧同层数，加一条哥伦比亚版本的特质。
  // 原特质 garrison_121_a: <休整期结束时>本回合每花费3资金，使已激活的【灵巧】【奥术】层数+2
  for (const [suffix, mul] of [['a', 1], ['b', 2]]) {
    const owner = `chess_char_6_16_${suffix}`;
    const src = garrisons[`garrison_121_${suffix}`];
    if (!src || !chess[owner]) continue;
    const gid = `garrison_custom_columbia_astgenne_${suffix}`;
    garrisons[gid] = {
      ...structuredClone(src),
      garrisonId: gid,
      owners: [owner],
      desc: `<休整期结束时>本回合每花费3资金，使已激活的【哥伦比亚】层数+${2 * mul}`,
      descRaw: `<休整期结束时>本回合每花费3资金，使已激活的【哥伦比亚】层数+${2 * mul}`,
      bb: { layer: 2 * mul, count: 3 },
      bbStr: { bond: ID, conditionkey: 'character_target_inboard' },
    };
    if (!chess[owner].garrisonIds.includes(gid)) chess[owner].garrisonIds.push(gid);
  }

  // 模式名单：哥伦比亚是核心盟约，与其它核心盟约一样从"本局禁用"里移除、加进可用名单。
  for (const mode of Object.values(config.modes)) {
    mode.inactiveBondIds = mode.inactiveBondIds.filter((id) => id !== ID);
    if (!mode.activeBondIds.includes(ID)) mode.activeBondIds.push(ID);
    if (!mode.activeBondIds.includes('twinShip')) mode.activeBondIds.push('twinShip');
  }

  if (files.assets) applyColumbiaAssets(files.assets);
}
