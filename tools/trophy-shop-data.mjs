import { COMMAND_ARCHIVE } from '../shared/trophyMystery.js';

/** Keep the mystery-only equipment reproducible through the normal data build. */
export function applyTrophyShopData(files) {
  const source = files.items.chess_item_6_08_e_a;
  const item = structuredClone(source);
  const effectId = 'eff_trophy_command_archive';
  Object.assign(item, { id: COMMAND_ARCHIVE, baseId: COMMAND_ARCHIVE, goldenId: null, upgradeChessId: null,
    identifier: 920, name: '指挥部档案', effectId, effectName: '指挥部档案', hideInShop: true, shopExcluded: true,
    shopSortId: 0, price: 0, mergeable: false, upgradeNum: 0,
    desc: '装备时销毁，最大可部署人数变为12', descRaw: '装备时销毁，最大可部署人数变为12',
    params: { count: 12 }, implFormula: 'On equip: consume the archive and raise the deployment limit to 12.', flavor: '作战编制扩充许可。' });
  item.buffs[0].bb = { count: 12 };
  files.items[COMMAND_ARCHIVE] = item;
  files.effects[effectId] = { ...structuredClone(files.effects[source.effectId]), effectId, name: item.name,
    desc: item.desc, descRaw: item.descRaw, buffs: structuredClone(item.buffs), params: { count: 12 } };
}
