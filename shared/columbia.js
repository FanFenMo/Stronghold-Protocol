// 哥伦比亚 v1.2：三人档提升装备效果；六人档激活科技装备的专属效果。

export const COLUMBIA_BOND = 'columbiaShip';

export const COLUMBIA_TECH_LAYERS = Object.freeze([20, 50, 100, 170, 250, 350]);
export const COLUMBIA_TECH_CAP = COLUMBIA_TECH_LAYERS.length;

/** 三人档装备加成的初始增幅。 */
export const COLUMBIA_EQUIPMENT_BASE_BONUS = 0.5;

/** 科技护盾提供的法抗加成上限。 */
export const COLUMBIA_RES_CAP = 30;
export const columbiaEquipmentBonus = (layers) => COLUMBIA_EQUIPMENT_BASE_BONUS + Math.max(0, Number(layers) || 0) * 0.003;

/** 已发放的科技装备件数（层数 → 件数，受上限约束）。3 档起才发放，调用方负责判断档位。 */
export const columbiaTechCount = (layers) => {
  const n = Math.max(0, Number(layers) || 0);
  return COLUMBIA_TECH_LAYERS.filter(layer => n >= layer).length;
};

// base 为始终生效的基础效果；normal 为六人档专属效果。双星仍可借用装备效果。
export const COLUMBIA_TECH_ITEMS = Object.freeze([
  {
    key: 'pioneer', name: '拓荒者蓄力装具',
    base: { atkFlat: 300, aroundAtk: 150 },
    normal: { atkScale: 1.15, perThree: 0.01, cap: 2.0 },
  },
  {
    key: 'mapland', name: '梅兰德战地保单',
    base: { aspd: 50, atkFlat: 200 },
    normal: { healRatio: 0.15 },
  },
  {
    key: 'shield', name: '过载护盾',
    base: { hp: 2000, block: 3, aroundHp: 500 },
    normal: { resRatio: 0.006 },
  },
  {
    key: 'graymatter', name: '灰质引擎',
    base: { atkPct: 0.45, aroundAtkRatio: 0.3 },
    normal: { perThousand: 0.01, maxStacks: 100, necrosis: 0.05 },
  },
  {
    key: 'dover', name: '多维尔综合诊疗仪',
    base: { healUp: 0.5, healTargets: 1 },
    normal: { selfAroundSp: 1, targetAroundHeal: 0.15 },
  },
  {
    key: 'antigrav', name: '反重力投送场',
    base: { skillDurationPct: 0.5, spRegen: 0.25 },
    normal: { spRegen: 0.25, atkSpeed: 40 },
  },
]);

/** 按 key 取一件科技装备的定义。 */
export const columbiaTechItem = (key) => COLUMBIA_TECH_ITEMS.find((it) => it.key === key) || null;

/** 原始数值与层数成长分开，避免重复放大基础倍率和上限。 */
export const columbiaTechValues = (key) => columbiaTechItem(key)?.normal ?? null;

/** 数据/素材层使用的装备 id 生成规则（普通 `_a`、精锐 `_b`，与既有装备命名一致）。 */
export const columbiaTechItemId = (key, golden = false) => `chess_item_custom_columbia_${key}_${golden ? 'b' : 'a'}`;
