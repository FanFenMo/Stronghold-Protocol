import { COLUMBIA_BOND, columbiaEquipmentBonus } from '../../../../shared/columbia.js';
import { bondActive, bondLayers, isMember, battleStore } from '../support/index.js';

export const equipmentMultiplier = (battle, unit) => isMember(battle, unit, COLUMBIA_BOND) &&
  bondActive(battle, unit.ownerId, COLUMBIA_BOND) ? 1 + columbiaEquipmentBonus(bondLayers(battle, unit.ownerId, COLUMBIA_BOND)) : 1;

const ADDITIVE = new Set(['atkPct', 'hpPct', 'defPct', 'atkFlat', 'hpFlat', 'defFlat', 'resFlat', 'aspd', 'spRecoveryFlat', 'resIgnorePct']);
const MULTIPLIERS = new Set(['atkMul', 'hpMul', 'defMul', 'dmgDealtMul', 'healingDealtMul']);

export function equipmentMods(mods, multiplier) {
  if (!mods || multiplier === 1) return mods;
  return Object.fromEntries(Object.entries(mods).map(([key, value]) => [key,
    ADDITIVE.has(key) && value > 0 ? value * multiplier :
      MULTIPLIERS.has(key) && value > 1 ? 1 + (value - 1) * multiplier : value]));
}

export const equipmentScopes = battle => battleStore(battle, 'items:columbia:scopes', () => new Set());

// 共享只取实际佩戴装备；科技装备、其他盟约专属装备和消耗道具不在名单内。
export const SHARED_ITEMS = new Set([
  'chess_item_1_01_e', 'chess_item_1_02_e', 'chess_item_1_05_e',
  'chess_item_2_03_e', 'chess_item_2_04_e',
  'chess_item_3_01_e', 'chess_item_3_02_e', 'chess_item_3_04_e', 'chess_item_3_05_e',
  'chess_item_3_06_e', 'chess_item_3_07_e', 'chess_item_3_08_e', 'chess_item_3_09_e', 'chess_item_3_10_e',
  'chess_item_4_03_e', 'chess_item_4_06_e', 'chess_item_4_09_e',
  'chess_item_5_01_e', 'chess_item_5_02_e', 'chess_item_5_03_e', 'chess_item_5_09_e', 'chess_item_6_01_e',
]);

export const sharedEquipmentState = battle => battleStore(battle, 'items:columbia:sharing', () => new Map());
