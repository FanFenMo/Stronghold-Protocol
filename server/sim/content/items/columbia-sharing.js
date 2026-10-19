import { COLUMBIA_BOND, COLUMBIA_SHARE_RATIO, COLUMBIA_SOLVENT_DRAIN } from '../../../../shared/columbia.js';
import { bondActive, isOp, onField, isMember, itemRecord, itemsOf, itemKeyOf, buffsOf, passiveBuff, unitBonds, baseChessId } from '../support/index.js';
import { equipmentMultiplier, equipmentScopes, SHARED_ITEMS, sharedEquipmentState } from './columbia-policy.js';
import { periodicDamage } from '../../damage.js';
import { hypot } from '../../detmath.js';

const KEY = 'bond:columbiaShip:equipmentShare';
const STATS = new Set(['atkPct', 'hpPct', 'defPct', 'atkFlat', 'hpFlat', 'defFlat', 'resFlat', 'aspd', 'spRecoveryFlat']);
const empty = () => ({ members: [], mods: {}, distance: 0, heal: 0, palsy: 0, cold: 0, deploySp: 0, solvent: false });
const roll = (b, probability) => probability > 0 && (probability >= 1 || b.rng() < probability);

export function installColumbiaSharing(battle, runtime) {
  if (!battle.allyUnits.some(u => isOp(u) && isMember(battle, u, COLUMBIA_BOND))) return;
  const scopes = equipmentScopes(battle), states = sharedEquipmentState(battle);
  const refresh = () => {
    for (const scope of scopes) scope.refreshMods();
    const next = new Map();
    for (const p of battle.players) {
      if (!bondActive(battle, p.playerId, COLUMBIA_BOND, 2)) continue;
      const members = battle.allyUnits.filter(u => isOp(u) && u.ownerId === p.playerId && onField(u) && isMember(battle, u, COLUMBIA_BOND));
      if (new Set(members.map(baseChessId)).size < 6) continue;
      const pool = empty(); pool.members = members;
      const add = (key, value) => { pool.mods[key] = (pool.mods[key] ?? 0) + value; };
      for (const source of members) {
        const multiplier = equipmentMultiplier(battle, source);
        for (const grant of runtime.grants.get(source)?.values() ?? []) {
          if (grant.lent || !SHARED_ITEMS.has(grant.key)) continue;
          const rec = itemRecord(grant.id), params = rec.params;
          const ratio = COLUMBIA_SHARE_RATIO * (grant.key === 'chess_item_4_03_e' ? 0.5 : 1);
          for (const { target, key } of grant.scope.modRecords) {
            if (target !== source) continue;
            const buff = source.findBuff(key);
            if (!buff) continue;
            for (const [stat, value] of Object.entries(buff.mods ?? {})) {
              if (STATS.has(stat) && value > 0) add(stat, value * (buff.stacks ?? 1) * ratio);
            }
          }
          // 加速重锤的攻速由共用重锤运行时安装，不属于这一件装备的普通属性作用域。
          if (grant.key === 'chess_item_3_10_e') {
            const special = buffsOf(rec).find(b => b.p.big_hammer != null);
            add('aspd', special.p.attack_speed * multiplier * ratio);
          }
          switch (grant.key) {
            case 'chess_item_1_05_e': pool.solvent = true; break;
            case 'chess_item_3_02_e': pool.distance += (params.damage_scale - 1) * multiplier * ratio; break;
            case 'chess_item_3_05_e': {
              const mine = unitBonds(source);
              const others = battle.allyUnits.filter(a => a !== source && a.ownerId === source.ownerId && isOp(a) && onField(a) && unitBonds(a).some(b => mine.includes(b))).length;
              pool.deploySp += params.sp_each_person * (1 + others) * multiplier * ratio;
              break;
            }
            case 'chess_item_3_07_e': add('aspd', -10); break;
            case 'chess_item_4_06_e': pool.heal += params.hp_ratio * multiplier * ratio; break;
            case 'chess_item_5_01_e': pool.palsy += params.prob * multiplier * ratio; break;
            case 'chess_item_5_02_e': pool.cold += params.prob * multiplier * ratio; break;
          }
        }
      }
      next.set(p.playerId, pool);
    }
    for (const u of battle.allyUnits) {
      const pool = next.get(u.ownerId);
      if (pool?.members.includes(u) && Object.keys(pool.mods).length) {
        const before = u.findBuff(KEY)?.mods;
        if (JSON.stringify(before) !== JSON.stringify(pool.mods)) passiveBuff(battle, u, KEY, pool.mods);
      } else if (u.findBuff(KEY)) battle.removeBuff(u, KEY);
    }
    states.clear();
    for (const [pid, pool] of next) states.set(pid, pool);
  };
  const forUnit = u => {
    const pool = u && states.get(u.ownerId);
    return pool?.members.includes(u) && onField(u) ? pool : null;
  };
  for (const event of ['deploy', 'death', 'layerGain', 'attack', 'skillStart']) battle.on(event, refresh, { priority: -100 });
  battle.every(0.1, refresh);
  battle.on('battleStart', () => {
    refresh();
    for (const pool of states.values()) for (const u of pool.members) if (pool.deploySp && u.skill) u.skill.gainSp(pool.deploySp, 'item');
  });
  battle.on('deploy', c => {
    if (c.initial) return;
    const pool = forUnit(c.unit);
    if (pool?.deploySp && c.unit.skill) c.unit.skill.gainSp(pool.deploySp, 'item');
  }, { priority: -110 });
  battle.on('hit', c => {
    const pool = forUnit(c.source);
    if (pool && c.target?.side === 'enemy' && c.dmg.type !== 'element' && hypot(c.target.x - c.source.x, c.target.y - c.source.y) >= 3) c.dmg.mul *= 1 + pool.distance;
  });
  battle.on('attack', c => {
    const pool = forUnit(c.attacker);
    if (!pool) return;
    for (const target of c.targets ?? []) {
      if (target.side !== 'enemy') continue;
      if (pool.heal) battle.heal(c.attacker, c.attacker, c.attacker.s.maxHp * pool.heal, { self: true });
      if (roll(battle, pool.palsy)) battle.applyStatus(target, 'palsy', { value: 1, source: c.attacker });
      if (roll(battle, pool.cold)) battle.applyStatus(target, 'cold', { duration: 1.5, source: c.attacker });
    }
  });
  battle.every(1, () => {
    refresh();
    for (const pool of states.values()) if (pool.solvent) for (const u of pool.members) battle.dealDamage(null, u, periodicDamage(COLUMBIA_SOLVENT_DRAIN));
  });
  refresh();
}
