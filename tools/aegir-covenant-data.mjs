// 阿戈尔 v1.3：吞噬常驻阻挡和攻击力，五人开启阻挡目标攻击传递。
export function applyAegirCovenantData(bond, effect) {
  bond.thresholds = [3, 5];
  const rules = { devour_base_atk_scale: 0.5, devour_atk_scale_per_layer: 0.005,
    relay_bond_char_cnt: 5, relay_damage_per_hop: 0.8 };
  for (const bb of [bond.bb, bond.buffs.find(b => b.bbStr?.key === 'act1autochess_bond_eff_egir').bb,
    effect.params, effect.buffs.find(b => b.bbStr?.key === 'act1autochess_bond_eff_egir').bb]) {
    for (const key of Object.keys(bb)) if (key.startsWith('burn_')) delete bb[key];
    Object.assign(bb, rules);
  }
  const desc = '【阿戈尔】干员生命值随盟约层数提升。\n'
    + '战斗开始时吞噬身前干员，获得其阻挡数和基础攻击力的50%＋每层0.5%；吞噬不再叠层。\n'
    + '5名：前3名【阿戈尔】干员首次被击倒时立刻复活。\n'
    + '5名：自身无可攻击目标时，可攻击吞噬链中存活干员阻挡的非远程敌人；每次传递保留80%伤害，中间干员死亡不切断传递。';
  for (const key of ['desc', 'descRaw', 'effectDesc', 'effectDescRaw']) bond[key] = desc;
  effect.desc = effect.descRaw = desc;
  bond.spec.tiers = bond.spec.tiers.filter(t => t.need !== '6 distinct');
  const five = bond.spec.tiers.find(t => t.need === '5 distinct');
  five.effect = five.effect.split(' The two deployed members')[0].split(' Devour relay:')[0]
    + ' Devour relay: when a member has no local attack target, it attacks non-ranged enemies blocked by living devoured operators. Final attack damage is multiplied by 0.8 per original hop; dead intermediate operators do not break or shorten the chain.';
  bond.spec.algorithm[2] = 'The marker gains each marked operator\'s block count and base ATK * (0.5 + 0.005 * L), using Aegir layers at devour time; ATK is a final addition after ATK percentages.';
  bond.spec.algorithm = bond.spec.algorithm.slice(0, 4);
  bond.spec.formulas.layersPerDevoured = '0';
  bond.spec.formulas.devourAtkScale = '0.5 + 0.005 * L';
  delete bond.spec.formulas.burnPerHalfSecond;
  bond.spec.formulas.relayFinalDamage = 'ordinary final attack damage * 0.8^originalDepth';
  bond.spec.howToPlay = 'Place fodder in front of Aegir carries to gain base ATK and block. At five members, living food can relay its blocked non-ranged enemies to consumers without local attack targets, even through dead intermediate operators.';
}
