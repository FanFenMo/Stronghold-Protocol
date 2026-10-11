import { QINGZHI_BAND, W_BAND, ROLLING_BAND, TOUCH_BAND } from '../shared/strategies.js';
import { contentHash } from './assets/manifest.mjs';

const additions = [
  [QINGZHI_BAND, 41, '青枳', '否极泰来',
    '【否极泰来】第6、9、12回合各获得一次免费特殊刷新，可免费选取其中一名干员。干员阶数分别为7、9、10减去当前调度站等级，最高六阶。',
    [{ key: 'custom_qingzhi_refresh', bb: {}, bbStr: {} }]],
  [W_BAND, 42, 'W', '隔岸观火',
    '【隔岸观火】每回合结束时，有50%概率使下回合自身波次随机减少一名敌人，并获得2资金；实际队友各增加一名对应的削弱敌人，击败后有50%概率获得1资金。',
    [{ key: 'custom_w_transfer', bb: { chance: 0.5 }, bbStr: {} }]],
  [ROLLING_BAND, 43, '滚木分队', '', '无效果。', []],
];

export function applyStrategyData(files) {
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
}

export function applyStrategyAssets(assets) {
  assets.bands[QINGZHI_BAND] = '/img/bands/qingzhi.png';
  assets.bands[W_BAND] = '/img/bands/w.png';
  delete assets.bands[ROLLING_BAND];
  if (assets.stats) assets.stats.bands = Object.keys(assets.bands).length;
  if (assets.hash) {
    const { version, hash, generator, stats, ...body } = assets;
    assets.hash = contentHash(body);
  }
}
