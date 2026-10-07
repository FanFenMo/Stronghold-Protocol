// 阿斯卡纶: PRTS talent / skill blackboards; normal Lv4 and elite Lv7 share this kit.
import { bodyInKeys } from '../../body.js';

const on = (u) => u.alive && u.deployed;

export default function ascalon(bb, chess, def) {
  const venom = def.talents[0].bb, shadow = def.talents[1].bb;
  const selected = def.skill.id;
  const s2 = selected === 'skchr_ascln_2', s3 = selected === 'skchr_ascln_3';
  return {
    skills: {
      skchr_ascln_1: { kind: 'charges', attack: { atkScale: bb.atk_scale, hits: 2 } },
      skchr_ascln_2: {
        kind: 'duration', mods: { atkPct: bb.atk },
        onStart({ battle, unit }) { battle.fx('ascalonMist', { id: unit.id, x: unit.x, y: unit.y, duration: def.skill.duration }); },
      },
      skchr_ascln_3: {
        kind: 'duration', mods: { atkPct: bb.atk, batPct: bb.base_attack_time / def.stats.bat, taunt: bb.taunt_level },
        targeting: { rangeGrid: def.skill.rangeGrid },
        onStart({ battle, unit }) { battle.fx('ascalonDescent', { id: unit.id, x: unit.x, y: unit.y }); },
      },
    },
    install(battle, unit) {
      // The profession already supplies the stalker's -1 taunt; do not count the imported base value twice.
      battle.addBuff(unit, { key: 'ascalon:baseTaunt', mods: { taunt: -def.stats.tauntLevel }, persist: true, allowDead: true });
      const key = `ascalon:venom:${unit.id}`;
      const apply = (enemy) => {
        if (!enemy.alive || enemy.isFlying) return;
        let mark = enemy.buffs.find((b) => b.key === key);
        const layers = Math.min(venom.max_stack_cnt, (mark?.data.layers || 0) + 1);
        if (mark) {
          mark.data.layers = layers;
          mark.timeLeft = venom.debuff_duration;
          mark.mods = { moveMul: 1 + venom.move_speed * layers };
          enemy.markDirty();
        } else {
          mark = battle.addBuff(enemy, {
            key, source: unit, duration: venom.debuff_duration, interval: venom.interval,
            mods: { moveMul: 1 + venom.move_speed }, data: { layers },
            onTick({ unit: target, buff }) {
              if (!on(unit)) return;
              battle.dealDamage(unit, target, { amount: unit.s.atk * venom.atk_ratio * buff.data.layers, type: 'arts',
                canDodge: false, ignoreSelect: true, tags: ['talent', 'dot', 'ascalon'] });
              battle.fx('ascalonVenom', { id: target.id, x: target.x, y: target.y, layers: buff.data.layers });
            },
          });
        }
        battle.fx('ascalonVenom', { id: enemy.id, x: enemy.x, y: enemy.y, layers });
      };
      battle.on('damaged', (c) => {
        if (c.source === unit && c.target.side === 'enemy' && c.dmg.isAttack && on(unit)) apply(c.target);
      }, { owner: unit });
      battle.on('attack', (c) => {
        if (c.attacker === unit) battle.fx('ascalonSlash', { id: unit.id, x: unit.x, y: unit.y });
      }, { owner: unit });
      battle.every(0.2, () => {
        if (!on(unit)) return;
        const high = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => battle.grid.tile(unit.tileR + dr, unit.tileC + dc).height === 'HIGH');
        battle.addBuff(unit, { key: 'ascalon:shadow', duration: 0.3, mods: { aspd: shadow.attack_speed + (high ? shadow.attack_speed_add : 0) } });
        if (s2 && unit.skill.active) {
          for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })) {
            battle.addBuff(e, { key: `ascalon:mist:${unit.id}`, duration: 0.3, source: unit, mods: { moveMul: 1 + bb.move_speed } });
          }
        }
      }, { owner: unit });
      battle.on('kill', ({ victim }) => {
        if (!s2 || !on(unit) || !unit.skill.active || victim.side !== 'enemy' || victim.isFlying || !bodyInKeys(victim, unit.rangeKeySet)) return;
        for (const e of battle.foesInRadius(victim.x, victim.y, bb.range_radius, false)) if (e !== victim) apply(e);
        battle.fx('ascalonSpread', { x: victim.x, y: victim.y, r: bb.range_radius });
      }, { owner: unit });
      // Accuracy loss belongs to enemies in the area, including when they attack another ally.
      battle.on('hit', (c) => {
        if (!s3 || !on(unit) || !unit.skill.active || c.dmg.cancel || !c.dmg.canDodge || c.source?.side !== 'enemy' || c.source.isFlying || !bodyInKeys(c.source, unit.rangeKeySet)) return;
        const miss = c.dmg.type === 'phys' ? -bb['attack@damage_hitrate_physical'] : c.dmg.type === 'arts' ? -bb['attack@damage_hitrate_magical'] : 0;
        if (!battle.rng.chance(miss)) return;
        c.dmg.cancel = true;
        battle.fx('dodge', { id: c.target.id, x: c.target.x, y: c.target.y });
        battle.emit('dodge', { source: c.source, target: c.target, dmg: c.dmg });
      }, { owner: unit });
      battle.on('dodge', (c) => {
        if (!s3 || c.target !== unit || !on(unit) || !unit.skill.active) return;
        battle.heal(unit, unit, unit.s.maxHp * bb['attack@hp_ratio'], { self: true });
        battle.fx('ascalonRecover', { id: unit.id, x: unit.x, y: unit.y });
      }, { owner: unit });
      battle.on('death', (c) => {
        if (c.unit !== unit) return;
        for (const e of battle.enemies) {
          battle.removeBuff(e, key);
          battle.removeBuff(e, `ascalon:mist:${unit.id}`);
        }
      }, { owner: unit });
    },
  };
}
