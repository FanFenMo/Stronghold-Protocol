// 哥伦比亚科技装备：基础效果始终生效，专属效果要求六名不同成员在场。
import { COLUMBIA_BOND, COLUMBIA_RES_CAP, columbiaTechItem } from '../../../../shared/columbia.js';
import { isMember, isOp, onField, alliesAround, inRange, N8 } from '../support/index.js';
import { aggregateMods } from '../../buffs.js';
import { equipmentMultiplier, columbiaSpecialActive } from './columbia-policy.js';

const PREFIX = 'chess_item_custom_columbia_';
export const columbiaItemKey = id => id.startsWith(PREFIX) ? id.slice(PREFIX.length).replace(/_[ab]$/, '') : null;
const proc = dmg => dmg.tags?.includes('item');
const BORROW = 'columbia:graymatter:borrow';

// 不把另一台引擎借来的攻击再次借走，避免相邻引擎递归放大同一份攻击。
function unborrowedAttack(unit) {
  const borrowed = unit.buffs.reduce((sum, buff) => sum + (buff.tags?.includes(BORROW) ? (buff.mods?.atkFinal ?? 0) * buff.stacks : 0), 0);
  const { mul } = aggregateMods(unit.buffs);
  return Math.max(0, unit.s.atk - borrowed * (mul.atkMul ?? 1) * (unit.cultMul?.atk ?? 1));
}

function aroundAura(battle, u, S, mods, offsets) {
  const affected = new Set();
  const refresh = () => {
    const now = new Set(onField(u) ? alliesAround(battle, u, offsets).filter(a => isOp(a) && onField(a)) : []);
    for (const a of now) if (!affected.has(a)) S.buff(a, { key: S.key('around'), mods });
    for (const a of affected) if (!now.has(a)) battle.removeBuff(a, S.key('around'));
    affected.clear();
    for (const a of now) affected.add(a);
  };
  for (const event of ['deploy', 'death']) S.on(event, refresh);
  S.every(0.1, refresh);
  refresh();
}

export function installColumbiaItem(battle, u, key, S) {
  if (!isMember(battle, u, COLUMBIA_BOND)) return;
  const { base, normal: v } = columbiaTechItem(key);
  const multiplier = () => equipmentMultiplier(battle, u);
  const enabled = () => columbiaSpecialActive(battle, u);

  if (key === 'pioneer') {
    S.stat('base', { atkFlat: base.atkFlat });
    aroundAura(battle, u, S, { atkFlat: base.aroundAtk });
    let attacks = 0;
    const scales = new Map();
    const attackScale = () => 1 + (Math.min(v.cap, v.atkScale + Math.floor(attacks / 3) * v.perThree) - 1) * multiplier();
    S.on('attackStart', c => {
      if (c.attacker !== u || !enabled() || !c.targets.some(t => t.side === 'enemy')) return;
      attacks++;
      scales.set(c.attackId, attackScale());
    });
    S.on('hit', c => {
      if (c.source !== u || !enabled() || !c.dmg.isAttack || c.dmg.type === 'element' || proc(c.dmg)) return;
      c.dmg.mul *= scales.get(c.dmg.attackId) ?? attackScale();
    });
  } else if (key === 'mapland') {
    S.stat('base', { aspd: base.aspd, atkFlat: base.atkFlat });
    S.on('damaged', c => {
      if (c.source !== u || !enabled() || c.target.side !== 'enemy' || c.type === 'element' || proc(c.dmg)) return;
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
    S.stat('base', { hpFlat: base.hp, blockCnt: base.block });
    aroundAura(battle, u, S, { hpFlat: base.aroundHp }, N8);
    let value = -1;
    const resists = () => {
      const amount = enabled() ? u.s.maxHp * v.resRatio * multiplier() : 0;
      if (amount === value) return;
      value = amount;
      S.stat('resists', { defFlat: amount, resFlat: Math.min(COLUMBIA_RES_CAP, amount) }, { equipmentScale: false });
    };
    for (const event of ['deploy', 'death', 'layerGain']) S.on(event, resists);
    S.every(0.1, resists);
    resists();
  } else if (key === 'graymatter') {
    S.stat('base', { atkPct: base.atkPct });
    let damage = 0, stacks = 0, value = -1, growth = -1;
    const refresh = () => {
      const amount = onField(u) ? alliesAround(battle, u).filter(a => isOp(a) && onField(a)).reduce((sum, a) => sum + unborrowedAttack(a), 0) * base.aroundAtkRatio : 0;
      if (amount !== value) {
        value = amount;
        S.stat('borrow', { atkFinal: amount }, { tags: [BORROW] });
      }
      const next = enabled() ? stacks * v.perThousand : 0;
      if (next !== growth) { growth = next; S.stat('growth', { atkPct: next }); }
    };
    for (const event of ['deploy', 'death', 'layerGain', 'skillStart', 'skillEnd']) S.on(event, refresh);
    S.every(0.1, refresh);
    S.on('damaged', c => {
      if (c.source !== u || !enabled() || c.target.side !== 'enemy' || c.type === 'element' || proc(c.dmg)) return;
      const amount = c.dealt ?? c.amount;
      if (!(amount > 0)) return;
      damage += amount;
      stacks = Math.min(v.maxStacks, Math.floor(damage / 1000));
      refresh();
      if (c.dmg.isAttack && c.target.alive && c.target.hp > 0) battle.dealDamage(u, c.target,
        { type: 'element', element: 'neural', amount: amount * v.necrosis * multiplier(), tags: ['item', 'columbia:graymatter'] });
    });
    refresh();
  } else if (key === 'dover') {
    S.stat('base', { healingDealtMul: 1 + base.healUp });
    S.stat('targets', { healTargets: base.healTargets }, { equipmentScale: false });
    S.on('healed', c => {
      if (c.source !== u || !enabled() || c.opts.regen || c.opts.columbiaDover) return;
      for (const a of alliesAround(battle, u)) if (isOp(a) && a.skill) a.skill.gainSp(v.selfAroundSp * multiplier(), 'item');
      for (const a of alliesAround(battle, c.target)) if (isOp(a)) {
        battle.heal(u, a, c.amount * v.targetAroundHeal * multiplier(), { fixedHeal: true, columbiaDover: true });
      }
    });
  } else if (key === 'antigrav') {
    S.stat('base', { skillDurationPct: base.skillDurationPct, spRecoveryFlat: base.spRegen });
    const affected = new Set();
    const aura = () => {
      const now = new Set();
      if (enabled() && u.skill?.active) for (const a of battle.allyUnits) {
        if (!isOp(a) || a.ownerId !== u.ownerId || !onField(a) || !inRange(u, a)) continue;
        now.add(a);
        if (!affected.has(a)) S.buff(a, { key: S.key('aura'), mods: { aspd: v.atkSpeed, spRecoveryFlat: v.spRegen } });
      }
      for (const a of affected) if (!now.has(a)) battle.removeBuff(a, S.key('aura'));
      affected.clear();
      for (const a of now) affected.add(a);
    };
    for (const event of ['skillStart', 'skillEnd', 'deploy', 'death']) S.on(event, aura);
    S.every(0.1, aura);
    aura();
  }
}
