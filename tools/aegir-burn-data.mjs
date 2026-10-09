// 阿戈尔 v1.2：吞噬常驻阻挡，攻击力按层数线性成长；五人开启双人间歇真伤。
export function applyAegirBurnData(bond, effect) {
  bond.thresholds = [3, 5];
  const rules = { devour_base_atk_scale: 0.5, devour_atk_scale_per_layer: 0.005,
    burn_bond_char_cnt: 5, burn_interval: 0.5, burn_base_atk_scale: 0.05,
    burn_duration: 8, burn_rest_duration: 6, burn_max_sources: 2 };
  for (const bb of [bond.bb, bond.buffs.find(b => b.bbStr?.key === 'act1autochess_bond_eff_egir').bb,
    effect.params, effect.buffs.find(b => b.bbStr?.key === 'act1autochess_bond_eff_egir').bb]) {
    delete bb.burn_atk_scale_per_layer_squared;
    Object.assign(bb, rules);
  }
  const desc = '【阿戈尔】干员生命值随盟约层数提升。\n'
    + '战斗开始时吞噬身前干员，获得其阻挡数和基础攻击力的50%＋每层0.5%；吞噬不再叠层。\n'
    + '<在场5名不同【阿戈尔】干员>前3名【阿戈尔】干员首次被击倒时立刻复活。\n'
    + '<在场5名不同【阿戈尔】干员>攻击力最高的2名在场干员，每0.5秒对周围12格敌人造成攻击力5%的真伤，持续8秒、停顿6秒，循环触发。';
  for (const key of ['desc', 'descRaw', 'effectDesc', 'effectDescRaw']) bond[key] = desc;
  effect.desc = effect.descRaw = desc;
  bond.spec.tiers = bond.spec.tiers.filter(t => t.need !== '6 distinct');
  const five = bond.spec.tiers.find(t => t.need === '5 distinct');
  five.effect = five.effect.split(' The two deployed members')[0]
    + ' The two deployed members with the highest current ATK burn 12 surrounding tiles every 0.5 s for current ATK * 0.05 true damage: 8 s active, then 6 s rest, repeating. Sources are selected on each pulse.';
  bond.spec.algorithm[2] = 'The marker gains each marked operator\'s block count and base ATK * (0.5 + 0.005 * L), using Aegir layers at devour time; ATK is a final addition after ATK percentages.';
  bond.spec.algorithm = bond.spec.algorithm.slice(0, 4);
  bond.spec.formulas.layersPerDevoured = '0';
  bond.spec.formulas.devourAtkScale = '0.5 + 0.005 * L';
  bond.spec.formulas.burnPerHalfSecond = 'current ATK * 0.05';
  bond.spec.howToPlay = 'Place fodder in front of Aegir carries to gain base ATK and block. At five members, only the two highest-current-ATK deployed members burn during the 8 s active / 6 s rest cycle.';
}
