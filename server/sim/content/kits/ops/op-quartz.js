// 石英：粉碎者群攻、行于荒野与两种可选技能。
import { num, talentBb, traitBb, skillBbOf } from '../shared/tier1.js';

export default {
  char_4063_quartz: (bb, chess) => {
    const s1 = skillBbOf(chess, 'skcom_atk_up[2]'), s2 = skillBbOf(chess, 'skchr_quartz_2');
    return {
      skills: {
        'skcom_atk_up[2]': { kind: 'duration', mods: { atkPct: num(s1.atk) } },
        skchr_quartz_2: { kind: 'duration', mods: { aspd: num(s2.attack_speed), dmgTakenMul: num(s2.damage_scale, 1) },
          attack: { atkScale: num(s2['attack@s2_atk_scale'], 1), onEachHit({ battle, unit, target }) {
            if (battle.rng.chance(num(s2['attack@s2_buff_prob']))) battle.applyStatus(target, 'stun', { duration: num(s2['attack@s2_stun']), source: unit });
          } } },
      },
      talents: [{ install(battle, unit) {
        const t = talentBb(chess, 0), tb = traitBb(chess);
        battle.addBuff(unit, { key: 'quartz:talent', persist: true, allowDead: true,
          mods: { atkPct: num(t.atk), hpPct: num(t.max_hp), healingTakenMul: num(tb.heal_scale, 1) } });
      } }],
    };
  },
};
