const TIMES_SPEED_MULTIPLIER = 0.95;
const CHENSHA_EXTRA_SPEED_MULTIPLIER = 0.95;

/** TIMES enemies and their summons move 5% slower; 沉沙 receives another 5% reduction. */
export function timesEnemySpeedMultipliers(pool, summonsOf) {
  const keys = new Set(pool);
  for (const key of keys) for (const child of summonsOf(key)) keys.add(child);
  return new Map([...keys].map(key => [key,
    TIMES_SPEED_MULTIPLIER * (key === 'enemy_1207_sfji' ? CHENSHA_EXTRA_SPEED_MULTIPLIER : 1)]));
}
