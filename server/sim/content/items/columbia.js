// 哥伦比亚科技装备：复用装备 Scope，借用效果到期时一并移除钩子、计时器和属性。
import { COLUMBIA_BOND, COLUMBIA_OVERLOAD_ATK_SPEED, columbiaTechValues, columbiaOverloaded } from '../../../../shared/columbia.js';
import { bondTier, isMember, isOp, onField, alliesAround, inRange, battleStore, passiveBuff } from '../support/index.js';

const PREFIX = 'chess_item_custom_columbia_';
export const columbiaItemKey = (id) => id.startsWith(PREFIX) ? id.slice(PREFIX.length).replace(/_[ab]$/, '') : null;
const proc = (dmg) => dmg.tags?.includes('item');

export function installColumbiaItem(battle, u, key, S) {
  if (!isMember(battle, u, COLUMBIA_BOND)) return;
  const overloaded = columbiaOverloaded(bondTier(battle, u.ownerId, COLUMBIA_BOND));
  const v = columbiaTechValues(key, overloaded);
  if (overloaded) {
    const wearers = battleStore(battle, 'items:columbia:overload', () => new Map());
    wearers.set(u, (wearers.get(u) ?? 0) + 1);
    passiveBuff(battle, u, 'bond:columbiaShip:overload', { aspd: COLUMBIA_OVERLOAD_ATK_SPEED });
    S.onDispose(() => {
      const n = wearers.get(u) - 1;
      if (n) wearers.set(u, n);
      else { wearers.delete(u); battle.removeBuff(u, 'bond:columbiaShip:overload'); }
    });
  }

  if (key === 'pioneer') {
    let attacks = 0;
    const scales = new Map();
    S.on('attackStart', (c) => {
      if (c.attacker !== u || !c.targets.some(t => t.side === 'enemy')) return;
      attacks++;
      scales.set(c.attackId, Math.min(v.cap, v.atkScale + Math.floor(attacks / 3) * v.perThree));
    });
    S.on('hit', (c) => {
      if (c.source !== u || !c.dmg.isAttack || c.dmg.type === 'element' || proc(c.dmg)) return;
      c.dmg.mul *= scales.get(c.dmg.attackId) ?? Math.min(v.cap, v.atkScale + Math.floor(attacks / 3) * v.perThree);
    });
  } else if (key === 'mapland') {
    S.on('damaged', (c) => {
      if (c.source !== u || c.target.side !== 'enemy' || c.type === 'element' || proc(c.dmg)) return;
      const amount = c.dealt ?? c.amount;
      if (!(amount > 0)) return;
      let target = null;
      for (const a of battle.allyUnits) {
        if (!isOp(a) || a.ownerId !== u.ownerId || !onField(a)) continue;
        if (!target || a.hpRatio < target.hpRatio) target = a;
      }
      if (target) battle.heal(u, target, amount * v.healRatio, { columbiaItem: true });
      if (c.target.alive) S.buff(c.target, { key: S.key('atkDown'), duration: v.atkDownDuration,
        mods: { atkPct: -v.atkDown }, refresh: 'stack', maxStacks: v.atkDownMax });
    });
  } else if (key === 'shield') {
    S.stat('hp', { hpFlat: v.hp });
    let maxHp = -1, used = false, until = -Infinity;
    const resists = () => {
      const hp = u.s.maxHp;
      if (hp === maxHp) return;
      maxHp = hp;
      S.stat('resists', { defFlat: hp * v.resRatio, resFlat: hp * v.resRatio });
    };
    const lock = () => {
      if (!used && u.hp < u.s.maxHp / 2) { used = true; until = battle.time + v.lockHpSeconds; }
    };
    resists();
    S.every(0.25, resists);
    S.on('damaged', (c) => { if (c.target === u && c.type !== 'element') lock(); });
    S.on('fatal', (c) => {
      if (c.unit !== u) return;
      lock();
      if (battle.time < until) c.prevented = true;
    }, 20);
  } else if (key === 'graymatter') {
    let damage = 0, stacks = 0;
    S.stat('atk', { atkPct: v.atkPct });
    S.on('damaged', (c) => {
      if (c.source !== u || c.target.side !== 'enemy' || c.type === 'element' || proc(c.dmg)) return;
      const amount = c.dealt ?? c.amount;
      if (!(amount > 0)) return;
      damage += amount;
      const next = Math.min(v.maxStacks, Math.floor(damage / 1000));
      if (next !== stacks) { stacks = next; S.stat('atk', { atkPct: v.atkPct + stacks * v.perThousand }); }
      if (c.dmg.isAttack && c.target.alive && c.target.hp > 0) battle.dealDamage(u, c.target,
        { type: 'element', element: 'neural', amount: amount * v.necrosis, tags: ['item', 'columbia:graymatter'] });
    });
  } else if (key === 'dover') {
    S.stat('healing', { healingDealtMul: 1 + v.healUp });
    S.on('healed', (c) => {
      if (c.source !== u || c.opts.regen || c.opts.columbiaDover) return;
      for (const a of alliesAround(battle, u)) if (isOp(a) && a.skill) a.skill.gainSp(v.selfAroundSp, 'item');
      for (const a of alliesAround(battle, c.target)) if (isOp(a)) {
        battle.heal(u, a, c.amount * v.targetAroundHeal, { fixedHeal: true, columbiaDover: true });
      }
    });
  } else if (key === 'antigrav') {
    const tiles = battleStore(battle, 'items:columbia:floatTiles', () => new Map());
    S.on('skillStart', (c) => {
      if (c.unit !== u) return;
      const enemies = battle.enemiesInKeys(u.rangeKeys, u, { canHitFly: true });
      const ready = new Map();
      for (const e of enemies) {
        const tile = `${Math.round(e.y)},${Math.round(e.x)}`;
        if (battle.time - (tiles.get(tile) ?? -Infinity) < 5) continue;
        const list = ready.get(tile) ?? [];
        list.push(e); ready.set(tile, list);
      }
      for (const [tile, list] of ready) {
        tiles.set(tile, battle.time);
        for (const e of list) battle.applyStatus(e, 'levitate', { duration: v.floatSeconds, source: u });
      }
    });
    const affected = new Set();
    const aura = () => {
      const now = new Set();
      if (onField(u) && u.skill?.active) for (const a of battle.allyUnits) {
        if (!isOp(a) || a.ownerId !== u.ownerId || !onField(a) || !inRange(u, a)) continue;
        now.add(a);
        if (!affected.has(a)) S.buff(a, { key: S.key('aura'), mods: { aspd: v.atkSpeed, spRecoveryFlat: v.spRegen } });
      }
      for (const a of affected) if (!now.has(a)) battle.removeBuff(a, S.key('aura'));
      affected.clear();
      for (const a of now) affected.add(a);
    };
    S.on('skillStart', (c) => { if (c.unit === u) aura(); });
    S.on('skillEnd', (c) => { if (c.unit === u) { for (const a of affected) battle.removeBuff(a, S.key('aura')); affected.clear(); } });
    S.every(0.1, aura);
  }
}
