import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { startServer } from './helpers/server.js';
import { promptAccess } from '../server/access-prompt.js';
import { createAccess } from '../server/access.js';
import { installAccessGuard } from '../public/js/ui/accessGuard.js';

async function boot(t, access) {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, access });
  t.after(() => srv.close());
  return srv;
}

const get = (srv, url, cookie, extra = {}) => fetch(srv.url + url, {
  redirect: 'manual', headers: cookie ? { Cookie: cookie } : {}, ...extra,
});
const login = (srv, username, password) => fetch(srv.url + '/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
});
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];

function upgrade(srv, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: srv.port, path: '/ws',
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...(cookie ? { Cookie: cookie } : {}) },
    });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
}

test('web pages, resources and WebSocket require this run\'s credentials', async (t) => {
  const srv = await boot(t, { username: '主机账号', password: '口令 + 空格 ' });
  const page = await get(srv, '/?room=ABCD');
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login?next=%2F%3Froom%3DABCD');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const screen = await get(srv, page.headers.get('location'));
  assert.equal(screen.status, 200);
  assert.match(await screen.text(), /id="access-form"/);
  for (const url of ['/js/main.js', '/data/config.json', '/sim/Battle.js', '/shared/constants.js', '/dev/uikit.html']) {
    assert.equal((await get(srv, url)).status, 401, url);
  }
  for (const url of ['/js/access.js', '/css/access.css', '/healthz']) assert.equal((await get(srv, url)).status, 200, url);
  assert.equal(await upgrade(srv), 401);
  assert.equal(srv.network.connectionCount, 0);
  const wrong = await login(srv, '主机账号', 'wrong');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.deepEqual(await wrong.json(), { message: '账号或密码不正确' });

  const ok = await login(srv, '主机账号', '口令 + 空格 ');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /; Path=\/; HttpOnly; SameSite=Lax$/);
  assert.doesNotMatch(ok.headers.get('set-cookie'), /主机|口令/);
  const cookie = cookieOf(ok);
  for (let i = 0; i < 2; i++) {
    assert.equal((await get(srv, '/', cookie)).status, 200);
    assert.equal((await get(srv, '/js/main.js', cookie)).status, 200);
    assert.equal(await upgrade(srv, cookie), 101, 'reconnect stays authenticated');
  }
  assert.deepEqual(await (await get(srv, '/auth/status', cookie)).json(), { required: true, authenticated: true });
  assert.equal((await get(srv, '/auth/status', cookie + 'forged')).status, 401);
  assert.equal((await get(srv, '/auth/status', cookie.replace('sp.access', 'other'))).status, 401);
});

test('each field may be empty; both empty bypass the login page', async (t) => {
  for (const access of [{ username: '', password: '密码' }, { username: '账号', password: '' }]) {
    const srv = await boot(t, access);
    assert.equal((await get(srv, '/')).status, 302);
    assert.equal((await login(srv, '', '')).status, 401);
    assert.equal((await login(srv, access.username, access.password)).status, 200);
  }
  const srv = await boot(t, { username: '', password: '' });
  assert.equal((await get(srv, '/?room=ABCD')).status, 200);
  assert.equal(await upgrade(srv), 101);
  assert.deepEqual(await (await get(srv, '/auth/status')).json(), { required: false, authenticated: true });
});

test('免登录服务器在停服清理期间保持普通访问，已清理的凭据不能授予管理权限', () => {
  const request = { headers: {} };
  const open = createAccess({ admin: { username: 'manager', password: 'secret' } });
  assert.equal(open.authenticated(request), true);
  open.clear();
  assert.equal(open.authenticated(request), true, '资源请求不能触发不必要的重新登录');
  assert.equal(open.isAdmin(request), false);
  const protectedGate = createAccess({ username: 'player', password: 'secret' });
  protectedGate.clear();
  assert.equal(protectedGate.authenticated(request), false);
});

test('closing and reopening on the same port invalidates cookies even with the same credentials', async (t) => {
  const access = { username: 'friend', password: 'secret' };
  const srv = await boot(t, access);
  const old = cookieOf(await login(srv, access.username, access.password));
  await srv.close();
  const next = await startServer({ port: srv.port, host: '127.0.0.1', quiet: true, access });
  t.after(() => next.close());
  assert.equal((await get(next, '/', old)).status, 302);
  assert.equal((await get(next, '/auth/status', old)).status, 401);
  assert.equal(await upgrade(next, old), 401);
  const fresh = cookieOf(await login(next, access.username, access.password));
  assert.notEqual(fresh, old);
  assert.equal(await upgrade(next, fresh), 101);
});

test('login accepts only bounded JSON; method, HEAD and proxy HTTPS behavior', async (t) => {
  const srv = await boot(t, { username: 'friend', password: 'secret' });
  assert.equal((await get(srv, '/auth/login')).status, 405);
  assert.equal((await get(srv, '/auth/status', null, { method: 'POST' })).status, 405);
  const head = await get(srv, '/login', null, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await get(srv, '/auth/login', null, { method: 'POST', body: 'username=friend&password=secret' })).status, 415);
  for (const body of ['{', 'null', '{}', '{"username":1,"password":null}']) {
    const res = await get(srv, '/auth/login', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(res.status, 400);
  }
  const huge = await get(srv, '/auth/login', null, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x'.repeat(9000), password: 'secret' }),
  });
  assert.equal(huge.status, 413);
  const https = await get(srv, '/auth/login', null, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' }, body: JSON.stringify({ username: 'friend', password: 'secret' }),
  });
  assert.match(https.headers.get('set-cookie'), /; Secure$/);
});

test('terminal input preserves empty fields and whitespace, and does not print the password', async () => {
  for (const [lines, expected] of [['\n\n\n\n', { username: '', password: '' }], ['主机\n 密码 \n\n\n', { username: '主机', password: ' 密码 ' }]]) {
    const input = new PassThrough();
    const output = new PassThrough();
    let text = '';
    output.on('data', (chunk) => { text += chunk; });
    const result = promptAccess({ input, output });
    input.end(lines);
    assert.deepEqual(await result, expected);
    assert.match(text, /账号（可留空）/);
    assert.match(text, /密码（可留空，输入不回显）/);
    if (expected.password) assert.ok(!text.includes(expected.password));
  }
  const input = new PassThrough();
  const result = promptAccess({ input, output: new PassThrough() });
  input.end('unfinished\n');
  await assert.rejects(result, /输入未完成/);
});

test('pasting both lines in a terminal never echoes the password', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = output.isTTY = true;
  input.setRawMode = () => {};
  let text = '';
  output.on('data', (chunk) => { text += chunk; });
  const result = promptAccess({ input, output });
  input.end('host\nprivate-password\n\n\n');
  assert.deepEqual(await result, { username: 'host', password: 'private-password' });
  assert.ok(!text.includes('private-password'), 'pasted password stays hidden');
});

test('an open game reloads on expired access; a temporarily offline server checks again', async () => {
  let listener, closed = 0, reloads = 0, calls = 0;
  const net = { on(type, fn) { assert.equal(type, 'status'); listener = fn; return () => { listener = null; }; }, close() { closed++; } };
  const guard = installAccessGuard(net, {
    async fetchFn() { calls++; if (calls === 1) throw new Error('offline'); return { status: calls === 2 ? 200 : 401 }; },
    reload() { reloads++; },
  });
  assert.equal(await guard.check(), true);
  listener({ status: 'reconnecting' });
  assert.equal(await guard.check(), true);
  listener({ status: 'reconnecting' });
  assert.equal(await guard.check(), false);
  assert.equal(closed, 1);
  assert.equal(reloads, 1);
  assert.equal(await guard.check(), false);
  assert.equal(calls, 3);
  guard.dispose();
  assert.equal(listener, null);
});
