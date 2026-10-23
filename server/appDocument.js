import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const compress = promisify(gzip);
const THEME_LINK = '<link rel="stylesheet" href="/css/theme.css" data-critical-theme />';

/** Keep the layout reset, palette and typography in the document itself. Cached until server restart. */
export function createAppDocument(publicDir) {
  let document;
  return async () => {
    if (document) return document;
    const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
    if (!html.includes(THEME_LINK)) return null;
    const theme = await readFile(path.join(publicDir, 'css/theme.css'), 'utf8');
    const body = Buffer.from(html.replace(THEME_LINK, `<style id="app-theme">\n${theme}\n</style>`));
    document = { body, gzip: await compress(body, { level: 6 }),
      tag: createHash('sha256').update(body).digest('hex') };
    return document;
  };
}

export function serveAppDocument(req, res, document, useGzip) {
  const body = useGzip ? document.gzip : document.body;
  const tag = `"${document.tag}${useGzip ? '-gz' : ''}"`;
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache',
    Vary: 'Accept-Encoding', ETag: tag };
  if (String(req.headers['if-none-match'] || '').split(',').some(value => value.trim().replace(/^W\//, '') === tag || value.trim() === '*')) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  headers['Content-Length'] = body.length;
  if (useGzip) headers['Content-Encoding'] = 'gzip';
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}
