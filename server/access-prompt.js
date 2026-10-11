import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

/** Read new credentials before listening. No files or environment variables retain them. */
export async function promptAccess({ input = process.stdin, output = process.stdout } = {}) {
  let hidden = false;
  const terminal = !!input.isTTY && !!output.isTTY;
  const echo = new Writable({
    write(chunk, encoding, done) {
      if (!hidden) output.write(chunk, encoding);
      done();
    },
  });
  const rl = createInterface({ input, output: echo, terminal });
  const lines = rl[Symbol.asyncIterator]();
  // A pasted account + password may arrive in one input chunk: mute as soon as the first line completes.
  if (terminal) rl.on('line', () => { hidden = true; });
  rl.on('SIGINT', () => rl.close());

  async function read(label, password = false) {
    hidden = password;
    output.write(label);
    const line = await lines.next();
    hidden = false;
    if (password && terminal) output.write('\n');
    if (line.done) throw new Error('开服账号密码输入未完成，请在终端重新启动并输入；两项均留空可直接开服。');
    return line.value;
  }

  output.write('\n本次开服的访问账号密码（两项均留空则直接进入游戏，关闭进程后失效）\n');
  try {
    const username = await read('账号（可留空）：');
    const password = await read('密码（可留空，输入不回显）：', true);
    output.write(username || password ? '\n已启用本次开服的账号密码验证。\n' : '\n账号密码均为空，访客可直接进入游戏。\n');
    return { username, password };
  } finally {
    rl.close();
  }
}
