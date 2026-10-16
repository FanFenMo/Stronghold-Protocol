// server/sim/content/bonds/columbia.js — 哥伦比亚盟约的战斗侧实现（DESIGN §7 同层；本 fork 新增）。
//
// 本模块负责 (6) 档的"所有佩戴科技装备的干员获得50攻速"，并对外暴露"某玩家当前是否处于过载"，
// 供六件科技装备的效果实现读取（装备效果见 docs/COLUMBIA.md 的待办，尚未实现）。
//
// 与 prosperity.js 相同的约定：
//   * install(battle) 只在战斗开始时跑一次；
//   * 数值全部来自 shared/columbia.js，本文件不写死常数；
//   * 只走 support/index.js 的公开辅助与 Battle 的公开 API。

import { COLUMBIA_BOND as ID, COLUMBIA_OVERLOAD_ATK_SPEED, columbiaOverloaded } from '../../../../shared/columbia.js';
import { bondTier, isMember, playerOps, passiveBuff, itemsOf } from '../support/index.js';

/** 六件科技装备的 id 前缀（tools/columbia-data.mjs 的 columbiaTechItemId 生成规则）。 */
const TECH_ITEM_RE = /^chess_item_custom_columbia_/;

/** 单位身上是否有哥伦比亚科技装备。 */
export const wearsTechItem = (u) => itemsOf(u).some((id) => TECH_ITEM_RE.test(String(id)));

/** 该玩家当前是否处于过载（(6) 档）。装备效果用它选择普通值还是过载值。 */
export const columbiaOverloadActive = (battle, pid) => columbiaOverloaded(bondTier(battle, pid, ID));

export function install(battle) {
  // 只有 (6) 档才有效果：收集满足条件的玩家及其哥伦比亚成员。
  const states = new Map();
  for (const p of battle.players) {
    if (!columbiaOverloaded(bondTier(battle, p.playerId, ID))) continue;
    states.set(p.playerId, playerOps(battle, p.playerId).filter((u) => isMember(battle, u, ID)));
  }
  if (!states.size) return;

  const apply = (pid) => {
    for (const u of states.get(pid)) {
      // 装备一旦配发就锁定在干员身上，所以这里只需要在开战时按"是否佩戴科技装备"给一次。
      // 未佩戴的成员给一个 0 值的同名 buff，避免同一干员在两次战斗之间残留上一场的 50 攻速。
      passiveBuff(battle, u, `bond:${ID}:overload`, { aspd: wearsTechItem(u) ? COLUMBIA_OVERLOAD_ATK_SPEED : 0 });
    }
  };
  for (const pid of states.keys()) apply(pid);

  // 战斗中部署的新成员（再部署、召唤物本体不适用）也要拿到这个 buff。
  battle.on('deploy', ({ unit }) => {
    if (unit && states.has(unit.ownerId)) apply(unit.ownerId);
  });
}
