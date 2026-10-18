// 星源：两束独立链式攻击，沿用链术师的衰减、模组和停顿。
import { num, skillBbOf, skillRec } from '../shared/tier1.js';
import { installTimeAspd } from '../shared/columbia.js';

export default {
  char_135_halo: (bb, chess) => {
    const b1 = skillBbOf(chess, 'skchr_halo_1'), b2 = skillBbOf(chess, 'skchr_halo_2');
    return {
      skills: {
        skchr_halo_1: { kind: 'charges', targeting: { maxTargets: num(b1.max_target, 2) },
          attack: { atkScale: num(b1.atk_scale, 1) } },
        skchr_halo_2: { kind: 'duration', mods: { atkPct: num(b2.atk) },
          targeting: { maxTargets: num(b2['attack@max_target'], 2), rangeGrid: skillRec(chess, 'skchr_halo_2').rangeGrid } },
      },
      install(battle, unit) {
        installTimeAspd(battle, unit, chess, 'halo:research');
        if (unit.skill?.id === 'skchr_halo_1') {
          unit.skill.spec.attack.chain = { ...unit.profile.chain, count: num(b1['chain.max_target'], 4) };
        }
      },
    };
  },
};
