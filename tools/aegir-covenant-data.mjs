// 阿戈尔 v1.4：吞噬初始继承80%攻击力，五人共享三次复活机会。
export function applyAegirCovenantData(bond, effect) {
  bond.thresholds = [3, 5];
  const rules = { devour_base_atk_scale: 0.8, devour_atk_scale_per_layer: 0.006,
    relay_bond_char_cnt: 5, relay_damage_per_hop: 0.8 };
  for (const bb of [bond.bb, bond.buffs.find(b => b.bbStr?.key === 'act1autochess_bond_eff_egir').bb,
    effect.params, effect.buffs.find(b => b.bbStr?.key === 'act1autochess_bond_eff_egir').bb]) {
    for (const key of Object.keys(bb)) if (key.startsWith('burn_')) delete bb[key];
    Object.assign(bb, rules);
  }
  bond.effectDescParams = [...bond.effectDescParams.filter(p => p.index !== 1),
    { index: 1, format: '0%', base: 'devour_base_atk_scale', perStack: 'devour_atk_scale_per_layer' }];
  const desc = '【阿戈尔】干员生命值提升{0:0%}。\n'
    + '战斗开始时吞噬身前干员，获得其阻挡数和基础攻击力的{1:0%}。重叠吞噬链仅保留最长一条造成伤害，每名目标仅承受一次吞噬。\n'
    + '5名：【阿戈尔】干员被击倒时立即复活，每场最多3次。\n'
    + '5名：自身无可攻击目标时，可攻击吞噬链中存活干员自身格或身前一格内的1名敌人；每次传递保留80%伤害。';
  for (const key of ['desc', 'descRaw', 'effectDesc', 'effectDescRaw']) bond[key] = desc;
  effect.desc = effect.descRaw = desc;
  bond.spec.tiers = bond.spec.tiers.filter(t => t.need !== '6 distinct');
  const five = bond.spec.tiers.find(t => t.need === '5 distinct');
  five.effect = '3 shared revives per battle (max_free_respawn_cnt), consumed only on an actual knock-out not answered by another revive. Unused charges survive the battle-start devour window; the same member may consume multiple charges. Devour knock-outs are revived after every devour pass, by board position from the bottom-left, while charges last.'
    + ' Devour relay: when a member has no local attack target, it attacks one eligible enemy on a living devoured operator\'s tile or its facing-front tile. Final attack damage is multiplied by 0.8 per original hop; dead intermediate operators do not break or shorten the chain.';
  bond.spec.algorithm[2] = 'The marker gains each marked operator\'s block count and base ATK * (0.8 + 0.006 * L), using Aegir layers at devour time; ATK is a final addition after ATK percentages.';
  bond.spec.algorithm = bond.spec.algorithm.slice(0, 4);
  bond.spec.algorithm[3] = 'After every player finishes marking, retain the longest non-overlapping devour chains, breaking equal-length ties by marking order. Resolve retained chains in their original order, from first food to last: each target takes one 5000-point physical HP loss after DEF, bypassing ordinary shields, dodge and damage multipliers. Kill credit belongs to the retained chain marker. All markers keep their original stat gains and relay chains; knocked-out or redeployed targets are skipped.';
  bond.spec.formulas.layersPerDevoured = '0';
  bond.spec.formulas.devourAtkScale = '0.8 + 0.006 * L';
  delete bond.spec.formulas.burnPerHalfSecond;
  bond.spec.formulas.relayFinalDamage = 'ordinary final attack damage * 0.8^originalDepth';
  bond.spec.howToPlay = 'Place fodder in front of Aegir carries to gain base ATK and block. At five members, living food relays one eligible enemy on its own or facing-front tile to consumers without local attack targets, even through dead intermediate operators.';
}
