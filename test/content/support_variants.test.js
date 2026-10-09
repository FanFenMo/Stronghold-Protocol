import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const records = Object.values(getData().chess).filter(c => c.supportOperator
  && (!process.env.SP_SUPPORT_CHAR || c.charId === process.env.SP_SUPPORT_CHAR));
for (const rec of records) for (let skillIndex = 0; skillIndex < 3; skillIndex++)
  test(`${rec.name} tier ${rec.tier} ${rec.isGolden ? 'elite' : 'normal'} S${skillIndex + 1}: real kit fights`, () => {
    const h = makeBattle({ units: [{ chessId: rec.chessId, row: 10, col: 4, skillIndex }],
      defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e7, def: 0, res: 0, speed: 0 }) } },
      enemies: [{ key: 'e', pos: [10, 5] }], autoFinish: false, timeLimit: 100, captureNoisy: true });
    h.step();
    const u = h.unit(rec.chessId);
    u.skill.rule = 'NEVER';
    if (!u.skill.active) { u.skill.addCharge(1); assert.ok(u.skill.activate('test')); }
    h.run(20);
    assert.equal(u.kit.skillSource, 'skills');
    assert.ok(u.stats.dmg > 0);
    assert.deepEqual(h.b.errors, []);
    assert.equal(h.invariants(), true);
  });
