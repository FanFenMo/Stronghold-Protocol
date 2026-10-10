import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPERATOR_KITS } from '../../server/sim/content/kits/index.js';
import { getData } from '../../server/data.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const records = Object.values(getData().chess).filter(c => c.supportOperator
  && (!process.env.SP_SUPPORT_CHAR || c.charId === process.env.SP_SUPPORT_CHAR));
for (const rec of records) for (let skillIndex = 0; skillIndex < 3; skillIndex++)
  test(`${rec.name} tier ${rec.tier} ${rec.isGolden ? 'elite' : 'normal'} S${skillIndex + 1}: real kit fights`, () => {
    const h = makeBattle({ units: [{ chessId: rec.chessId, row: 10, col: 4, skillIndex }, {chessId: "ally", row:10, col:3 }],
      defs: { chess: { ally: { chessId: 'ally', stats: { maxHp: 1e7, atk: 0, def: 0, bat: 2, blockCnt: 0, cost: 0 }, rangeGrid: [[0,0]], skill: null } }, enemies: { e: enemyRec({ key: 'e', hp: 1e7, def: 0, res: 0, speed: 0 }) } },
      enemies: [4,5,6,7,8].map(col => ({ key: 'e', pos: [10, col] })), autoFinish: false, timeLimit: 100, captureNoisy: true });
    h.step();
    const ally = h.unit('ally');
    if (ally) ally.hp = 1;
    const u = h.unit(rec.chessId);
    u.skill.rule = 'NEVER';
    if (!u.skill.active && u.skill.kind !== 'passive') { u.skill.addCharge(1); u.skill.activate('test'); }
    if (u.skill.attackOverride()?.hitAllBlocked) {
      const target = h.enemies()[0];target.blockedBy = u;u.blocking.push(target);h.b.forceAttack(u,[target]);
    }
    h.run(20);
    assert.equal(typeof OPERATOR_KITS[rec.charId], 'function');
    assert.ok(u.skill && u.kit);
    if (rec.profession !== 'MEDIC' && !u.profile.noAttack && !u.profile.heal) assert.ok(u.stats.dmg > 0 || u.stats.heal > 0 || h.hooksOf("heal").some(c => c.source === u), "deals damage or heals an injured ally");
    assert.deepEqual(h.b.errors, []);
    assert.equal(h.invariants(), true);
  });
