export function applyAegirBandData(files) {
  const band = files.bands.band_clementia;
  const effect = files.effects[band.effectId];
  band.desc = '每累计吞噬10名干员（不限盟约），下回合获得1名不高于当前调度中心等级的随机【阿戈尔】干员，余数保留。';
  band.descRaw = band.desc;
  band.buffs = [
    { key: 'env_gbuff_new_with_verify', bb: {}, bbStr: { key: 'act1autochess_band13_buff' } },
    { key: 'band_devour_gain_bond_char_next_round', bb: { devour_count: 10, count: 1 }, bbStr: { bond: 'egirShip' } },
  ];
  band.params = { key: 'act1autochess_band13_buff', devour_count: 10, count: 1, bond: 'egirShip' };
  effect.desc = band.desc;
  effect.descRaw = band.descRaw;
  effect.buffs = structuredClone(band.buffs);
  effect.params = { ...band.params };
  files.bonds.egirShip.spec.layerGain = '吞噬不叠层。斯卡蒂保留自身所有已激活盟约的击杀叠层；幽灵鲨获得时阿戈尔+2，战斗每5次击杀阿戈尔+1，上限10；归溟幽灵鲨获得时阿戈尔+4、不屈+6，切为替身时同排每2名在场干员使已激活阿戈尔+1、不屈+2。幽灵鲨与归溟幽灵鲨的精锐增加层数翻倍，幽灵鲨精锐战斗上限20。灼烧击杀计入，友军吞噬不计入击杀特质。';
}
