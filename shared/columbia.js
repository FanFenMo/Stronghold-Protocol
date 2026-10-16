// 哥伦比亚的共用数值：盟约 id、科技装备的两套数值（普通 / 过载），供数据生成、战斗和界面使用。
//
// 设计要点（来自本 fork 的哥伦比亚方案）：
//   * (3) 档：获得科技装备，仅哥伦比亚干员可用；每叠加 50 层随机获得一件，不重复。
//   * (6) 档：科技装备获得过载，其效果增加 100%；所有佩戴科技装备的干员获得 50 攻速。
// 过载不是统一翻倍：拓荒者蓄力装具是特例（普通 115%/+1%/上限200%，过载 130%/+2%/上限400%），
// 其余五件的过载值恰好是普通值的两倍。因此两套数值都在这里显式写死，不用倍率推导。

export const COLUMBIA_BOND = 'columbiaShip';

/** 科技装备的总件数上限：每满 50 层发一件，发满 6 件后不再发放。 */
export const COLUMBIA_TECH_CAP = 6;

/** 触发间隔：每叠加 50 层随机获得一件。 */
export const COLUMBIA_TECH_STEP = 50;

/** (6) 档：佩戴科技装备的干员额外获得的攻击速度。 */
export const COLUMBIA_OVERLOAD_ATK_SPEED = 50;

/** 已发放的科技装备件数（层数 → 件数，受上限约束）。3 档起才发放，调用方负责判断档位。 */
export const columbiaTechCount = (layers) => {
  const n = Math.floor(Math.max(0, Number(layers) || 0) / COLUMBIA_TECH_STEP);
  return Math.max(0, Math.min(COLUMBIA_TECH_CAP, n));
};

/** 过载是否生效：(6) 档及以上。 */
export const columbiaOverloaded = (tier) => (Number(tier) || 0) >= 6;

// ---------------------------------------------------------------------------------------------------------------------
// 六件科技装备。`key` 用于生成装备 id 与战斗内的识别；normal / overload 是同一件的两套数值。
//
// 1 拓荒者蓄力装具：攻击造成 115%(130%) 伤害，每三次攻击增加 1%(2%)，最高 200%(400%)。
// 2 梅兰德战地保单：为百分比生命值最低的干员回复相当于 15%(30%) 造成的伤害的生命值；对一名敌人造成伤害后
//   削减其 2%(4%) 攻击力持续 15s(30s)，可叠加，最高 15 层。
// 3 过载护盾：获得 2000(4000) 生命值，获得 0.6(1.2)% 最大生命值的双抗，生命值首次跌下 50% 时锁血 7(14)s。
// 4 灰质引擎：攻击力 +45/90%，每造成 1000 点伤害攻击力 +1(2)%，最多 100 层，攻击附带 5(10)% 精神损伤。
// 5 多维尔综合诊疗仪：治疗效果增加 20(40)%，每次治疗为自身周围四格干员 sp+1(2)，为治疗目标周围四格回复
//   15(30)% 的治疗量。
// 6 反重力投送场：开启技能时使技能范围内所有敌人浮空 2(4) 秒，同一格每 5 秒最多触发一次；技能持续期间
//   攻击范围内所有干员技力回复 +0.25(0.5)、攻击速度 +40(80)。
// ---------------------------------------------------------------------------------------------------------------------
export const COLUMBIA_TECH_ITEMS = Object.freeze([
  {
    key: 'pioneer', name: '拓荒者蓄力装具',
    normal: { atkScale: 1.15, perThree: 0.01, cap: 2.0 },
    overload: { atkScale: 1.3, perThree: 0.02, cap: 4.0 },
  },
  {
    key: 'mapland', name: '梅兰德战地保单',
    normal: { healRatio: 0.15, atkDown: 0.02, atkDownDuration: 15, atkDownMax: 15 },
    overload: { healRatio: 0.3, atkDown: 0.04, atkDownDuration: 30, atkDownMax: 15 },
  },
  {
    key: 'shield', name: '过载护盾',
    normal: { hp: 2000, resRatio: 0.006, lockHpSeconds: 7 },
    overload: { hp: 4000, resRatio: 0.012, lockHpSeconds: 14 },
  },
  {
    key: 'graymatter', name: '灰质引擎',
    normal: { atkPct: 0.45, perThousand: 0.01, maxStacks: 100, necrosis: 0.05 },
    overload: { atkPct: 0.9, perThousand: 0.02, maxStacks: 100, necrosis: 0.1 },
  },
  {
    key: 'dover', name: '多维尔综合诊疗仪',
    normal: { healUp: 0.2, selfAroundSp: 1, targetAroundHeal: 0.15 },
    overload: { healUp: 0.4, selfAroundSp: 2, targetAroundHeal: 0.3 },
  },
  {
    key: 'antigrav', name: '反重力投送场',
    normal: { floatSeconds: 2, spRegen: 0.25, atkSpeed: 40 },
    overload: { floatSeconds: 4, spRegen: 0.5, atkSpeed: 80 },
  },
]);

/** 按 key 取一件科技装备的定义。 */
export const columbiaTechItem = (key) => COLUMBIA_TECH_ITEMS.find((it) => it.key === key) || null;

/** 取一件科技装备在当前是否过载下的有效数值。 */
export const columbiaTechValues = (key, overloaded) => {
  const it = columbiaTechItem(key);
  if (!it) return null;
  return overloaded ? it.overload : it.normal;
};

/** 数据/素材层使用的装备 id 生成规则（普通 `_a`、精锐 `_b`，与既有装备命名一致）。 */
export const columbiaTechItemId = (key, golden = false) => `chess_item_custom_columbia_${key}_${golden ? 'b' : 'a'}`;
