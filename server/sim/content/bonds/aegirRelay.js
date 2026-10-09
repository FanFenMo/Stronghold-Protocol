// 阿戈尔 v1.3：保存开战吞噬链，死亡的中间节点不切断或缩短传递距离。
import * as S from '../support/index.js';
import { canTargetEnemy } from '../../targeting.js';

export const devourChains = (battle) => S.battleStore(battle, 'bond:egir:relay', () => new Map());

function blockedThroughChain(battle, source, profile) {
  const targets = new Map();
  for (const [food, depth] of devourChains(battle).get(source) ?? []) {
    if (!S.onField(food)) continue;
    for (const e of food.blocking) {
      if (e.blockedBy !== food || e.def.applyWay === 'RANGED' || !canTargetEnemy(source, e, profile)) continue;
      if (!targets.has(e) || depth < targets.get(e)) targets.set(e, depth);
    }
  }
  return targets;
}

export function installAegirRelay(battle, bb, members) {
  const sources = new Set(members);
  battle.on('attackTargets', ({ unit, profile, targets }) => {
    if (!sources.has(unit) || !S.onField(unit)) return;
    for (const e of blockedThroughChain(battle, unit, profile).keys()) targets.push(e);
  });
  battle.on('attackStart', ({ attacker, targets, profile, damageMultipliers }) => {
    if (!sources.has(attacker) || !S.onField(attacker) || profile.dmgType === 'heal') return;
    // Check again after beforeAttack: a skill can replace the targets or alter its attack range.
    if (battle.enemiesInKeys(attacker.rangeKeys, attacker, profile).length || battle.blockedTargets(attacker, profile).length) return;
    const remote = blockedThroughChain(battle, attacker, profile);
    for (const e of targets) {
      const depth = remote.get(e);
      if (depth !== undefined) damageMultipliers.set(e.id, Math.pow(bb.relay_damage_per_hop, depth));
    }
  });
}
