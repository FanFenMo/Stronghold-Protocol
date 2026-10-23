import { TrophyUnity } from './trophyUnity.js';

/** Personal shop modifiers use each field owner's input, including multiplayer pair fields. */
export function installTrophyCombat(battle) {
  const groups = new Map();
  for (const player of battle.players) {
    if (!player.input?.trophyUnity) continue;
    const group = new TrophyUnity(battle, player.playerId);
    groups.set(player.playerId, group);
    for (const unit of player.units) if (unit.kind === 'op') unit.trophyUnity = group;
  }
  const attack = unit => {
    if (unit.kind !== 'op') return;
    const amount = battle.getPlayer(unit.ownerId)?.input?.trophyAttack || 0;
    if (amount) battle.addBuff(unit, { key: 'trophy:attack', mods: { atkMul: 1 + amount }, persist: true });
    const group = groups.get(unit.ownerId);
    if (group) { unit.trophyUnity = group; group.join(unit); }
  };
  battle.on('deploy', ({ unit }) => attack(unit));
  battle.on('enemySpawn', ({ enemy }) => {
    if (battle.getPlayer(enemy.ownerId)?.input?.trophySlow) {
      battle.addBuff(enemy, { key: 'trophy:slow', mods: { moveMul: 0.8 }, persist: true });
    }
  });
  if (groups.size) battle.on('tick', () => { for (const group of groups.values()) { group.syncHealth(); group.syncAttack(); } });
}
