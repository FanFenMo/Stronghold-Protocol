import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProfileStore } from '../server/profiles.js';
import { trophyProduct, TROPHY_SHOP_PRODUCTS } from '../shared/trophyShop.js';

const result = (profileId, matchId = 'match-1', trophies = 5) => ({ matchId, startedAt: 100,
  participants: { p1: profileId }, summary: { players: [{ playerId: 'p1', trophies, name: '玩家', isBot: false }] } });

test('新匿名档案赠送十奖杯，恢复凭证不重复赠送且不增加历史累计', () => {
  const store = new ProfileStore(':memory:');
  try {
    const profile = store.create();
    assert.equal(profile.balance, 10);
    assert.equal(profile.lifetimeEarned, 0);
    assert.deepEqual(store.resolve(profile.token), store.wallet(profile.profileId));
    assert.deepEqual(store.resolve(profile.token), store.wallet(profile.profileId));
    const { rows } = store.ledger(profile.profileId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].delta, 10);
    assert.equal(rows[0].earnedDelta, 0);
  } finally { store.close(); }
});

test('旧档案升级补发十奖杯，保留消费与累计记录，多次重启不会重复补发', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stronghold-profile-migration-'));
  const filename = path.join(directory, 'players.sqlite');
  let store = new ProfileStore(filename);
  try {
    const profile = store.create();
    const emptyProfile = store.create();
    store.settleMatch(result(profile.profileId, 'old-match', 7));
    store.purchase({ profileId: profile.profileId, matchId: 'old-game', playerId: 'p1',
      product: trophyProduct('round12'), requestId: 'old-buy' });
    // A version-one wallet had the match reward and purchase, without any initial grant.
    store.db.prepare("DELETE FROM trophy_ledger WHERE source='initial'").run();
    store.db.exec('UPDATE wallets SET balance=balance-10, revision=revision-1; UPDATE trophy_ledger SET balance_after=balance_after-10; DROP TABLE admin_adjustments; DROP TABLE profile_names; ALTER TABLE profiles DROP COLUMN last_name; PRAGMA user_version=1;');
    store.close();
    for (let restart = 0; restart < 2; restart++) {
      store = new ProfileStore(filename);
      const restored = store.resolve(profile.token);
      assert.equal(restored.balance, 16);
      assert.equal(restored.lifetimeEarned, 7);
      assert.equal(store.resolve(emptyProfile.token).balance, 10);
      assert.equal(store.resolve(emptyProfile.token).lifetimeEarned, 0);
      assert.equal(store.ledger(profile.profileId).rows.filter(row => row.source === 'initial').length, 1);
      assert.equal(store.purchase({ profileId: profile.profileId, matchId: 'old-game', playerId: 'p1',
        product: trophyProduct('round12'), requestId: 'old-buy' }).added, false);
      if (restart === 0) store.close();
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

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
    assert.equal(restored.balance, 15);
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
    assert.equal(store.wallet(profileId).balance, 18);
    assert.equal(store.wallet(profileId).lifetimeEarned, 8);
    assert.equal(store.ledger(profileId).rows.length, 3);
  } finally { store.close(); }
});

test('消费只扣可用余额，重复购买请求只扣一次，余额不足不会留下半笔流水', () => {
  const store = new ProfileStore(':memory:');
  try {
    const { profileId } = store.create();
    store.purchase({ profileId, matchId: 'initial-spend', playerId: 'p1', product: trophyProduct('funds'), requestId: 'initial-spend' });
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
    assert.throws(() => store.purchase({ ...purchase, product: { ...equipment[0], price: null } }), error => error.code === 'BAD_TARGET');
    store.purchase(purchase);
    assert.throws(() => store.purchase({ ...purchase, requestId: 'b', product: equipment[1] }),
      error => error.code === 'BAD_TARGET');
    assert.equal(store.wallet(profileId).balance, 29);
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
    assert.equal(store.wallet(profileId).balance, 19);
    assert.equal(store.wallet(profileId).lifetimeEarned, 20);
  } finally { store.close(); }
});
