import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProfileStore } from '../server/profiles.js';
import { startServer } from './helpers/server.js';
import { TestClient } from './helpers/wsClient.js';

test('账号名册保留同名的不同档案、全部曾用名和奖杯，不合并同名账号；按曾用名搜索及分页', () => {
  let now = 100;
  const store = new ProfileStore(':memory:', { now: () => now++ });
  try {
    const a = store.create(), b = store.create(), unnamed = store.create();
    store.recordName(a.profileId, '旧昵称');
    store.recordName(a.profileId, '共同昵称');
    store.recordName(a.profileId, '共同昵称');
    store.recordName(b.profileId, '共同昵称');
    store.setWallet({ ...store.wallet(a.profileId), balance: 83, lifetimeEarned: 100, requestId: randomUUID(), reason: '名册前已有余额' });
    const result = store.accounts({ search: '共同昵称' });
    assert.equal(result.total, 2);
    assert.equal(new Set(result.profiles.map(row => row.profileId)).size, 2);
    assert.equal(store.account(a.profileId).names.length, 2, '同一昵称只留一条并更新时间');
    assert.equal(store.account(a.profileId).lastName, '共同昵称');
    assert.equal(store.account(a.profileId).balance, 83);
    assert.equal(store.account(b.profileId).balance, 10);
    assert.deepEqual(store.accounts({ search: '旧昵称' }).profiles.map(row => row.profileId), [a.profileId]);
    assert.equal(store.accounts({ search: a.profileId.slice(0, 8).toUpperCase() }).profiles[0].profileId, a.profileId);
    assert.equal(store.accounts({ search: '%' }).total, 0, '搜索按文本匹配而非 SQL 通配符');
    assert.equal(store.account(unnamed.profileId).names.length, 0);
    for (let i = 0; i < 62; i++) store.create();
    const pages = [1, 2, 3].map(page => store.accounts({ page }));
    assert.deepEqual(pages.map(page => page.profiles.length), [30, 30, 5]);
    assert.equal(new Set(pages.flatMap(page => page.profiles.map(row => row.profileId))).size, 65);
  } finally { store.close(); }
});

test('第三版档案升级从旧结算补回历史昵称，保留离线账号与奖杯，重启不丢失或重复昵称', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stronghold-directory-'));
  const filename = path.join(directory, 'profiles.sqlite');
  let time = 1000;
  let store = new ProfileStore(filename, { now: () => time++ });
  try {
    const profile = store.create(), unnamed = store.create();
    for (const name of ['历史昵称', '最近昵称']) {
      store.settleMatch({ matchId: randomUUID(), startedAt: time++, participants: { p: profile.profileId },
        summary: { players: [{ playerId: 'p', isBot: false, name, trophies: 7 }] } });
    }
    store.db.exec('DROP TABLE profile_names; ALTER TABLE profiles DROP COLUMN last_name; PRAGMA user_version=3;');
    store.close();
    for (let restart = 0; restart < 2; restart++) {
      store = new ProfileStore(filename, { now: () => time++ });
      assert.equal(store.account(profile.profileId).lastName, '最近昵称');
      assert.deepEqual(new Set(store.account(profile.profileId).names.map(row => row.name)), new Set(['历史昵称', '最近昵称']));
      assert.equal(store.resolve(profile.token).balance, 24);
      assert.equal(store.account(profile.profileId).lifetimeEarned, 14);
      assert.equal(store.accounts().total, 2);
      assert.equal(store.account(unnamed.profileId).lastName, '');
      assert.equal(store.accounts({ search: '历史昵称' }).total, 1);
      if (!restart) store.close();
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('真实连接绑定、改名和恢复档案均留存昵称，管理员可选离线账号修改奖杯，普通玩家无权读取名册', async t => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true,
    access: { admin: { username: 'manager', password: 'directory-secret' } } });
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(c => c.close())); await srv.close(); });
  const client = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`); clients.push(client);
  const welcome = await client.hello('最初的昵称');
  const token = client.profileToken;
  const id = client.profile.profileId;
  await client.hello('新的昵称', welcome.token);
  const login = await fetch(srv.url + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'manager', password: 'directory-secret' }) });
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
  const list = q => fetch(srv.url + '/api/admin/profiles' + q, { headers });
  const online = await (await list('?q=' + encodeURIComponent('最初的昵称'))).json();
  assert.equal(online.profiles[0].lastName, '新的昵称');
  assert.equal(online.profiles[0].online, true);
  assert.equal(online.profiles[0].profileId, id);
  assert.equal(JSON.stringify(online).includes(token), false);
  assert.equal('token_hash' in online.profiles[0], false);
  assert.equal((await fetch(srv.url + '/api/admin/profiles')).status, 403);
  for (const query of ['?page=0', '?page=1.5', '?page=bad', '?q=' + 'a'.repeat(81)]) assert.equal((await list(query)).status, 400);
  const disconnected = new Promise(resolve => srv.registry.byId(welcome.playerId).ws.once('close', resolve));
  await client.close();
  await disconnected;
  const offline = await (await list('?q=' + encodeURIComponent('最初的昵称'))).json();
  assert.equal(offline.profiles[0].online, false);
  const profile = offline.profiles[0];
  const changed = await fetch(srv.url + '/api/admin/profile', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...profile, balance: profile.balance + 20, lifetimeEarned: profile.lifetimeEarned + 20,
      reason: '离线发放', requestId: randomUUID() }) });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).account.lastName, '新的昵称');
  const restored = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`); clients.push(restored);
  await restored.hello('恢复后的昵称');
  await restored.request({ t: 'profile.bind', token });
  const account = srv.lobby.profiles.store.account(id);
  assert.equal(account.balance, 30);
  assert.equal(account.lastName, '恢复后的昵称');
  assert.deepEqual(new Set(account.names.map(row => row.name)), new Set(['最初的昵称', '新的昵称', '恢复后的昵称']));
  assert.equal(srv.lobby.profiles.store.accounts().total, 2, '切换档案不删除原来创建的匿名账号');
});
