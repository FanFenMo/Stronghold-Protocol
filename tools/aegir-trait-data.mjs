// 阿戈尔三名干员的击杀叠层规则，沿用战斗特质的自身击杀、已激活自身盟约和单回合上限。
export function applyAegirTraitData(garrisons) {
  const key = 'act1autochess_gar_event_selfkillenemy';
  for (const [id, gain, cap] of [
    ['garrison_38_a', 2, 20], ['garrison_38_b', 4, 30],
    ['garrison_46_a', 2, 20], ['garrison_46_b', 4, 30],
    ['garrison_40_a', 3, 30], ['garrison_40_b', 6, 54],
  ]) {
    const g = garrisons[id];
    g.desc = `<战斗中>自身每击杀1名敌人时，使自身所有已激活盟约层数+${gain}，每回合每个盟约最多叠加${cap}层（盟约灼烧造成的击杀也计入）`;
    g.descRaw = `<战斗中>自身每击杀1名敌人时，使自身所有已激活盟约层数<@ba.vup>+${gain}</>，每回合每个盟约最多叠加<@ba.vup>${cap}</>层（盟约灼烧造成的击杀也计入）`;
    g.effectKey = key;
    g.bb = { check_cnt: 1, bond_add_count: gain, max_add_count_per_battle: cap };
    g.bbStr = { key, bond_type: 'bond_self', bond_add_type: 'by_count' };
  }
}
