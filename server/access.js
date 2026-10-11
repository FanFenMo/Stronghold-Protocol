import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const LOGIN_PAGE = readFileSync(new URL('../public/login.html', import.meta.url));
const COOKIE = 'sp.access';
const MAX_BODY = 8192;
const PUBLIC_FILES = new Set(['/css/access.css', '/js/access.js']);

function json(req, res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/** One shared access gate per server instance. Only salted digests and an opaque cookie stay in memory. */
export function createAccess({ username = '', password = '' } = {}) {
  const required = username !== '' || password !== '';
  let salt = randomBytes(32);
  const digest = (user, pass) => createHash('sha256').update(salt).update(JSON.stringify([user, pass])).digest();
  let credentials = digest(username, password);
  username = '';
  password = '';
  let token = randomBytes(32).toString('base64url');

  function authenticated(req) {
    if (!required) return true;
    if (!token) return false;
    const cookie = String(req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
    const value = cookie?.slice(COOKIE.length + 1) || '';
    const candidate = Buffer.from(value);
    const expected = Buffer.from(token);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  async function handle(req, res, rawPath) {
    if (rawPath === '/auth/login') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        json(req, res, 405, { message: '请提交账号密码' });
        return true;
      }
      if (String(req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') {
        json(req, res, 415, { message: '请求格式不正确' });
        return true;
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size <= MAX_BODY) chunks.push(chunk);
      }
      if (size > MAX_BODY) {
        json(req, res, 413, { message: '账号密码过长' });
        return true;
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { json(req, res, 400, { message: '请求格式不正确' }); return true; }
      if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
        json(req, res, 400, { message: '请填写账号密码，留空项也需提交' });
        return true;
      }
      if (required && (!credentials || !timingSafeEqual(digest(body.username, body.password), credentials))) {
        json(req, res, 401, { message: '账号或密码不正确' });
        return true;
      }
      if (required) {
        const secure = req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
        res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
      }
      json(req, res, 200, { ok: true });
      return true;
    }

    if (rawPath === '/auth/status' || rawPath === '/login') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        json(req, res, 405, { message: '不支持的请求方法' });
        return true;
      }
      const allowed = authenticated(req);
      if (rawPath === '/auth/status') {
        json(req, res, allowed ? 200 : 401, { required, authenticated: allowed });
      } else if (allowed) {
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store', 'Content-Length': 0 });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': LOGIN_PAGE.length, 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : LOGIN_PAGE);
      }
      return true;
    }

    if (rawPath === '/healthz' || PUBLIC_FILES.has(rawPath) || authenticated(req)) return false;
    if (req.method === 'GET' && (rawPath === '/' || rawPath === '/index.html' || String(req.headers.accept || '').includes('text/html'))) {
      res.writeHead(302, { Location: `/login?next=${encodeURIComponent(req.url || '/')}`, 'Cache-Control': 'no-store', 'Content-Length': 0 });
      res.end();
    } else {
      json(req, res, 401, { message: '请先输入本次开服的账号密码' });
    }
    return true;
  }

  return {
    authenticated,
    handle,
    clear() { credentials.fill(0); salt.fill(0); credentials = null; salt = null; token = null; },
  };
}
