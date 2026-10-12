import { QINGZHI_BAND, W_BAND, CLOSURE_BAND, ROLLING_BAND, TOUCH_BAND } from '../shared/strategies.js';
import { contentHash } from './assets/manifest.mjs';

const additions = [
  [QINGZHI_BAND, 41, '青织', '否极泰来',
    '【否极泰来】第六，八，十，十二回合首次刷新变为特殊刷新三选一，免费获取其中之一，特殊刷新干员阶数分别为6-当前调度站等级/8-当前调度站等级/10-当前调度站等级/11-当前调度站等级',
    [{ key: 'custom_qingzhi_refresh', bb: {}, bbStr: {} }]],
  [W_BAND, 42, 'W', '隔岸观火',
    '【隔岸观火】每回合结束时均有50%概率下回合使自身波次随机少一名敌方目标且使自身获得两点资金，同时使我方其他三人各增加一只对应削弱的敌方目标，成功击败后有20%获得1资金',
    [{ key: 'custom_w_transfer', bb: { chance: 0.5 }, bbStr: {} }]],
  [ROLLING_BAND, 43, '滚木分队', '', '无效果。', []],
  [CLOSURE_BAND, 44, '可露希尔', '意外收获',
    '【意外收获】每次干员精锐后有20%使选择干员阶数+1',
    [{ key: 'custom_closure_reward_upgrade', bb: { chance: 0.2 }, bbStr: {} }]],
];

export function applyStrategyData(files) {
  files.bands.band_lisa.totalHp = 28;
  for (const [bandId, sortId, name, effectName, desc, buffs] of additions) {
    const effectId = `aceffect_${bandId}`;
    files.bands[bandId] = { bandId, sortId, name, iconId: bandId === ROLLING_BAND ? null : bandId.replace('band_', 'icon_'),
      iconBlank: bandId === ROLLING_BAND, modeTypeList: ['LOCAL', 'SINGLE', 'MULTI'], totalHp: 28,
      effectId, effectName, desc, descRaw: desc, buffs: structuredClone(buffs), params: {},
      victorCount: 3, rewardModulus: 1, unlockDesc: null, bondIds: [] };
    files.effects[effectId] = { effectId, effectType: 'BAND_INITIAL', name: effectName || name,
      desc, descRaw: desc, counterType: 'NONE', continuedRound: -1, decoIconId: null, enemyPrice: 0,
      buffs: structuredClone(buffs), params: {} };
  }
  const touch = files.bands[TOUCH_BAND];
  touch.desc = touch.descRaw = '【外勤医疗】所有玩家场地出现一名<预备干员-医疗>；场上至少有两名精锐干员时替换为<Touch>。选择该策略的玩家可自行部署自己场地的医疗单位，不占部署位。';
  files.effects[touch.effectId].desc = files.effects[touch.effectId].descRaw = touch.desc;
  const kirara = files.bands.band_kirara;
  const rebate = { key: 'custom_kirara_sell_rebate', bb: { chance: 0.25, coin: 1 }, bbStr: {} };
  for (const record of [kirara, files.effects[kirara.effectId]]) {
    record.desc = record.descRaw = '【通关奖励】每使用20资金，获得一名不高于当前调度中心等级的随机干员；每次出售干员有25%概率使下回合额外获得1资金。';
    record.buffs = [...record.buffs.filter((b) => b.key !== rebate.key), structuredClone(rebate)];
  }
}

export function applyStrategyAssets(assets) {
  assets.bands[QINGZHI_BAND] = '/img/bands/qingzhi.png';
  assets.bands[W_BAND] = '/img/bands/w.png';
  assets.bands[CLOSURE_BAND] = '/img/bands/closure.png';
  delete assets.bands[ROLLING_BAND];
  if (assets.stats) assets.stats.bands = Object.keys(assets.bands).length;
  if (assets.hash) {
    const { version, hash, generator, stats, ...body } = assets;
    assets.hash = contentHash(body);
  }
}
