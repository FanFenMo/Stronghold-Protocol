import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { atPotential } from '../../shared/potential.js';
import { statusKey } from '../../shared/standIn.js';
import { DataSource } from '../../server/sim/simdata.js';

const data = getData({ log: { warn() {}, error() {}, info() {} } });
const gd = new GameData(data, 'mode_single_funny');
const ds = new DataSource(data);

test('73 external operators: every form, skill, module and potential uses the upstream operator and summon stats', () => {
  const roster = Object.values(data.chess).filter(c => c.supportOperator);
  assert.equal(new Set(roster.map(c => c.charId)).size, 73);
  assert.equal(roster.length, 292);
  let summons = 0;
  for (const c of roster) for (const potential of [1, 6]) {
    for (const sk of c.skills) for (const moduleId of [null, ...(c.modules || []).map(m => m.uniEquipId)]) {
      const lo = { skillIndex: sk.index, moduleId: moduleId ?? 'none', potential };
      const actual = ds.getChess(c.chessId, lo);
      const slot = `chess_char_${c.tier}_diy1_${c.isGolden ? 'b' : 'a'}`;
      const pick = { charId: c.charId, skillIndex: sk.index, uniEquipId: moduleId };
      const original = ds.getDiy(slot, pick, potential);
      const label = `${c.chessId} S${sk.index + 1} ${moduleId ?? 'none'} P${potential}`;
      assert.deepEqual(actual.stats, original.stats, label);
      assert.deepEqual(actual.rangeGrid, original.rangeGrid, label);
      assert.equal(actual.skill.id, original.skill.id, label);
      for (const tokenId of c.tokens) {
        const token = ds.getToken(tokenId, c.chessId, lo);
        const canonical = ds.getDiyToken(tokenId, slot, pick, potential);
        assert.deepEqual(token.stats, canonical.stats, `${label} ${tokenId}`);
        assert.deepEqual(token.sources, canonical.sources, `${label} ${tokenId}: sources`);
        summons++;
      }
      const hand = gd.placeableTokens(c.chessId, lo);
      for (const item of hand) {
        const raw = ds.rawToken(item.tokenId).variants[c.chessId];
        const token = ds.getToken(item.tokenId, c.chessId, lo);
        assert.ok(token.sources.some(s => s === 'skill' || s === 'talent'), `${label}: hand summon source`);
        let form = atPotential(data.backups.tokens[item.tokenId].variants[`${c.charId}@${statusKey(c.status)}`], potential);
        if(form.bySkill?.[sk.index]) form={...form,...form.bySkill[sk.index]};
        if(moduleId && form.byModule?.[moduleId]) form={...form,...form.byModule[moduleId]};
        assert.equal(item.count, Math.min(form.stats.deployLimit, 9), `${label}: hand count`);
        assert.ok(raw, label);
      }
    }
  }
  assert.ok(summons > 500);
});
