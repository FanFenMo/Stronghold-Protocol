import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves, buildNormalWave, buildBossWave } from '../../server/match/waves.js';
import { bossPoolHp } from '../../server/match/finalAssault.js';
import { createRng } from '../../server/sim/rng.js';
import { Lobby, Room } from '../../server/lobby.js';
import { validateC2S } from '../../shared/protocol.js';
import { ERR, PHASE } from '../../shared/constants.js';
import { DATA, makeMatch } from './harness.js';

test('legacy rooms default to n0; only integer n0–n16 is accepted on the wire', () => {
  assert.equal(validateC2S({ t: 'room.create', mode: 'solo', difficulty: 'ABYSS' }), null);
  for (const n of [0, 8, 9, 16]) {
    assert.equal(validateC2S({ t: 'room.setDifficulty', difficulty: 'ABYSS', ultimateLevel: n }), null);
  }
  for (const n of [-1, 17, 1.5, '8', null]) {
    assert.ok(validateC2S({ t: 'room.setDifficulty', difficulty: 'ABYSS', ultimateLevel: n }));
  }
});

test('n0 keeps the original schedule, numeric scales, economy and shared boss pool', () => {
  for (const mode of ['mode_single_abyss', 'mode_multi_abyss']) {
    const legacy = new GameData(DATA, mode), n0 = new GameData(DATA, mode, 0);
    assert.equal(n0.bossRound, 14);
    assert.equal(n0.hiddenRound, 15);
    assert.deepEqual(setupMatchWaves(legacy, createRng(42)), setupMatchWaves(n0, createRng(42)));
    for (let r = 1; r <= 15; r++) {
      assert.deepEqual(n0.roundCfg(r), DATA.config.modes[mode].rounds[String(r)]);
      assert.deepEqual(n0.enemyScale(r), legacy.enemyScale(r));
      assert.equal(n0.income(r), legacy.income(r));
    }
    for (const id of ['boss_1', 'boss_8']) assert.equal(bossPoolHp(n0, id), bossPoolHp(legacy, id));
  }
});

test('n6 inserts exactly one round per chosen faction and moves leader templates to R17/R18', () => {
  for (const mode of ['mode_single_abyss', 'mode_multi_abyss']) {
    const base = new GameData(DATA, mode, 0), gd = new GameData(DATA, mode, 6);
    assert.equal(gd.lastRound, 17);
    assert.equal(gd.bossRound, 17);
    assert.equal(gd.hiddenRound, 18);
    assert.deepEqual(gd.roundCfg(17), base.roundCfg(14));
    assert.deepEqual(gd.roundCfg(18), base.roundCfg(15));
    for (const seed of [1, 7, 42]) {
      const original = setupMatchWaves(base, createRng(seed));
      const added = setupMatchWaves(gd, createRng(seed));
      assert.equal(added.stageId, original.stageId);
      assert.equal(added.bossId, original.bossId);
      assert.deepEqual(added.factions, original.factions);
      assert.deepEqual(added.picks.slice(1, 14), original.picks.slice(1, 14));
      assert.deepEqual(added.typeSlots.slice(13, 16).sort(), [...added.factions].sort());
      assert.equal(added.picks[17].key, original.picks[14].key);
      assert.equal(added.picks[18].key, original.picks[15].key);
      for (let r = 14; r <= 16; r++) {
        const wave = buildNormalWave(gd, createRng(seed), added, r);
        assert.ok(wave.spawns.length > 0, `R${r} contains enemies`);
        assert.ok(added.factions.includes(wave.pick.type));
        assert.ok(gd.enemyScale(r).hpMul > gd.enemyScale(r - 1).hpMul);
        assert.ok(gd.enemyScale(r).atkMul > gd.enemyScale(r - 1).atkMul);
        assert.ok(Math.abs(gd.enemyScale(r).hpMul / base.enemyScale(13).hpMul - 1.2 ** (r - 13)) < 1e-8);
        assert.ok(Math.abs(gd.enemyScale(r).atkMul / base.enemyScale(13).atkMul - 1.1 ** (r - 13)) < 1e-8);
      }
      const leader = buildBossWave(gd, createRng(seed), added, 17, { bossId: added.bossId, solo: gd.isSolo });
      const hidden = buildBossWave(gd, createRng(seed), added, 18, { bossId: added.hiddenBossId, solo: gd.isSolo });
      assert.ok(leader.spawns.some((s) => s.tag === 'boss'));
      assert.ok(hidden.spawns.some((s) => s.tag === 'boss'));
    }
  }
});

test('n7 scales both shared leaders by n2 × n7 once; n8 deducts only base income from R5', () => {
  for (const mode of ['mode_single_abyss', 'mode_multi_abyss']) {
    const base = new GameData(DATA, mode, 0), n2 = new GameData(DATA, mode, 2);
    const n7 = new GameData(DATA, mode, 7), n8 = new GameData(DATA, mode, 8);
    for (const id of ['boss_1', 'boss_8']) {
      assert.equal(bossPoolHp(n2, id), Math.round(bossPoolHp(base, id) * 1.15));
      assert.equal(bossPoolHp(n7, id), Math.round(bossPoolHp(base, id) * 1.15 * 1.2));
      assert.equal(n7.bossPoolHp(id), bossPoolHp(n7, id));
    }
    for (let r = 1; r <= 18; r++) assert.equal(n8.income(r), Math.max(0, base.income(r) - (r >= 5 ? 1 : 0)));
  }
  const normal = new GameData(DATA, 'mode_multi_normal', 8);
  assert.equal(normal.ultimateLevel, 0);
  assert.equal(normal.bossRound, 14);
});

test('room level changes synchronize and cancel ready; n9–n16 cannot start', () => {
  const room = new Room('TEST', 'coop', 'ABYSS', 0);
  room.hostId = 'host';
  room.seats[0] = { seat: 0, playerId: 'host', name: 'Host', isBot: false, connected: true, ready: false };
  room.seats[1] = { seat: 1, playerId: 'guest', name: 'Guest', isBot: false, connected: true, ready: true };
  const lobby = new Lobby({ registry: {} });
  lobby.roomOf = () => room;
  const states = [];
  lobby.broadcastState = (r) => states.push(r.toState());
  lobby.setDifficulty({ playerId: 'host' }, { difficulty: 'ABYSS', ultimateLevel: 8 });
  assert.equal(room.seats[1].ready, false);
  assert.equal(states.at(-1).ultimateLevel, 8);
  assert.equal(lobby.setDifficulty({ playerId: 'guest' }, { difficulty: 'ABYSS', ultimateLevel: 0 }).error, ERR.NOT_HOST);
  for (let n = 9; n <= 16; n++) {
    lobby.setDifficulty({ playerId: 'host' }, { difficulty: 'ABYSS', ultimateLevel: n });
    assert.equal(lobby.start({ playerId: 'host' }).error, ERR.BAD_MSG);
  }
  lobby.setDifficulty({ playerId: 'host' }, { difficulty: 'NORMAL' });
  assert.equal(room.ultimateLevel, 0);
});

test('n6 match flow reaches ordinary R14–16, leader R17 and eligible hidden R18', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'ABYSS', ultimateLevel: 6, humans: 2, fake: true,
    script: () => ({ bossDps: 1e9 }) });
  h.start();
  for (let r = 14; r <= 16; r++) {
    assert.ok(h.drive(() => h.m.phase === PHASE.PREP && h.m.round === r));
    assert.ok(h.m.wave.spawns.length > 0);
    assert.equal(h.m.publicView().ultimateLevel, 6);
  }
  assert.ok(h.drive(() => h.m.phase === PHASE.PREP && h.m.round === 17));
  for (const ps of h.m.players.values()) { ps.bondCountBonus.yanShip = 3; ps.layers.yanShip = 601; ps.recompute(); }
  assert.ok(h.drive(() => h.m.phase === PHASE.PREP && h.m.round === 18));
  assert.ok(h.drive(() => h.ended != null));
  const result = h.m.lastResultMsg;
  assert.equal(result.hiddenCleared, true);
  assert.equal(result.ultimateLevel, 6);
  assert.equal(result.lastRound, 17);
  assert.equal(result.roundsPassed, 18);
  h.m.dispose();
});
