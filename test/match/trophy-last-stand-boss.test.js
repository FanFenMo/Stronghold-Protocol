import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';

for (const clientCombat of [false, true]) {
  for (const cause of ['overtime', 'leak', 'lpLoss']) {
    test(`名刀跳过中间BOSS，保留1点共享生命进入R13（client=${clientCombat}, ${cause}）`, () => {
      const h = makeMatch({ mode: 'coop', difficulty: 'ABYSS', ultimateLevel: 12, humans: 3,
        fake: true, clientCombat, instant: false, seed: 307, script: b => b.round === 12 ? {
          bossDps: 0,
          leakEvents: cause === 'leak' ? [{ at: 5, lpr: 999 }, { at: 5, lpr: 999 }] : [],
          lpLossEvents: cause === 'lpLoss' ? [{ at: 5, amount: 999 }, { at: 5, amount: 999 }] : [],
        } : { bossDps: 1e9 } }).start();
      try {
        h.toPrep(12);
        const owner = h.ps('p_0'), spare = h.ps('p_1');
        for (const ps of h.m.alivePlayers()) ps.lp = 1;
        owner.trophyShop.counts.last_stand = spare.trophyShop.counts.last_stand = 1;
        assert.ok(h.drive(() => h.m.round === 13 && h.m.phase === PHASE.PREP));
        assert.equal(owner.trophyShop.lastStandUsed, true);
        assert.equal(spare.trophyShop.lastStandUsed, false, 'only one purchase is consumed for the shared pool');
        assert.equal(h.m.alivePlayers().reduce((sum, ps) => sum + ps.lp, 0), 1);
        assert.equal(owner.lp, 1);
        assert.equal(h.m.teamLp, null);
        assert.equal(h.m.bossPool, null);
        assert.equal(h.m.hiddenReached, false);
        assert.equal(h.m.ended, false);
        assert.equal(owner.stats.bossDamage, 0, 'skipping does not fabricate damage credit');
        assert.equal(h.m.errorCount, 0);
      } finally { h.m.dispose(); }
    });
  }

  for (const hidden of [false, true]) {
    test(`最终BOSS与隐藏核心不触发或消耗名刀（client=${clientCombat}, hidden=${hidden}）`, () => {
      const h = makeMatch({ mode: 'coop', difficulty: 'ABYSS', ultimateLevel: 12, humans: 1,
        fake: true, clientCombat, instant: false, seed: 308, script: b => ({
          bossDps: b.round === (hidden ? 21 : 20) ? 0 : 1e9,
        }) }).start();
      try {
        h.toPrep(20);
        const ps = h.ps('p_0');
        if (hidden) {
          ps.bondCountBonus.yanShip = 3;
          ps.layers.yanShip = 1201;
          ps.recompute();
          h.toPrep(21);
        }
        ps.lp = 1;
        ps.trophyShop.counts.last_stand = 1;
        const phase = hidden ? PHASE.HIDDEN_CORE : PHASE.FINAL_ASSAULT;
        assert.ok(h.drive(() => h.m.phase === phase));
        const result = h.runToEnd();
        assert.equal(ps.trophyShop.lastStandUsed, false);
        assert.equal(h.m.teamLp, 0);
        assert.equal(result.victory, hidden);
        assert.equal(result.hiddenCleared, false);
        assert.equal(h.m.errorCount, 0);
      } finally { h.m.dispose(); }
    });
  }
}
