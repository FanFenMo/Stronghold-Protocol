import { ROLLING_BAND } from '../../shared/strategies.js';
import { createRng, deriveSeed } from '../sim/rng.js';

export const newTrophyShopState = () => ({ counts: {}, slowThrough: undefined, attack: 0, equipment: null,
  fundsRound: null, extraStrategy: false, mystery: null, lastStandUsed: false });

/** Resolve hidden outcomes once when purchased, using a stream independent of waves and shop rolls. */
export function planTrophyPurchase(match, ps, product) {
  const rng = createRng(deriveSeed(match.seed, `trophy:${ps.playerId}:${product.id}`));
  const rounds = Array.from({ length: match.gd.lastRound }, (_, i) => i + 1);
  if (product.group === 'funds') return { round: rng.pick(rounds) };
  if (product.group !== 'mystery') return null;
  const roll = rng.int(100);
  const kind = roll >= 95 ? 6 : Math.floor(roll / 19) + 1;
  const mysteryRounds = rounds.filter(r => r > 4 && (kind !== 3 || !match.gd.isBossRound(r)));
  const round = rng.pick(mysteryRounds);
  const plan = { kind, round };
  if (kind === 1) plan.chessId = rng.pick(match.gd.visibleChess.filter(id => ps.canUseChess(id)));
  if (kind === 2) {
    const bonds = match.gd.bondIds.filter(id => {
      const bond = match.gd.bond(id);
      return !bond.noStack && !match.gd.modeInactiveBonds.has(id) && !match.disabledBonds.includes(id);
    });
    plan.bondId = rng.pick(bonds);
  }
  return plan;
}

export function applyTrophyPurchase(ps, product, plan) {
  const state = ps.trophyShop;
  state.counts[product.group] = (state.counts[product.group] || 0) + 1;
  if (product.group === 'slow') state.slowThrough = product.value;
  if (product.group === 'attack') state.attack = product.value;
  if (product.group === 'equipment') state.equipment = product.value;
  if (product.group === 'funds') state.fundsRound = plan.round;
  if (product.group === 'strategy') state.extraStrategy = true;
  if (product.group === 'mystery') state.mystery = plan;
  ps.dirty();
}

export function prepareTrophyRound(ps, round) {
  const state = ps.trophyShop;
  if (round === 1 && state.extraStrategy) {
    const rng = createRng(deriveSeed(ps.m.seed, `trophy:strategy:${ps.playerId}`));
    const id = rng.pick(ps.gd.bandIds().filter(id => id !== ROLLING_BAND && id !== ps.bandId));
    if (id) {
      ps.extraBands = [id];
      ps.m.toast(ps, 'info', `额外策略：${ps.gd.band(id).name}`);
    }
  }
}

/** At the beginning of the selected prep only; a missed event never moves to a later prep. */
export function grantTrophyRound(ps, round) {
  const state = ps.trophyShop;
  if (state.fundsRound === round) ps.addFunds(10, { reason: 'trophy-shop' });
  if (round === 5 && state.equipment) ps.acquireItem(state.equipment, { source: 'trophy-shop' });
  const mystery = state.mystery;
  if (!mystery || mystery.round !== round) return;
  if (mystery.kind === 1 && mystery.chessId) {
    const piece = ps.acquireChess(mystery.chessId, { source: 'trophy-shop', fromPool: false,
      fixedStats: { maxHp: 9999, hpRegen: 2000, atk: 79999, aspd: 325, def: 799 } });
    if (piece) ps.m.sendTo(ps.playerId, { t: 'm.shopReward', chessId: piece.id, name: ps.gd.chess(piece.id).name });
  }
  if (mystery.kind === 2 && mystery.bondId) {
    const bond = ps.gd.bond(mystery.bondId);
    ps.addLayers(mystery.bondId, bond.isCore ? 200 : 100, { reason: 'trophy-shop' });
  }
  if (mystery.kind === 4) ps.shop.freeRefreshes += 99;
  ps.dirty();
}

export const trophySixShop = ps => ps.trophyShop.mystery?.kind === 5 && ps.trophyShop.mystery.round === ps.m.round;
export const trophyFragmentRound = ps => ps.trophyShop.mystery?.kind === 3 && ps.trophyShop.mystery.round === ps.m.round
  && !ps.gd.isBossRound(ps.m.round);

export function trophySpawns(ps, spawns) {
  if (!trophyFragmentRound(ps)) return spawns;
  return spawns.map(spawn => ({ ...spawn, enemyKey: 'enemy_1207_sfji_2',
    mods: { ...(spawn.mods || {}), trophyFragments: true } }));
}

export function saveWithTrophy(ps) {
  if (!ps.trophyShop.counts.last_stand || ps.trophyShop.lastStandUsed) return false;
  ps.trophyShop.lastStandUsed = true;
  ps.m.toast(ps, 'info', '保留 1 点生命，继续模拟');
  return true;
}
