// 星极：天体仪、星座守护与星辉剑；法术脆弱使用已有状态系统。
import { num, skillBbOf, traitBb, up } from '../shared/tier1.js';
import { installTimeAspd } from '../shared/columbia.js';

export default {
  char_274_astesi: (bb, chess) => {
    const s1 = skillBbOf(chess, 'skchr_astesi_1'), s2 = skillBbOf(chess, 'skchr_astesi_2');
    return {
      skills: {
        skchr_astesi_1: { kind: 'duration', mods: { atkPct: num(s1.atk), defPct: num(s1.def) } },
        skchr_astesi_2: { kind: 'duration', mods: { atkPct: num(s2.atk), defPct: num(s2.def), blockCnt: num(s2.block_cnt) },
          attack: { hitAllBlocked: true } },
      },
      install(battle, unit) {
        installTimeAspd(battle, unit, chess, 'astesi:talent');
        const fragile = num(traitBb(chess).damage_scale, 1) - 1;
        if (fragile > 0) battle.every(0.1, () => {
          if (up(unit)) for (const e of unit.blocking) if (e.alive) battle.applyStatus(e, 'artsFragile', { duration: 0.15, value: fragile, source: unit });
        }, { owner: unit });
      },
    };
  },
};
