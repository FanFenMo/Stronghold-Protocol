export function applyAegirBandData(files) {
  const band = files.bands.band_clementia;
  const effect = files.effects[band.effectId];
  band.desc = '每吞噬6名【阿戈尔】干员，下回合获得1名不高于调度中心等级的随机【阿戈尔】干员，余数保留。\n在场6名不同【阿戈尔】时，吞噬仍增加阻挡数，并保留真伤灼烧。';
  band.descRaw = band.desc;
  band.buffs = [
    { key: 'env_gbuff_new_with_verify', bb: { restore_devour_block: 1 }, bbStr: { key: 'act1autochess_band13_buff', bond_id: 'egirShip' } },
    { key: 'band_devour_gain_bond_char_next_round', bb: { devour_count: 6, count: 1 }, bbStr: { bond: 'egirShip' } },
  ];
  band.params = { restore_devour_block: 1, key: 'act1autochess_band13_buff', bond_id: 'egirShip', devour_count: 6, count: 1, bond: 'egirShip' };
  effect.desc = band.desc;
  effect.descRaw = band.descRaw;
  effect.buffs = structuredClone(band.buffs);
  effect.params = { ...band.params };
  const bond = files.bonds.egirShip;
  const note = '选择【克莱门莎】策略时，六阿戈尔的吞噬仍会增加阻挡数，且保留真伤灼烧。';
  for (const key of ['desc', 'descRaw', 'effectDesc', 'effectDescRaw']) if (!bond[key].includes(note)) bond[key] += '\n' + note;
  files.effects.bondeffect_egir.desc = bond.effectDesc;
  files.effects.bondeffect_egir.descRaw = bond.effectDescRaw;
  bond.spec.layerGain = '吞噬按被吞噬者等阶叠层；斯卡蒂、幽灵鲨普通击杀+2/上限20，精锐+4/上限30；归鲨普通+3/上限30，精锐+6/上限54，均叠加自身所有已激活盟约。灼烧击杀计入，友军吞噬不计入击杀敌人特性。克莱门莎不再通过击倒叠层。';
}
