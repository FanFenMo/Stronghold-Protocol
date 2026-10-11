import { powi } from '../../detmath.js';
// 阿戈尔 v1.3：保存开战吞噬链，死亡的中间节点不切断或缩短传递距离。
import * as S from '../support/index.js';
import { absoluteRangeKeys, sortEnemyTargets } from '../../targeting.js';

export const devourChains = (battle) => S.battleStore(battle, 'bond:egir:relay', () => new Map());

function targetsThroughChain(battle, source, profile) {
  const targets = new Map();
  for (const [food, depth] of devourChains(battle).get(source) ?? []) {
    if (!S.onField(food)) continue;
    const keys = absoluteRangeKeys([[0, 0], [0, 1]], food.tileR, food.tileC, food.dir);
    for (const e of battle.enemiesInKeys(keys, source, profile)) {
      if (!targets.has(e) || depth < targets.get(e)) targets.set(e, depth);
    }
  }
  const chosen = sortEnemyTargets(battle, source, [...targets.keys()], profile.priority)[0];
  return chosen ? new Map([[chosen, targets.get(chosen)]]) : new Map();
}

export function installAegirRelay(battle, bb, members) {
  const sources = new Set(members);
  battle.on('attackTargets', ({ unit, profile, targets }) => {
    if (!sources.has(unit) || !S.onField(unit)) return;
    for (const e of targetsThroughChain(battle, unit, profile).keys()) targets.push(e);
  });
  battle.on('attackStart', ({ attacker, targets, profile, damageMultipliers }) => {
    if (!sources.has(attacker) || !S.onField(attacker) || profile.dmgType === 'heal') return;
    // Check again after beforeAttack: a skill can replace the targets or alter its attack range.
    if (battle.enemiesInKeys(attacker.rangeKeys, attacker, profile).length || battle.blockedTargets(attacker, profile).length) return;
    const remote = targetsThroughChain(battle, attacker, profile);
    for (const e of targets) {
      const depth = remote.get(e);
      if (depth !== undefined) damageMultipliers.set(e.id, powi(bb.relay_damage_per_hop, depth));
    }
  });
}
