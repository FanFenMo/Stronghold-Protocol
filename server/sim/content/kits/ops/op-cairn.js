// 响石：屏障、周身法术持续伤害与神经损伤，阻挡天赋随部署生效。
import { num, skillBbOf, skillRec, talentBb, traitBb, up } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';

export default {
  char_4214_cairn: (bb, chess) => {
    const s1 = skillBbOf(chess, 'skchr_cairn_1'), s2 = skillBbOf(chess, 'skchr_cairn_2');
    return {
      skills: {
        skchr_cairn_1: { kind: 'duration', mods: { hpPct: num(s1.max_hp) } },
        skchr_cairn_2: { kind: 'instant', onStart({ battle, unit }) {
          const duration = num(s2.buff_duration, 10), ratio = num(s2.shield_hp_ratio);
          const old = unit.findBuff('cairn:barrier');
          battle.addBuff(unit, { key: 'cairn:barrier', duration,
            shield: Math.min(unit.s.maxHp * num(s2.shield_max_hp_ratio), (old?.shield ?? 0) + unit.s.maxHp * ratio), visible: true });
          const grid = skillRec(chess, 'skchr_cairn_2').rangeGrid;
          const keys = absoluteRangeKeys(grid, unit.tileR, unit.tileC, unit.dir);
          for (const e of battle.enemiesInKeys(keys, unit, { canHitFly: false })) battle.addBuff(e,
            { key: `cairn:skill:${unit.id}`, duration, interval: 1, source: unit,
              onTick({ battle: b, unit: target }) {
                b.dealDamage(unit, target, { amount: unit.s.atk * num(s2.atk_scale), type: 'arts', isSkill: true, tags: ['skill', 'dot'] });
                b.dealDamage(unit, target, { amount: unit.s.atk * num(s2.ep_damage_ratio), type: 'element', element: 'neural', isSkill: true, tags: ['skill', 'dot'] });
              } });
        } },
      },
      install(battle, unit) {
        const ratio = num(talentBb(chess, 0).ep_damage_ratio), scale = num(traitBb(chess).ep_damage_scale, 1);
        battle.every(1, () => {
          if (up(unit)) for (const e of unit.blocking) if (e.alive) battle.dealDamage(unit, e,
            { amount: unit.s.atk * ratio, type: 'element', element: 'neural', tags: ['talent'] });
        }, { owner: unit });
        if (scale !== 1) battle.on('elementHit', c => {
          if (c.source === unit && unit.blocking.length) c.dmg.mul *= scale;
        }, { owner: unit });
      },
    };
  },
};
