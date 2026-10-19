// 哥伦比亚科技装备：复用装备 Scope，借用效果到期时一并移除钩子、计时器和属性。
import { COLUMBIA_BOND, COLUMBIA_RES_CAP, columbiaTechValues } from '../../../../shared/columbia.js';
import { isMember, isOp, onField, alliesAround, inRange } from '../support/index.js';
import { equipmentMultiplier } from './columbia-policy.js';

const PREFIX = 'chess_item_custom_columbia_';
export const columbiaItemKey = (id) => id.startsWith(PREFIX) ? id.slice(PREFIX.length).replace(/_[ab]$/, '') : null;
const proc = (dmg) => dmg.tags?.includes('item');

export function installColumbiaItem(battle, u, key, S) {
  if (!isMember(battle, u, COLUMBIA_BOND)) return;
  const v = columbiaTechValues(key);
  const multiplier = () => equipmentMultiplier(battle, u);
  const attackScale = attacks => 1 + (Math.min(v.cap, v.atkScale + Math.floor(attacks / 3) * v.perThree) - 1) * multiplier();

  if (key === 'pioneer') {
    let attacks = 0;
    const scales = new Map();
    S.on('attackStart', (c) => {
      if (c.attacker !== u || !c.targets.some(t => t.side === 'enemy')) return;
      attacks++;
      scales.set(c.attackId, attackScale(attacks));
    });
    S.on('hit', (c) => {
      if (c.source !== u || !c.dmg.isAttack || c.dmg.type === 'element' || proc(c.dmg)) return;
      c.dmg.mul *= scales.get(c.dmg.attackId) ?? attackScale(attacks);
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
      if (target) battle.heal(u, target, amount * v.healRatio * multiplier(), { columbiaItem: true });
    });
  } else if (key === 'shield') {
    S.stat('hp', { hpFlat: v.hp });
    let value = -1;
    const resists = () => {
      const hp = u.s.maxHp;
      const amount = hp * v.resRatio * multiplier();
      if (amount === value) return;
      value = amount;
      S.stat('resists', { defFlat: amount, resFlat: Math.min(COLUMBIA_RES_CAP, amount) }, { equipmentScale: false });
    };
    resists();
    S.every(0.25, resists);
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
        { type: 'element', element: 'neural', amount: amount * v.necrosis * multiplier(), tags: ['item', 'columbia:graymatter'] });
    });
  } else if (key === 'dover') {
    S.stat('healing', { healingDealtMul: 1 + v.healUp });
    S.on('healed', (c) => {
      if (c.source !== u || c.opts.regen || c.opts.columbiaDover) return;
      for (const a of alliesAround(battle, u)) if (isOp(a) && a.skill) a.skill.gainSp(v.selfAroundSp * multiplier(), 'item');
      for (const a of alliesAround(battle, c.target)) if (isOp(a)) {
        battle.heal(u, a, c.amount * v.targetAroundHeal * multiplier(), { fixedHeal: true, columbiaDover: true });
      }
    });
  } else if (key === 'antigrav') {
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
