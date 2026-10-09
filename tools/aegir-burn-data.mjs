// Keep the local six-member covenant rule in the normal data rebuild path.
export function applyAegirBurnData(bond, effect) {
  if (!bond.thresholds.includes(6)) bond.thresholds.push(6);
  const burn = { burn_bond_char_cnt: 6, burn_interval: 0.5, burn_base_atk_scale: 0.1, burn_atk_scale_per_layer_squared: 0.000025 };
  Object.assign(bond.bb, burn);
  Object.assign(bond.buffs.find(b => b.bbStr?.key === 'act1autochess_bond_eff_egir').bb, burn);
  const note = '<在场6名不同【阿戈尔】干员>吞噬不再增加阻挡数；所有享受【阿戈尔】盟约的干员每0.5秒对周围8格及上下左右各延伸1格（共12格，不含自身格）的敌人造成当前攻击力×（10%＋盟约层数²÷40000）的真实灼烧伤害。灼烧击杀归属造成伤害的干员。';
  for (const key of ['desc', 'descRaw', 'effectDesc', 'effectDescRaw']) {
    if (!bond[key].includes(note)) bond[key] += '\n' + note;
  }
  if (!bond.spec.tiers.some(t => t.need === '6 distinct')) {
    bond.spec.tiers.push({ need: '6 distinct', effect: 'Devour retains base ATK and layers, but no block bonus. Every member burns 12 surrounding tiles every 0.5 s for current ATK * (0.1 + 0.000025 * L * L) true damage; credited to that operator.' });
  }
  bond.spec.formulas.burnPerHalfSecond = 'current ATK * (0.1 + 0.000025 * L^2)';
  effect.desc = bond.effectDesc;
  effect.descRaw = bond.effectDescRaw;
  Object.assign(effect.params, burn);
  Object.assign(effect.buffs.find(b => b.bbStr?.key === 'act1autochess_bond_eff_egir').bb, burn);
}
