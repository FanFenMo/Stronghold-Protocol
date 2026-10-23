import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server.js';

test('主页面直接携带基础样式，访问认证、gzip、HEAD 与条件缓存保持正确', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true,
    access: { username: 'page-test', password: 'page-test' } });
  try {
    assert.equal((await fetch(srv.url, { redirect: 'manual' })).status, 302);
    const login = await fetch(srv.url + '/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'page-test', password: 'page-test' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const get = (url = '/', headers = {}, method = 'GET') => fetch(srv.url + url,
      { method, headers: { Cookie: cookie, 'Accept-Encoding': 'identity', ...headers } });
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    const html = await response.text();
    assert.match(html, /<style id="app-theme">/);
    assert.match(html, /\.micro\s*\{/);
    assert.match(html, /--mint-500:/);
    assert.doesNotMatch(html, /<link[^>]*href="\/css\/theme\.css"/);
    const head = await get('/index.html', {}, 'HEAD');
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(html)));
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('etag'), response.headers.get('etag'));
    assert.equal((await get('/', { 'If-None-Match': response.headers.get('etag') })).status, 304);
    assert.equal((await get('/', { 'If-Modified-Since': 'Fri, 01 Jan 2100 00:00:00 GMT' })).status, 200);
    const compressed = await get('/', { 'Accept-Encoding': 'gzip' });
    assert.equal(compressed.headers.get('content-encoding'), 'gzip');
    assert.notEqual(compressed.headers.get('etag'), response.headers.get('etag'));
    assert.equal(await compressed.text(), html);
    assert.equal((await get('/css/theme.css')).status, 200, '开发页面仍可直接引用基础样式');
  } finally { await srv.close(); }
});

test('基础样式变更随服务器重启进入主页面，缓存标识随内容改变', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stronghold-app-document-'));
  mkdirSync(path.join(directory, 'css'));
  writeFileSync(path.join(directory, 'index.html'), '<html><head><link rel="stylesheet" href="/css/theme.css" data-critical-theme /></head><body>test</body></html>');
  const theme = path.join(directory, 'css/theme.css');
  writeFileSync(theme, 'body { font-size: 18px; }');
  let srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, publicDir: directory });
  try {
    const first = await fetch(srv.url);
    const firstTag = first.headers.get('etag');
    assert.match(await first.text(), /font-size: 18px/);
    await srv.close();
    writeFileSync(theme, 'body { font-size: 20px; }');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, publicDir: directory });
    const updated = await fetch(srv.url, { headers: { 'If-None-Match': firstTag } });
    assert.equal(updated.status, 200);
    assert.notEqual(updated.headers.get('etag'), firstTag);
    assert.match(await updated.text(), /font-size: 20px/);
  } finally { await srv.close(); rmSync(directory, { recursive: true, force: true }); }
});
