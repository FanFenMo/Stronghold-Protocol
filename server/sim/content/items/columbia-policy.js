import { COLUMBIA_BOND, columbiaEquipmentBonus } from '../../../../shared/columbia.js';
import { bondActive, bondLayers, isMember, battleStore, isOp, onField, baseChessId } from '../support/index.js';

export const equipmentMultiplier = (battle, unit) => isMember(battle, unit, COLUMBIA_BOND) &&
  bondActive(battle, unit.ownerId, COLUMBIA_BOND) ? 1 + columbiaEquipmentBonus(bondLayers(battle, unit.ownerId, COLUMBIA_BOND)) : 1;

const ADDITIVE = new Set(['atkPct', 'hpPct', 'defPct', 'atkFlat', 'atkFinal', 'hpFlat', 'defFlat', 'resFlat', 'aspd', 'spRecoveryFlat', 'resIgnorePct', 'blockCnt', 'skillDurationPct']);
const MULTIPLIERS = new Set(['atkMul', 'hpMul', 'defMul', 'dmgDealtMul', 'healingDealtMul']);

export function equipmentMods(mods, multiplier) {
  if (!mods || multiplier === 1) return mods;
  return Object.fromEntries(Object.entries(mods).map(([key, value]) => [key,
    ADDITIVE.has(key) && value > 0 ? value * multiplier :
      MULTIPLIERS.has(key) && value > 1 ? 1 + (value - 1) * multiplier : value]));
}

export const equipmentScopes = battle => battleStore(battle, 'items:columbia:scopes', () => new Set());

export function columbiaSpecialActive(battle, unit) {
  if (!onField(unit) || !bondActive(battle, unit.ownerId, COLUMBIA_BOND, 2)) return false;
  const members = battle.allyUnits.filter(u => isOp(u) && u.ownerId === unit.ownerId && onField(u) && isMember(battle, u, COLUMBIA_BOND));
  return new Set(members.map(baseChessId)).size >= 6;
}

/** 层数变化时更新所有装备；包括双星及其他临时借用的装备。 */
export function installEquipmentGrowth(battle) {
  const refresh = () => { for (const scope of equipmentScopes(battle)) scope.refreshMods(); };
  for (const event of ['battleStart', 'deploy', 'death', 'layerGain']) battle.on(event, refresh, { priority: -100 });
  battle.every(0.1, refresh);
  refresh();
}
