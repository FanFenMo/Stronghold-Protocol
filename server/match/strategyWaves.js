import { W_BAND, W_PENDING } from '../../shared/strategies.js';

const countOf = s => Math.max(1, Math.trunc(s.count || 1));
const ordinary = (gd, s) => !s.tag && !s.bounty && !s.mods?.bountyId && !s.mods?.bountyCoins
  && !/^enemy_2001_duckmi/.test(s.enemyKey) && gd.enemy(s.enemyKey)?.rank !== 'BOSS'
  && s.countInTotal !== false && !gd.enemy(s.enemyKey)?.notCountInTotal;
const copy = s => ({ ...s, mods: s.mods ? { ...s.mods } : undefined });

/** Decide once when the next normal round opens; previews and combat reuse this plan. */
export function planWTransfers(m, players) {
  const plans = new Map(players.map(p => [p.playerId, { remove: null, add: [] }]));
  if (!m.wave) return plans;
  const candidates = m.wave.spawns.filter(s => ordinary(m.gd, s));
  const total = candidates.reduce((n, s) => n + countOf(s), 0);
  for (const ps of players) {
    if (ps.bandId !== W_BAND || ps.counters[W_PENDING] !== m.round) continue;
    ps.counters[W_PENDING] = 0;
    if (!total) continue;
    let k = m.rngMeta.int(total), chosen;
    for (const s of candidates) {
      if (k < countOf(s)) { chosen = s; break; }
      k -= countOf(s);
    }
    plans.get(ps.playerId).remove = { actionIndex: chosen.actionIndex, enemyKey: chosen.enemyKey, index: k };
    ps.addFunds(2, { reason: '隔岸观火' });
    for (const other of players) {
      if (other === ps) continue;
      const transferred = { ...copy(chosen), count: 1, interval: 0,
        mods: { ...chosen.mods },
        time: chosen.time + k * (chosen.interval || 0), tag: 'w_transfer',
        bounty: { coins: 1, chance: 0.5, ownerPlayerId: other.playerId } };
      delete transferred.actionIndex;
      for (const attr of ['hpMul', 'atkMul', 'defMul', 'resMul', 'speedMul']) {
        transferred.mods[attr] = (transferred.mods[attr] ?? 1) * 0.7;
      }
      transferred.mods.bountyCoins = 1;
      transferred.mods.bountyChance = 0.5;
      plans.get(other.playerId).add.push(transferred);
    }
  }
  return plans;
}

/** Remove exactly one ordinary copy after bounty insertion retimes the host action. */
export function applyWTransfers(gd, spawns, plan) {
  if (!plan) return spawns;
  const out = [], target = plan.remove;
  let remaining = target?.index ?? -1;
  for (const s of spawns) {
    const n = countOf(s);
    if (remaining >= 0 && s.actionIndex === target.actionIndex && s.enemyKey === target.enemyKey && ordinary(gd, s)) {
      if (remaining >= n) { remaining -= n; out.push(copy(s)); continue; }
      if (remaining > 0) out.push({ ...copy(s), count: remaining });
      if (remaining + 1 < n) out.push({ ...copy(s), count: n - remaining - 1,
        time: s.time + (remaining + 1) * (s.interval || 0) });
      remaining = -1;
    } else out.push(copy(s));
  }
  return out.concat(plan.add.map(copy));
}
