// 繁盛的共用数值与格子范围，供数据生成、战斗和界面使用。
export const PROSPERITY_BOND = 'prosperityShip';
export const PROSPERITY_LAYER_CAP = 200;
export const PROSPERITY_ORB_TAG = 'bond:prosperity:orb';
export const prosperityHealBonus = (layers) => 0.2 + Math.floor(Math.min(PROSPERITY_LAYER_CAP, Math.max(0, layers)) / 50) * 0.1;
export const prosperityBlastGrid = (layers) => layers >= 40
  ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]]
  : [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
