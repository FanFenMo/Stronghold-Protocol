import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.js';
import { TestClient } from '../helpers/wsClient.js';

test('真实连接共享档案余额、按服务器价格扣款、同一请求不重复发放且确认信息后停止购买', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const clients = [];
  try {
    const url = `ws://127.0.0.1:${srv.port}/ws`;
    const first = await TestClient.connect(url);
    clients.push(first);
    const welcome = await first.hello('商店玩家');
    const store = srv.lobby.profiles.store;
    store.settleMatch({ matchId: 'earned-before-match', startedAt: 1, participants: { old: first.profile.profileId },
      summary: { players: [{ playerId: 'old', trophies: 5, isBot: false }] } });
    assert.equal((await first.request({ t: 'room.create', mode: 'solo', difficulty: 'HARD' })).t, 'ok');
    assert.equal((await first.request({ t: 'room.start' })).t, 'ok');
    const snapshot = await first.request({ t: 'shop.get' });
    assert.equal(snapshot.canBuy, true);
    assert.equal(snapshot.profile.balance, 5);
    const hidden = snapshot.products.find(product => product.id === 'mystery');
    assert.equal(hidden.name, '？？？');
    assert.equal(hidden.price, null);
    assert.ok(!('kind' in hidden) && !('round' in hidden));
    assert.equal((await first.request({ t: 'shop.buy', productId: 'mystery', requestId: '0'.repeat(32), price: 0 })).code, 'BAD_TARGET');
    const purchase = { t: 'shop.buy', productId: 'round12', requestId: '1'.repeat(32), price: 0 };
    const bought = await first.request(purchase);
    assert.equal(bought.profile.balance, 4);
    assert.equal(bought.profile.lifetimeEarned, 5);
    const repeated = await first.request(purchase);
    assert.equal(repeated.profile.balance, 4);
    assert.equal(repeated.counts.round12, 1);
    const room = srv.lobby.roomOf(srv.registry.byId(welcome.playerId));
    assert.equal(room.match.players.get(welcome.playerId).trophyShop.counts.round12, 1);

    const second = await TestClient.connect(url);
    clients.push(second);
    await second.hello('另一个标签');
    assert.equal((await second.request({ t: 'profile.bind', token: first.profileToken })).t, 'ok');
    const shared = await second.request({ t: 'profile.get' });
    assert.equal(shared.profile.profileId, first.profile.profileId);
    assert.equal(shared.profile.balance, 4);

    assert.equal((await first.request({ t: 'g.infoReady' })).t, 'ok');
    const locked = await first.request({ ...purchase, requestId: '2'.repeat(32) });
    assert.equal(locked.code, 'WRONG_PHASE');
    assert.equal(store.wallet(first.profile.profileId).balance, 4);
  } finally {
    for (const client of clients) await client.close();
    await srv.close();
  }
});
