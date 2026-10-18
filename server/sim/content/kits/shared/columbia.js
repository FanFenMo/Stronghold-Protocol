import { num, talentBb, up } from './tier1.js';

// 星源、星极的在场时间天赋：每次部署重新累计，离场即移除。
export function installTimeAspd(battle, unit, chess, key) {
  const t = talentBb(chess, 0);
  let last = -1;
  const refresh = () => {
    const n = up(unit) ? Math.min(num(t.max_stack_cnt), Math.floor((battle.time - unit.deployedAt + 1e-9) / num(t.interval, 1))) : 0;
    if (n === last) return;
    last = n;
    if (n) battle.addBuff(unit, { key, mods: { aspd: num(t.attack_speed) * n }, tags: ['talent'] });
    else battle.removeBuff(unit, key);
  };
  battle.on('tick', refresh, { owner: unit });
  battle.on('deploy', c => { if (c.unit === unit) { last = -1; refresh(); } }, { owner: unit });
}
