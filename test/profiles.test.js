import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProfileStore } from '../server/profiles.js';
import { trophyProduct, TROPHY_SHOP_PRODUCTS } from '../shared/trophyShop.js';

const result = (profileId, matchId = 'match-1', trophies = 5) => ({ matchId, startedAt: 100,
  participants: { p1: profileId }, summary: { players: [{ playerId: 'p1', trophies, name: '玩家', isBot: false }] } });

test('奖杯档案在关闭和重新打开数据库后仍可通过原凭证恢复', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stronghold-profiles-'));
  const filename = path.join(directory, 'players.sqlite');
  let store = new ProfileStore(filename);
  try {
    const profile = store.create();
    store.settleMatch(result(profile.profileId));
    store.close();
    store = new ProfileStore(filename);
    const restored = store.resolve(profile.token);
    assert.equal(restored.profileId, profile.profileId);
    assert.equal(restored.lifetimeEarned, 5);
    assert.equal(restored.balance, 5);
    assert.equal(store.resolve('0'.repeat(64)), null);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('共享档案各真人席位分别入账，重放同一结算不会重复奖励', () => {
  const store = new ProfileStore(':memory:');
  try {
    const { profileId } = store.create();
    const record = result(profileId);
    record.participants.p2 = profileId;
    record.summary.players.push({ playerId: 'p2', trophies: 3 }, { playerId: 'bot', isBot: true, trophies: 99 });
    store.settleMatch(record);
    store.settleMatch(record);
    assert.equal(store.wallet(profileId).balance, 8);
    assert.equal(store.wallet(profileId).lifetimeEarned, 8);
    assert.equal(store.ledger(profileId).rows.length, 2);
  } finally { store.close(); }
});

test('消费只扣可用余额，重复购买请求只扣一次，余额不足不会留下半笔流水', () => {
  const store = new ProfileStore(':memory:');
  try {
    const { profileId } = store.create();
    store.settleMatch(result(profileId, 'old-match', 2));
    const purchase = { profileId, matchId: 'new-match', playerId: 'p1', product: trophyProduct('round12'), requestId: 'a' };
    assert.equal(store.purchase(purchase).added, true);
    assert.equal(store.purchase(purchase).added, false);
    store.purchase({ ...purchase, requestId: 'b' });
    const before = store.ledger(profileId).rows.length;
    assert.throws(() => store.purchase({ ...purchase, requestId: 'c' }), error => error.code === 'NO_FUNDS');
    assert.equal(store.wallet(profileId).balance, 0);
    assert.equal(store.wallet(profileId).lifetimeEarned, 2);
    assert.equal(store.ledger(profileId).rows.length, before);
  } finally { store.close(); }
});

test('装备共享一次购买限制，未定价商品拒绝扣款', () => {
  const store = new ProfileStore(':memory:');
  try {
    const { profileId } = store.create();
    store.settleMatch(result(profileId, 'earned', 20));
    const equipment = TROPHY_SHOP_PRODUCTS.filter(product => product.group === 'equipment');
    const purchase = { profileId, matchId: 'm', playerId: 'p1', product: equipment[0], requestId: 'a' };
    assert.throws(() => store.purchase(purchase), error => error.code === 'BAD_TARGET');
    store.purchase({ ...purchase, product: { ...equipment[0], price: 3 } });
    assert.throws(() => store.purchase({ ...purchase, requestId: 'b', product: { ...equipment[1], price: 3 } }),
      error => error.code === 'BAD_TARGET');
    assert.equal(store.wallet(profileId).balance, 17);
    assert.equal(store.wallet(profileId).lifetimeEarned, 20);
  } finally { store.close(); }
});

test('第12回合奖励一局最多买十次，不同对局重新计算次数', () => {
  const store = new ProfileStore(':memory:');
  try {
    const { profileId } = store.create();
    store.settleMatch(result(profileId, 'earned', 20));
    const purchase = { profileId, matchId: 'm', playerId: 'p1', product: trophyProduct('round12') };
    for (let i = 0; i < 10; i++) store.purchase({ ...purchase, requestId: String(i) });
    assert.throws(() => store.purchase({ ...purchase, requestId: 'eleven' }), error => error.code === 'BAD_TARGET');
    store.purchase({ ...purchase, matchId: 'next', requestId: 'next' });
    assert.equal(store.wallet(profileId).balance, 9);
    assert.equal(store.wallet(profileId).lifetimeEarned, 20);
  } finally { store.close(); }
});
