import { isHpLoss } from './damage.js';

/** Combat-only cumulative rules; shared by the server and browser BattleSpec simulations. */
export function installUltimateCombat(battle) {
  const rules = battle.ultimate;
  if (rules.operatorFinalAtk !== 1 || rules.operatorDef !== 1) {
    battle.on('deploy', ({ unit }) => {
      if (unit.side !== 'ally' || unit.kind !== 'op') return;
      battle.addBuff(unit, { key: 'ultimate:operator', persist: true,
        mods: { atkMul: rules.operatorFinalAtk, defMul: rules.operatorDef } });
    }, { priority: 1000 });
  }
  if (rules.reflect && battle.round <= 19) {
    battle.on('damaged', ({ source, target, dealt, type, dmg }) => {
      if (target.side !== 'enemy' || source?.side !== 'ally' || !source.alive || !source.deployed
          || type === 'element' || isHpLoss(dmg) || !(dealt > 0)) return;
      battle.loseHp(source, dealt * rules.reflect, { source: target, tags: ['ultimateReflect'] });
    });
  }
  if (rules.trueShield) {
    const shield = enemy => battle.addBuff(enemy, { key: 'ultimate:trueShield', shieldHits: 30, shieldType: 'true', visible: true });
    battle.on('enemySpawn', ({ enemy }) => {
      if (!enemy.isBoss) return;
      shield(enemy);
      battle.every(60, () => { if (enemy.alive && enemy.deployed) shield(enemy); });
    });
  }
}
