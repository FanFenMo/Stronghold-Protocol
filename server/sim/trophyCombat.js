/** Personal shop modifiers use each field owner's input, including multiplayer pair fields. */
export function installTrophyCombat(battle) {
  const attack = unit => {
    if (unit.kind !== 'op') return;
    const amount = battle.getPlayer(unit.ownerId)?.input?.trophyAttack || 0;
    if (amount) battle.addBuff(unit, { key: 'trophy:attack', mods: { atkMul: 1 + amount }, persist: true });
  };
  battle.on('deploy', ({ unit }) => attack(unit));
  battle.on('enemySpawn', ({ enemy }) => {
    if (battle.getPlayer(enemy.ownerId)?.input?.trophySlow) {
      battle.addBuff(enemy, { key: 'trophy:slow', mods: { moveMul: 0.8 }, persist: true });
    }
  });
}
