import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function launch(t, port = 0) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let text = '';
  child.stdout.on('data', (chunk) => { text += chunk; });
  child.stderr.on('data', (chunk) => { text += chunk; });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const stop = async () => { if (child.exitCode === null) child.kill(); await exited; };
  t.after(stop);
  return {
    child, stop, text: () => text,
    async wait(re) {
      const end = Date.now() + 10000;
      while (!re.test(text)) {
        assert.equal(child.exitCode, null, text);
        assert.ok(Date.now() < end, `waiting for ${re}: ${text}`);
        await delay(20);
      }
      return text.match(re);
    },
  };
}

test('the real process waits for both fields before listening and prompts again after restart', async (t) => {
  const first = launch(t);
  await first.wait(/账号（可留空）/);
  assert.doesNotMatch(first.text(), /Local:/);
  first.child.stdin.write('host\n');
  await first.wait(/密码（可留空，输入不回显）/);
  assert.doesNotMatch(first.text(), /Local:/);
  first.child.stdin.write('process-test-password\n');
  const [, base] = await first.wait(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/);
  assert.ok(!first.text().includes('process-test-password'));
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'host', password: 'process-test-password' }) });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  await first.stop();

  const next = launch(t, Number(new URL(base).port));
  await next.wait(/账号（可留空）/);
  assert.doesNotMatch(next.text(), /Local:/);
  next.child.stdin.write('host\nprocess-test-password\n');
  await next.wait(/Local:/);
  assert.equal((await fetch(base + '/auth/status', { headers: { Cookie: cookie } })).status, 401);
});

test('a process with no supplied terminal input exits without serving an unprotected game', async (t) => {
  const run = launch(t);
  const exited = new Promise((resolve) => run.child.once('exit', resolve));
  run.child.stdin.end();
  assert.equal(await exited, 1);
  assert.match(run.text(), /输入未完成/);
  assert.doesNotMatch(run.text(), /Local:/);
});
