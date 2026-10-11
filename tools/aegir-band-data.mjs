export function applyAegirBandData(files) {
  const band = files.bands.band_clementia;
  const effect = files.effects[band.effectId];
  band.desc = '每15秒，为在场所有我方干员刷新一次单次护盾：本次伤害低于3000时减半；达到3000时免疫本次伤害并流失1500生命。护盾不累计。';
  band.descRaw = band.desc;
  band.buffs = [
    { key: 'env_gbuff_new_with_verify', bb: { interval: 15, damage_threshold: 3000, damage_scale: 0.5, hp_loss: 1500 }, bbStr: { key: 'act1autochess_band13_buff' } },
  ];
  band.params = { key: 'act1autochess_band13_buff', ...band.buffs[0].bb };
  band.bondIds = [];
  effect.desc = band.desc;
  effect.descRaw = band.descRaw;
  effect.buffs = structuredClone(band.buffs);
  effect.params = { ...band.params };
  files.bonds.egirShip.spec.layerGain = '吞噬不叠层。斯卡蒂每次击杀使自身所有已激活盟约+2，每回合各上限18；幽灵鲨获得时阿戈尔+2，每次击杀使已激活阿戈尔+1，每回合上限20；归溟幽灵鲨获得时阿戈尔+4、不屈+6，每次击杀使已激活阿戈尔+2，每回合上限30，切为替身时使已激活阿戈尔+5、不屈+10。精锐的增量和击杀叠层上限均翻倍。友军吞噬不计入击杀特质。';
}
