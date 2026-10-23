import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResult } from '../../server/match/results.js';
import { ProfileStore } from '../../server/profiles.js';
import { trophyProduct } from '../../shared/trophyShop.js';
import { makeMatch } from './harness.js';

const tiers = [
  { levels: [1, 2, 3, 4, 5], rounds: [[0, 4, 0], [5, 8, 1], [9, 11, 2], [12, 13, 4], [14, 14, 7]], hidden: 9 },
  { levels: [6, 7], rounds: [[0, 4, 0], [5, 8, 1], [9, 11, 3], [12, 13, 5], [14, 16, 8], [17, 17, 10]], hidden: 11 },
  { levels: [8, 9, 10, 11], rounds: [[0, 4, 0], [5, 8, 2], [9, 11, 4], [12, 13, 6], [14, 16, 9], [17, 17, 11]], hidden: 12 },
  { levels: [12, 13, 14, 15], rounds: [[0, 4, 0], [5, 8, 2], [9, 11, 4], [12, 13, 7], [14, 16, 10], [17, 19, 12], [20, 20, 14]], hidden: 15 },
  { levels: [16], rounds: [[0, 4, 0], [5, 8, 3], [9, 11, 5], [12, 13, 8], [14, 16, 12], [17, 19, 15], [20, 20, 18]], hidden: 20 },
];

function resultAfter(m, roundsPassed, hiddenCleared = false, hiddenReached = hiddenCleared) {
  const victory = roundsPassed >= m.gd.bossRound;
  m.round = hiddenReached ? m.gd.hiddenRound : victory ? m.gd.bossRound : roundsPassed + 1;
  return buildResult(m, { victory, hiddenReached, hiddenCleared, reason: victory ? 'victory' : 'defeat' });
}

for (const tier of tiers) {
  test(`N${tier.levels[0]}～N${tier.levels.at(-1)} 各回合基础奖杯、最终 BOSS 和隐藏核心取值`, () => {
    for (const ultimateLevel of tier.levels) {
      const h = makeMatch({ difficulty: 'ABYSS', ultimateLevel, fake: true }).start();
      try {
        const m = h.m;
        assert.equal(m.gd.bossRound, tier.rounds.at(-1)[1]);
        assert.equal(m.gd.hiddenRound, m.gd.bossRound + 1);
        for (const [from, to, expected] of tier.rounds) {
          for (let passed = from; passed <= to; passed++) {
            const row = resultAfter(m, passed).players[0];
            assert.equal(row.roundsPassed, passed);
            assert.equal(row.trophies, expected, `N${ultimateLevel} 通过 ${passed} 回合`);
          }
        }
        const hiddenLoss = resultAfter(m, m.gd.bossRound, false, true).players[0];
        assert.equal(hiddenLoss.trophies, tier.rounds.at(-1)[2], '隐藏失败保留最终 BOSS 档奖励');
        const hiddenWin = resultAfter(m, m.gd.hiddenRound, true).players[0];
        assert.equal(hiddenWin.roundsPassed, m.gd.hiddenRound);
        assert.equal(hiddenWin.trophies, tier.hidden, '隐藏奖励替代普通档奖励');
      } finally { h.m.dispose(); }
    }
  });
}

test('N0 及其他难度沿用旧表，其他难度不会因传入 N16 而使用新表', () => {
  const cases = [
    { difficulty: 'FUNNY', ultimateLevel: 16, values: [0, 1, 2, 2, 3] },
    { difficulty: 'NORMAL', ultimateLevel: 16, values: [0, 1, 2, 3, 4], hidden: 5 },
    { difficulty: 'HARD', ultimateLevel: 16, values: [0, 1, 2, 3, 5], hidden: 7 },
    { difficulty: 'ABYSS', ultimateLevel: 0, values: [0, 1, 2, 3, 6], hidden: 8 },
  ];
  for (const c of cases) {
    const h = makeMatch({ ...c, fake: true }).start();
    try {
      assert.equal(h.m.ultimateLevel, 0);
      for (const [i, passed] of [4, 8, 11, 13, 14].entries()) {
        assert.equal(resultAfter(h.m, passed).players[0].trophies, c.values[i], `${c.difficulty} R${passed}`);
      }
      if (c.hidden != null) assert.equal(resultAfter(h.m, 15, true).players[0].trophies, c.hidden);
    } finally { h.m.dispose(); }
  }
});

test('N6 提前淘汰玩家按个人通过回合取奖杯，队友通关隐藏不会补发隐藏奖励', () => {
  const h = makeMatch({ difficulty: 'ABYSS', ultimateLevel: 6, humans: 2, fake: true }).start();
  try {
    const eliminated = h.ps('p_1');
    eliminated.lp = 0;
    eliminated.eliminate(17);
    const result = resultAfter(h.m, 18, true);
    assert.deepEqual(result.players.map(p => [p.playerId, p.roundsPassed, p.trophies, p.victory]), [
      ['p_0', 18, 11, true], ['p_1', 16, 8, false],
    ]);
  } finally { h.m.dispose(); }
});

test('N12 中间 BOSS 失败按通过 11 回合结算，之后仍使用普通回合档', () => {
  const h = makeMatch({ difficulty: 'ABYSS', ultimateLevel: 12, fake: true }).start();
  try {
    assert.equal(h.m.gd.middleBossRound, 12);
    assert.equal(resultAfter(h.m, 11).players[0].trophies, 4);
    assert.equal(resultAfter(h.m, 12).players[0].trophies, 7);
    assert.equal(resultAfter(h.m, 19).players[0].trophies, 12);
    assert.equal(resultAfter(h.m, 20).players[0].trophies, 14);
  } finally { h.m.dispose(); }
});

test('各组新奖杯与商店奖励相加，个人通过 12 回合才获得额外奖杯', () => {
  for (const tier of tiers) {
    const h = makeMatch({ difficulty: 'ABYSS', ultimateLevel: tier.levels[0], humans: 2, fake: true }).start();
    try {
      const buyer = h.ps('p_0');
      for (const purchases of [0, 1, 10]) {
        buyer.trophyShop.counts.round12 = purchases;
        for (const [passed, base, bonus] of [[11, tier.rounds[2][2], 0], [12, tier.rounds[3][2], 2 * purchases]]) {
          const result = resultAfter(h.m, passed);
          assert.equal(result.players[0].trophies, base + bonus);
          assert.equal(result.players[1].trophies, base, '队友没有购买，不享受商店加成');
        }
      }
    } finally { h.m.dispose(); }
  }
});

test('单人模式 N0～N16 的基础奖杯仍为 0', () => {
  for (const ultimateLevel of [0, 1, 5, 6, 7, 8, 11, 12, 15, 16]) {
    const h = makeMatch({ mode: 'solo', difficulty: 'ABYSS', ultimateLevel, fake: true }).start();
    try {
      assert.equal(resultAfter(h.m, h.m.gd.bossRound).players[0].trophies, 0);
      assert.equal(resultAfter(h.m, h.m.gd.hiddenRound, true).players[0].trophies, 0);
    } finally { h.m.dispose(); }
  }
});

test('N16 新奖杯含商店加成写入钱包，消费不扣历史累计，重复结算不重复入账', () => {
  const store = new ProfileStore(':memory:');
  const h = makeMatch({ difficulty: 'ABYSS', ultimateLevel: 16, fake: true }).start();
  try {
    const { profileId } = store.create();
    const participants = { p_0: profileId };
    store.settleMatch({ matchId: 'previous', startedAt: 1, participants,
      summary: { players: [{ playerId: 'p_0', isBot: false, trophies: 10 }] } });
    for (let i = 0; i < 3; i++) {
      store.purchase({ profileId, requestId: `buy-${i}`, matchId: 'n16', playerId: 'p_0', product: trophyProduct('round12') });
    }
    assert.equal(store.wallet(profileId).balance, 17);
    assert.equal(store.wallet(profileId).lifetimeEarned, 10);
    h.ps('p_0').trophyShop.counts.round12 = 3;
    const summary = resultAfter(h.m, 21, true);
    assert.equal(summary.players[0].trophies, 26);
    const settlement = { matchId: 'n16', startedAt: 2, participants, summary };
    store.settleMatch(settlement);
    assert.equal(store.wallet(profileId).balance, 43);
    assert.equal(store.wallet(profileId).lifetimeEarned, 36);
    const wallet = store.wallet(profileId);
    assert.deepEqual(store.settleMatch(settlement), []);
    assert.deepEqual(store.wallet(profileId), wallet);
  } finally { h.m.dispose(); store.close(); }
});
