// 哥伦比亚 v1.1：三人档每层提升装备加成0.3%；六人档每人共享实际佩戴的可共享装备数值的5%。

export const COLUMBIA_BOND = 'columbiaShip';

/** 科技装备的总件数上限：每满 50 层发一件，发满 6 件后不再发放。 */
export const COLUMBIA_TECH_CAP = 6;

/** 触发间隔：每叠加 50 层随机获得一件。 */
export const COLUMBIA_TECH_STEP = 50;

/** 六人共享系数、共享溶剂每秒代价，以及科技护盾的法抗加成上限。 */
export const COLUMBIA_SHARE_RATIO = 0.05;
export const COLUMBIA_SOLVENT_DRAIN = 30;
export const COLUMBIA_RES_CAP = 30;
export const columbiaEquipmentBonus = (layers) => Math.max(0, Number(layers) || 0) * 0.003;

/** 已发放的科技装备件数（层数 → 件数，受上限约束）。3 档起才发放，调用方负责判断档位。 */
export const columbiaTechCount = (layers) => {
  const n = Math.floor(Math.max(0, Number(layers) || 0) / COLUMBIA_TECH_STEP);
  return Math.max(0, Math.min(COLUMBIA_TECH_CAP, n));
};

// 六件科技装备均不进入六人共享池；双星仍可借用完整效果。
export const COLUMBIA_TECH_ITEMS = Object.freeze([
  {
    key: 'pioneer', name: '拓荒者蓄力装具',
    normal: { atkScale: 1.15, perThree: 0.01, cap: 2.0 },
  },
  {
    key: 'mapland', name: '梅兰德战地保单',
    normal: { healRatio: 0.15 },
  },
  {
    key: 'shield', name: '过载护盾',
    normal: { hp: 2000, resRatio: 0.006 },
  },
  {
    key: 'graymatter', name: '灰质引擎',
    normal: { atkPct: 0.45, perThousand: 0.01, maxStacks: 100, necrosis: 0.05 },
  },
  {
    key: 'dover', name: '多维尔综合诊疗仪',
    normal: { healUp: 0.2, selfAroundSp: 1, targetAroundHeal: 0.15 },
  },
  {
    key: 'antigrav', name: '反重力投送场',
    normal: { spRegen: 0.25, atkSpeed: 40 },
  },
]);

/** 按 key 取一件科技装备的定义。 */
export const columbiaTechItem = (key) => COLUMBIA_TECH_ITEMS.find((it) => it.key === key) || null;

/** 原始数值与层数成长分开，避免重复放大基础倍率和上限。 */
export const columbiaTechValues = (key) => columbiaTechItem(key)?.normal ?? null;

/** 数据/素材层使用的装备 id 生成规则（普通 `_a`、精锐 `_b`，与既有装备命名一致）。 */
export const columbiaTechItemId = (key, golden = false) => `chess_item_custom_columbia_${key}_${golden ? 'b' : 'a'}`;
