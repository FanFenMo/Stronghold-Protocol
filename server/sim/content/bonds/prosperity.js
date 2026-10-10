import { ROWS, COLS } from '../../constants.js';
import { PROSPERITY_BOND as ID, PROSPERITY_ORB_TAG, prosperityHealBonus, prosperityBlastGrid } from '../../../../shared/prosperity.js';
import { bondTier, bondLayers, isMember, onField, playerOps, passiveBuff } from '../support/index.js';

export function install(battle) {
  const states = new Map();
  for (const p of battle.players) {
    const tier = bondTier(battle, p.playerId, ID);
    if (!tier) continue;
    states.set(p.playerId, { tier, members: new Set(playerOps(battle, p.playerId).filter(u => isMember(battle, u, ID))) });
  }
  if (!states.size) return;
  const apply = (pid) => {
    const bonus = prosperityHealBonus(bondLayers(battle, pid, ID));
    for (const u of states.get(pid).members) passiveBuff(battle, u, `bond:${ID}`, { healingDealtMul: 1 + bonus });
  };
  for (const pid of states.keys()) apply(pid);
  battle.on('layerGain', ({ playerId, bondId }) => {
    if (bondId === ID && states.has(playerId)) battle.after(0, () => apply(playerId));
  });
  const stateOf = (u) => u && states.get(u.ownerId);
  const credit = (source, target, amount) => {
    const st = stateOf(source);
    if (st?.tier >= 2 && source.kind === 'op' && st.members.has(source) && onField(source) && target.kind === 'op' && source !== target) {
      source.mem.prosperityHealing = (source.mem.prosperityHealing || 0) + amount;
    }
  };
  battle.on('healed', ({ source, target, amount, opts }) => {
    if (!opts.regen && !opts.self && !opts.tags?.includes(PROSPERITY_ORB_TAG)) credit(source, target, amount);
  });
  // 铃兰的技能以回复速度提供治疗，保留原有回复节奏并按实际恢复量归属来源。
  battle.on('regen', (c) => {
    for (const buff of c.unit.buffs) {
      const source = buff.source, st = stateOf(source);
      if (!buff.data.skillRegen || !st?.members.has(source) || !onField(source)) continue;
      const base = buff.mods.hpRegen * c.dt;
      const bonus = base * prosperityHealBonus(bondLayers(battle, source.ownerId, ID));
      c.amount += bonus;
      c.credits.push({ source, amount: base + bonus });
    }
  });
  battle.on('regenerated', ({ unit, credits }) => {
    for (const { source, amount } of credits) credit(source, unit, amount);
  });
  if (![...states.values()].some(st => st.tier >= 2)) return;
  battle.every(1, () => {
    for (const [pid, st] of states) {
      if (st.tier < 2) continue;
      for (const u of st.members) {
        if (!onField(u) || u.hidden || !(u.mem.prosperityHealing > 0)) continue;
        const target = battle.enemiesInKeys(u.rangeKeys, u, { canHitFly: true })[0];
        if (!target) continue;
        const damage = Math.min(u.mem.prosperityHealing / 10, 5000);
        u.mem.prosperityHealing = 0;
        const r = Math.round(target.y), c = Math.round(target.x);
        const tiles = prosperityBlastGrid(bondLayers(battle, pid, ID)).map(([dr, dc]) => [r + dr, c + dc])
          .filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS);
        const keys = tiles.map(([rr, cc]) => rr * COLS + cc), area = new Set(keys);
        for (const a of battle.allyUnits) if (a.kind === 'op' && onField(a) && !a.hidden && area.has(a.tileR * COLS + a.tileC)) {
          battle.heal(u, a, damage / 2, { fixedHeal: true, tags: [PROSPERITY_ORB_TAG] });
        }
        for (const e of battle.enemiesInKeys(keys, u, { canHitFly: true })) {
          battle.dealDamage(u, e, { amount: damage, type: 'true', sourceless: true, canDodge: false, tags: [PROSPERITY_ORB_TAG] });
        }
        battle.fx('lifeOrb', { src: u.id, x: c, y: r, tiles, damage });
      }
    }
  });
}
