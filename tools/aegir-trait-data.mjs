// 阿戈尔干员的获得、击杀和替身叠层规则，沿用准备期与战斗特质。
export function applyAegirTraitData({ garrisons, chess }) {
  const key = 'act1autochess_gar_event_selfkillenemy';
  for (const [id, gain, cap] of [
    ['garrison_38_a', 2, 20], ['garrison_38_b', 4, 30],
  ]) {
    const g = garrisons[id];
    g.desc = `<战斗中>自身每击杀1名敌人时，使自身所有已激活盟约层数+${gain}，每回合每个盟约最多叠加${cap}层（盟约灼烧造成的击杀也计入）`;
    g.descRaw = `<战斗中>自身每击杀1名敌人时，使自身所有已激活盟约层数<@ba.vup>+${gain}</>，每回合每个盟约最多叠加<@ba.vup>${cap}</>层（盟约灼烧造成的击杀也计入）`;
    g.effectKey = key;
    g.bb = { check_cnt: 1, bond_add_count: gain, max_add_count_per_battle: cap };
    g.bbStr = { key, bond_type: 'bond_self', bond_add_type: 'by_count' };
  }

  const add = (owner, g, first = false) => {
    garrisons[g.garrisonId] = g;
    const list = chess[owner].garrisonIds;
    if (!list.includes(g.garrisonId)) first ? list.unshift(g.garrisonId) : list.push(g.garrisonId);
  };
  for (const [suffix, mul] of [['a', 1], ['b', 2]]) {
    const shark = `chess_char_2_07_${suffix}`;
    const g = garrisons[`garrison_46_${suffix}`];
    g.effectKey = key;
    g.desc = `<战斗中>自身每击倒5名敌人，使已激活的【阿戈尔】层数+${mul}，每回合最多叠加${10 * mul}层（盟约灼烧击杀也计入）`;
    g.descRaw = g.desc;
    g.bb = { check_cnt: 5, bond_add_count: mul, max_add_count_per_battle: 10 * mul };
    g.bbStr = { key, bond_type: 'bond_by_id', bond_id: 'egirShip', bond_add_type: 'by_count' };
    const gain = structuredClone(garrisons[`garrison_25_${suffix}`]);
    Object.assign(gain, { garrisonId: `garrison_custom_specter_gain_${suffix}`, owners: [shark],
      effectType: 'SERVER_ADD_BOND', effectKey: 'SERVER_ADD_BOND',
      desc: `<获得时>【阿戈尔】层数+${2 * mul}（无需激活盟约）`, bb: { count: 2 * mul }, bbStr: { bond: 'egirShip' } });
    gain.descRaw = gain.desc;
    add(shark, gain, true);

    const doll = `chess_char_5_13_${suffix}`;
    const swap = garrisons[`garrison_40_${suffix}`];
    swap.effectKey = 'act1autochess_gar_event_dollswap';
    swap.desc = `<战斗中>切换为替身时，同一行每有2名在场干员（含自身），使已激活的【阿戈尔】层数+${mul}`;
    swap.descRaw = swap.desc;
    swap.bb = { bond_add_count_multi: mul, bond_add_count_divide: 2 };
    swap.bbStr = { key: swap.effectKey, bond_type: 'bond_by_id', bond_id: 'egirShip', bond_add_type: 'by_charcount_samerow', form: 'doll' };
    const indom = structuredClone(swap);
    indom.garrisonId = `garrison_custom_specter2_swap_indom_${suffix}`;
    indom.desc = `<战斗中>切换为替身时，同一行每有2名在场干员（含自身），使已激活的【不屈】层数+${2 * mul}`;
    indom.descRaw = indom.desc;
    indom.bb.bond_add_count_multi = 2 * mul;
    indom.bbStr.bond_id = 'indomShip';
    add(doll, indom);
    const dollGain = structuredClone(garrisons[`garrison_156_${suffix}`]);
    Object.assign(dollGain, { garrisonId: `garrison_custom_specter2_gain_${suffix}`, owners: [doll],
      desc: `<获得时>【阿戈尔】层数+${4 * mul}、【不屈】层数+${6 * mul}（无需激活盟约）`,
      bbStr: { bond: 'egirShip,indomShip', count: `${4 * mul},${6 * mul}` } });
    dollGain.descRaw = dollGain.desc;
    add(doll, dollGain, true);
  }
}
