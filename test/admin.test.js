import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server.js';
import { TestClient } from './helpers/wsClient.js';
import { ProfileStore } from '../server/profiles.js';
import { promptAccess } from '../server/access-prompt.js';
import { createAccess } from '../server/access.js';
import { MAX_SPECTATORS } from '../shared/constants.js';
import { trophyProduct } from '../shared/trophyShop.js';

const access = { username: 'player', password: 'player-secret', admin: { username: 'manager', password: 'admin-secret' } };
const login = async (srv, credentials) => {
  const response = await fetch(srv.url + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], result: await response.json() };
};
const api = (srv, url, cookie, body, extra = {}) => fetch(srv.url + '/api/admin/' + url, {
  headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra },
  ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
});
async function boot(t, options = {}) {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, access, ...options });
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); await srv.close(); });
  const player = await login(srv, access);
  const admin = await login(srv, access.admin);
  const connect = async (cookie = player.cookie, name = '玩家', extra = {}) => {
    const client = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`, { wsOptions: { headers: { Cookie: cookie } } });
    clients.push(client);
    client.welcome = await client.hello(name, undefined, extra);
    return client;
  };
  return { srv, player, admin, connect };
}

test('两套账密独立鉴权，普通玩家不能查询或修改管理数据，也不能伪造管理员角色', async t => {
  const { srv, player, admin, connect } = await boot(t);
  assert.equal(player.result.role, 'player');
  assert.equal(admin.result.role, 'admin');
  assert.notEqual(player.cookie, admin.cookie);
  for (const url of ['matches', 'profile?id=invalid', 'self']) {
    assert.equal((await api(srv, url, player.cookie)).status, 403);
    assert.equal((await api(srv, url, admin.cookie + 'forged')).status, 401);
  }
  assert.equal((await api(srv, 'profile', player.cookie, {})).status, 403);
  const redirect = await fetch(srv.url + '/admin.html', { headers: { Cookie: player.cookie }, redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.match(redirect.headers.get('location'), /switch=1/);
  assert.equal((await fetch(srv.url + '/admin.html', { headers: { Cookie: admin.cookie } })).status, 200);
  const ordinary = await connect(player.cookie, '普通玩家', { isAdmin: true });
  assert.equal(ordinary.welcome.isAdmin, undefined);
  const privileged = await connect(admin.cookie, '管理员');
  assert.equal(privileged.welcome.isAdmin, true);
  assert.equal((await privileged.request({ t: 'room.create', mode: 'solo', difficulty: 'HARD' })).t, 'ok');
  assert.equal((await privileged.request({ t: 'room.start' })).t, 'ok', '管理员仍可正常开局');
  const resumed = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`, { wsOptions: { headers: { Cookie: player.cookie } } });
  try {
    const reply = await resumed.hello('降为普通玩家', privileged.welcome.token, { isAdmin: true });
    assert.equal(reply.isAdmin, undefined, '重连令牌不携带管理权限');
  } finally { await resumed.close(); }
});

test('普通玩家免登录时管理员仍需独立账密，且可主动进入切换登录页', async t => {
  const { srv, admin } = await boot(t, { access: { username: '', password: '', admin: access.admin } });
  assert.equal((await fetch(srv.url)).status, 200);
  assert.equal((await api(srv, 'matches', '')).status, 403);
  assert.equal((await api(srv, 'matches', admin.cookie)).status, 200);
  const page = await fetch(srv.url + '/login?switch=1', { headers: { Cookie: admin.cookie } });
  assert.match(await page.text(), /id="access-form"/);
  assert.throws(() => createAccess({ ...access, admin: { username: 'manager', password: '' } }), /必须同时填写/);
  assert.throws(() => createAccess({ ...access, admin: { username: access.username, password: access.password } }), /必须与普通玩家/);
});

test('管理员修改自己和特定档案，在线实时同步、离线落库，重复提交不重复覆盖后续消费', async t => {
  const { srv, admin, connect } = await boot(t);
  const target = await connect();
  const manager = await connect(admin.cookie, '管理员');
  const store = srv.lobby.profiles.store;
  for (const client of [target, manager]) {
    const profile = store.wallet(client.profile.profileId);
    const body = { profileId: profile.profileId, balance: 32, lifetimeEarned: 80, revision: profile.revision, requestId: randomUUID(), reason: '活动补偿' };
    const response = await api(srv, 'profile', admin.cookie, body);
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.profile.balance, 32);
    assert.equal(saved.profile.lifetimeEarned, 80);
    assert.equal(saved.ledger[0].reason, '活动补偿');
    assert.equal((await client.waitFor('profile.wallet')).profile.balance, 32);
    store.purchase({ profileId: profile.profileId, matchId: randomUUID(), playerId: client.welcome.playerId,
      product: trophyProduct('round12'), requestId: randomUUID() });
    const retry = await api(srv, 'profile', admin.cookie, body);
    assert.equal((await retry.json()).profile.balance, 31, '重复修改不能抹掉之后发生的消费');
    const conflict = await api(srv, 'profile', admin.cookie, { ...body, requestId: randomUUID(), balance: 999 });
    assert.equal(conflict.status, 409);
    assert.equal(store.wallet(profile.profileId).balance, 31);
  }
  await target.close();
  const profile = store.wallet(target.profile.profileId);
  assert.equal((await api(srv, 'profile', admin.cookie, { ...profile, balance: 0, lifetimeEarned: 0, reason: '归零', requestId: randomUUID() })).status, 200);
  const self = await api(srv, 'self', admin.cookie, null, { 'X-Profile-Token': manager.profileToken });
  assert.equal((await self.json()).profile.profileId, manager.profile.profileId);
  const missing = await api(srv, 'profile', admin.cookie, { ...profile, profileId: randomUUID(), requestId: randomUUID(), reason: '不存在的档案' });
  assert.equal(missing.status, 404);
});

test('管理修改拒绝非法数值、跨站修改和不支持格式；查询不包含匿名凭证', async t => {
  const { srv, admin, connect } = await boot(t);
  const target = await connect();
  const body = { ...target.profile, reason: '调整', requestId: randomUUID() };
  const query = await api(srv, `profile?id=${body.profileId}`, admin.cookie);
  const result = await query.json();
  assert.equal('token' in result.profile, false);
  for (const patch of [{ balance: -1 }, { lifetimeEarned: 1.5 }, { balance: Number.MAX_SAFE_INTEGER + 1 },
    { reason: '' }, { reason: 'x'.repeat(201) }, { revision: -1 }, { requestId: 'bad' }]) {
    assert.equal((await api(srv, 'profile', admin.cookie, { ...body, ...patch })).status, 400);
  }
  assert.equal((await api(srv, 'profile', admin.cookie, body, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await api(srv, 'profile', admin.cookie, body, { Origin: 'null' })).status, 403);
  assert.equal(srv.lobby.profiles.store.wallet(body.profileId).balance, 10);
});

test('管理窗口只列进行中对局和固定参战档案，管理员能观战单人局及满额同盟局，不能操作棋盘', async t => {
  const { srv, admin, player, connect } = await boot(t);
  const host = await connect(player.cookie, '<玩家>');
  await host.request({ t: 'room.create', mode: 'solo', difficulty: 'HARD' });
  const room = srv.lobby.roomOf(srv.registry.byId(host.welcome.playerId));
  assert.equal((await (await api(srv, 'matches', admin.cookie)).json()).matches.length, 0);
  await host.request({ t: 'room.start' });
  const observer = await connect(admin.cookie, '管理员观战');
  const normal = await connect();
  assert.equal((await normal.request({ t: 'room.spectate', code: room.code })).code, 'ROOM_FULL');
  assert.equal((await observer.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  const snapshot = await observer.waitFor('m.public');
  assert.equal(snapshot.phase, 'INFO_CHECK');
  assert.equal((await observer.request({ t: 'g.infoReady' })).code, 'SPECTATOR');
  assert.equal(room.match.players.has(observer.welcome.playerId), false);
  const list = await (await api(srv, 'matches', admin.cookie)).json();
  assert.equal(list.matches[0].code, room.code);
  assert.equal(list.matches[0].players[0].profileId, host.profile.profileId);
  assert.equal(JSON.stringify(list).includes(host.profileToken), false);
  // A later session/profile change cannot rewrite the match's recorded participant identity.
  srv.registry.byId(host.welcome.playerId).profileId = randomUUID();
  assert.equal((await (await api(srv, 'matches', admin.cookie)).json()).matches[0].players[0].profileId, host.profile.profileId);
  await observer.request({ t: 'room.leave' });
  const coopHost = await connect();
  await coopHost.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
  const coop = srv.lobby.roomOf(srv.registry.byId(coopHost.welcome.playerId));
  for (let i = 0; i < MAX_SPECTATORS; i++) {
    const client = await connect();
    assert.equal((await client.request({ t: 'room.spectate', code: coop.code })).t, 'ok');
  }
  assert.equal((await normal.request({ t: 'room.spectate', code: coop.code })).code, 'ROOM_FULL');
  assert.equal((await observer.request({ t: 'room.spectate', code: coop.code })).t, 'ok');
});

test('奖杯修改与原因同事务持久化，可调低累计且不改变其他档案，旧版数据库迁移后仍保留修改', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stronghold-admin-'));
  const filename = path.join(directory, 'players.sqlite');
  let store = new ProfileStore(filename);
  try {
    const profile = store.create(), other = store.create();
    store.db.exec('DROP TABLE admin_adjustments; PRAGMA user_version=2;');
    store.close(); store = new ProfileStore(filename);
    let saved = store.setWallet({ ...store.wallet(profile.profileId), balance: 55, lifetimeEarned: 77, reason: '补发', requestId: randomUUID() });
    const before = saved;
    store.db.exec("CREATE TRIGGER reject_admin BEFORE INSERT ON admin_adjustments BEGIN SELECT RAISE(ABORT, 'test rollback'); END;");
    assert.throws(() => store.setWallet({ ...saved, balance: 1, lifetimeEarned: 1, reason: '失败不入账', requestId: randomUUID() }), /test rollback/);
    assert.deepEqual(store.wallet(profile.profileId), before);
    assert.equal(store.ledger(profile.profileId).rows.length, 2);
    store.db.exec('DROP TRIGGER reject_admin;');
    saved = store.setWallet({ ...saved, balance: 9, lifetimeEarned: 3, reason: '更正', requestId: randomUUID() });
    assert.equal(store.wallet(other.profileId).balance, 10);
    store.close(); store = new ProfileStore(filename);
    assert.equal(store.resolve(profile.token).balance, 9);
    assert.equal(store.resolve(profile.token).lifetimeEarned, 3);
    assert.equal(store.ledger(profile.profileId).rows[0].reason, '更正');
    assert.equal(store.ledger(profile.profileId).rows[0].earnedDelta, -74);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('主机输入普通账密后必须继续完成管理员账密，拒绝半空和相同账密，不回显密码', async () => {
  const input = new PassThrough(), output = new PassThrough();
  input.isTTY = output.isTTY = true; input.setRawMode = () => {};
  let text = ''; output.on('data', chunk => { text += chunk; });
  const result = promptAccess({ input, output });
  input.end('player\nplayer-secret\nmanager\n\nplayer\nplayer-secret\nmanager\nadmin-secret\n');
  assert.deepEqual(await result, access);
  assert.match(text, /必须同时填写/);
  assert.match(text, /必须与普通玩家/);
  assert.doesNotMatch(text, /player-secret|admin-secret/);
  const incomplete = new PassThrough();
  const promise = promptAccess({ input: incomplete, output: new PassThrough() });
  incomplete.end('player\npassword\n');
  await assert.rejects(promise, /输入未完成/);
});
