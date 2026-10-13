// Ultimate simulation levels, shared by the lobby, match and deterministic battle engine.
export const ULTIMATE_MAX_LEVEL = 16;
export const ULTIMATE_PLAYABLE_MAX = 8;
export const ULTIMATE_LEVELS = Array.from({ length: ULTIMATE_MAX_LEVEL + 1 }, (_, n) => n);
export const ULTIMATE_EFFECTS = [
  '所有敌方目标攻击力提高 10%',
  '所有敌方目标生命值提高 15%',
  '敌方阵亡后原地一格产生毒池，持续 3 秒，每层每秒造成 100 法术伤害，同格最多三层',
  '所有敌方目标移速提高 10%',
  '我方干员基础攻击力降低 10%',
  '常规作战延长至 16 回合；第 17 回合为 BOSS，随后衔接隐秘核心',
  'BOSS 生命值提高 20%',
  '从第 5 回合开始，每回合获得的基础资金减少 1',
];

export const isUltimateLevel = (n) => Number.isInteger(n) && n >= 0 && n <= ULTIMATE_MAX_LEVEL;
export const ultimateAvailable = (n) => isUltimateLevel(n) && n <= ULTIMATE_PLAYABLE_MAX;
export const ultimateLevelFor = (difficulty, n = 0) => difficulty === 'ABYSS' && isUltimateLevel(n) ? n : 0;

export function ultimateRules(n) {
  n = ultimateAvailable(n) ? n : 0;
  return {
    enemyAtk: n >= 1 ? 1.1 : 1,
    enemyHp: n >= 2 ? 1.15 : 1,
    poison: n >= 3,
    enemySpeed: n >= 4 ? 1.1 : 1,
    operatorAtk: n >= 5 ? 0.9 : 1,
    extraRounds: n >= 6 ? 3 : 0,
    bossHp: n >= 7 ? 1.2 : 1,
    incomePenalty: n >= 8 ? 1 : 0,
  };
}

export function ultimateEffects(n) {
  return ULTIMATE_EFFECTS.slice(0, Math.min(n, ULTIMATE_PLAYABLE_MAX));
}
