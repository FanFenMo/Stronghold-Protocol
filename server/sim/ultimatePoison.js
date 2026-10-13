// n3: one tile per enemy death; each layer lasts three seconds and ticks once per second.
export function installUltimatePoison(battle) {
  if (!battle.ultimate.poison) return;
  const pools = new Map();
  battle.on('death', ({ unit, reason }) => {
    if (unit.side !== 'enemy' || reason !== 'killed') return;
    const r = Math.round(unit.y), c = Math.round(unit.x);
    if (!battle.grid.inRect(r, c)) return;
    const key = `${r}:${c}`;
    const layers = pools.get(key) || [];
    if (layers.length >= 3) return;
    const layer = { ticks: 0 };
    layers.push(layer);
    pools.set(key, layers);
    battle.fx('ultimatePoison', { x: c, y: r, dur: 3, key: `ultimatePoison:${key}` });
    const timer = battle.every(1, () => {
      for (const u of battle.allyUnits) {
        if (u.kind === 'op' && u.alive && u.deployed && Math.round(u.y) === r && Math.round(u.x) === c) {
          battle.dealDamage(null, u, { amount: 100, type: 'arts', noSp: true, tags: ['ultimatePoison'] });
        }
      }
      if (++layer.ticks === 3) {
        timer.cancel();
        layers.splice(layers.indexOf(layer), 1);
        if (!layers.length) pools.delete(key);
      }
    });
  });
}
