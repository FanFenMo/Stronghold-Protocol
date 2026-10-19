// 双星干员特性：装备复用可撤销的 item grant，范围复用 setExtraRange。
import { isOp, onField } from '../support/index.js';
import { installItem } from '../items/battle.js';
import { absoluteRangeKeys } from '../../targeting.js';

const ASTESI = 'char_274_astesi';
const HALOS = new Set(['char_135_halo', 'char_1047_halo2']);
const charId = u => u.def.charId;

export function installTwinStars(battle, units) {
  const stars = units.filter(u => isOp(u) && (charId(u) === ASTESI || HALOS.has(charId(u))));
  if (!stars.some(u => charId(u) === ASTESI) || !stars.some(u => HALOS.has(charId(u)))) return;
  const grants = new Map(), extended = new Map(), triggerKeys = new Map();
  for (const u of stars) u.skill?.addTriggerRange(() => [triggerKeys.get(u) ?? []]);
  const ownRange = u => {
    const tg = u.skill?.active ? u.skill.spec.targeting : null;
    const grid = tg?.rangeGrid ?? u.rangeGrid;
    const extend = (tg?.noRangeExtend ? 0 : u.s.rangeExtend) + (tg?.rangeExtend ?? 0);
    return absoluteRangeKeys(grid, u.tileR, u.tileC, u.dir, extend);
  };
  const refresh = () => {
    for (const u of stars) {
      const peers = onField(u) ? stars.filter(a => onField(a) && a.ownerId === u.ownerId && a !== u) : [];
      const active = (charId(u) === ASTESI ? peers.some(a => HALOS.has(charId(a))) : peers.some(a => charId(a) === ASTESI));
      const ids = new Set();
      if (active) for (const a of peers) for (const id of a.items) if (!u.items.includes(id)) ids.add(id);
      let mine = grants.get(u);
      if (!mine) { mine = new Map(); grants.set(u, mine); }
      for (const [id, grant] of mine) if (!ids.has(id)) { grant.dispose(); mine.delete(id); }
      for (const id of ids) if (!mine.has(id)) {
        const grant = installItem(battle, u, id, { lent: true, grantKey: `twin:${id}` });
        if (grant) mine.set(id, grant);
      }

      // 用自身当前范围判定相交，不能拿上次已延伸的范围继续递归扩大。
      const own = ownRange(u), ownSet = new Set(own), additions = new Set();
      if (active) for (const a of peers) {
        if ((charId(u) === ASTESI) === (charId(a) === ASTESI)) continue;
        const range = ownRange(a);
        if (range.some(k => ownSet.has(k))) for (const k of range) additions.add(k);
      }
      const previous = extended.get(u) ?? new Set();
      if (additions.size !== previous.size || [...additions].some(k => !previous.has(k))) {
        battle.setExtraRange(u, additions, 'garrison:twinStars');
      }
      extended.set(u, additions);
      triggerKeys.set(u, [...additions]);
    }
  };
  battle.on('deploy', refresh);
  battle.on('death', refresh);
  battle.on('skillStart', refresh, { priority: -50 });
  battle.on('skillEnd', refresh, { priority: -50 });
  battle.every(0.1, refresh);
}
