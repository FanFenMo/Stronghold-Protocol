#!/usr/bin/env node
// PRTS source archive only: no chess, bonds, kits or runtime asset registrations.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasInfo, normalizeAtlas } from './assets/atlas.mjs';
import { parseSkel } from './assets/skel.mjs';
import { resolveRoles } from './assets/anim-roles.mjs';
import { isCompletePng, pngSize } from './assets/formats.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache/reserved-operators');
const ASSETS = join(ROOT, 'public/assets/local/reserved-operators');
const OUTPUT = join(ROOT, 'data/reserved-operators.json');
const API = 'https://prts.wiki/api.php';
const HELP = 'node tools/import-reserved-operators.mjs [--refresh | --offline] [--assets-only]';
const flags = new Set(process.argv.slice(2));
for (const flag of flags) if (!['--refresh', '--offline', '--assets-only', '--help'].includes(flag)) throw Error(`Unknown option: ${flag}\n${HELP}`);
if (flags.has('--help')) { console.log(HELP); process.exit(0); }
const offline = flags.has('--offline'), refresh = flags.has('--refresh');
if (offline && refresh) throw Error('--offline and --refresh cannot be combined');

async function writeAtomic(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, bytes);
  await rename(`${path}.tmp`, path);
}

async function request(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function cachedJson(key, url) {
  const path = join(CACHE, `${key}.json`);
  if (!refresh && existsSync(path)) return JSON.parse(await readFile(path, 'utf8'));
  if (offline) throw Error(`Missing PRTS cache: ${path}`);
  const bytes = await request(url), data = JSON.parse(bytes);
  if (data.error) throw Error(`PRTS: ${data.error.info}`);
  await writeAtomic(path, bytes);
  return data;
}

// Split template parameters without splitting nested templates or wiki links.
function splitFields(text) {
  const parts = [];
  let start = 0, templates = 0, links = 0;
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { templates++; i++; }
    else if (pair === '}}') { templates--; i++; }
    else if (pair === '[[') { links++; i++; }
    else if (pair === ']]') { links--; i++; }
    else if (text[i] === '|' && templates === 0 && links === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function templates(text) {
  const out = [];
  let depth = 0, start = 0;
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { if (depth++ === 0) start = i + 2; i++; }
    else if (pair === '}}') {
      if (--depth === 0) {
        const [name, ...parts] = splitFields(text.slice(start, i));
        const fields = {};
        for (const part of parts) { const eq = part.indexOf('='); if (eq >= 0) fields[part.slice(0, eq).trim()] = part.slice(eq + 1).trim(); }
        out.push({ name, fields });
      }
      i++;
    }
  }
  return out;
}

function plain(text = '') {
  let result = String(text);
  while (/\{\{[^{}]*\}\}/.test(result)) result = result.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
    const [name, ...args] = splitFields(inner);
    if (name === 'popup') return `（${(args.find(x => x.startsWith('内容=')) || '').slice(3)}）`;
    if (name === '修正') return args[0];
    return (args.at(-1) ?? name).replace(/^内容=/, '');
  });
  return result.replace(/\[\[([^\[\]]+)\]\]/g, (_, link) => link.split('|').at(-1))
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/'{2,3}/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').trim();
}

const cleanFields = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, plain(value)]));
const value = text => { const s = plain(text); return s === '' ? null : /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s; };

function skillData(fields, index) {
  const levels = Array.from({ length: 10 }, (_, n) => {
    const prefix = n < 7 ? `技能${n + 1}` : `技能专精${n - 6}`;
    return { level: n + 1, mastery: Math.max(0, n - 6),
      description: plain(fields[`${prefix}描述`]), descriptionWikitext: fields[`${prefix}描述`],
      initSp: value(fields[`${prefix}初始`]), spCost: value(fields[`${prefix}消耗`]), duration: value(fields[`${prefix}持续`]) };
  });
  return { index, name: plain(fields.技能名), spType: plain(fields.技能类型1), skillType: plain(fields.技能类型2), levels,
    extra: cleanFields(Object.fromEntries(Object.entries(fields).filter(([key]) => !/^技能(?:名|类型|[1-7]|专精[1-3])/.test(key)))) };
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function assetRecord(path, sourceUrl, bytes) {
  return { path: `/assets/local/reserved-operators/${path.replaceAll('\\', '/')}`, sourceUrl, bytes: bytes.length, sha256: hash(bytes),
    ...(path.endsWith('.png') ? pngSize(bytes) : {}) };
}

async function asset(path, sourceUrl, expected = null, pageSizes = null) {
  const local = resolve(ASSETS, path);
  if (relative(ASSETS, local).startsWith('..')) throw Error(`Asset path outside archive: ${path}`);
  let bytes = !refresh && existsSync(local) ? await readFile(local) : null;
  if (bytes && expected && hash(bytes) !== expected) bytes = null;
  if (!bytes) {
    if (offline) throw Error(`Missing archive asset: ${local}`);
    bytes = await request(sourceUrl);
  }
  if (pageSizes) bytes = Buffer.from(normalizeAtlas(bytes.toString('utf8'), { pageSize: page => pageSizes[page] }).text);
  if (expected && hash(bytes) !== expected) throw Error(`Archive asset changed upstream; use --refresh: ${sourceUrl}`);
  if (path.endsWith('.png') && !isCompletePng(bytes)) throw Error(`Incomplete PNG: ${sourceUrl}`);
  await writeAtomic(local, bytes);
  return { bytes, record: assetRecord(path, sourceUrl, bytes) };
}

async function modelData(charId, meta, skinName, viewName, rec, skillIndices) {
  const stem = `${charId}/spine/${rec.file}`;
  const source = new URL(rec.file, meta.prefix).href;
  const [skel, atlas] = await Promise.all([asset(`${stem}.skel`, `${source}.skel`), asset(`${stem}.atlas`, `${source}.atlas`)]);
  const text = atlas.bytes.toString('utf8'), info = atlasInfo(text);
  const textures = await Promise.all(info.pages.map(page => asset(`${dirname(stem)}/${page}`, new URL(page, `${source}.atlas`).href)));
  const sizes = new Map(info.pages.map((page, i) => [page, pngSize(textures[i].bytes)]));
  const normalized = normalizeAtlas(text, { pageSize: page => sizes.get(page) });
  if (normalized.changed) {
    atlas.bytes = Buffer.from(normalized.text);
    await writeAtomic(resolve(ASSETS, `${stem}.atlas`), atlas.bytes);
    atlas.record = assetRecord(`${stem}.atlas`, `${source}.atlas`, atlas.bytes);
  }
  atlas.record.pageSizes = Object.fromEntries(sizes);
  const parsed = parseSkel(skel.bytes, info.regions);
  if (parsed.missingRegions.length) throw Error(`Mismatched atlas for ${charId}/${skinName}/${viewName}: ${parsed.missingRegions.join(', ')}`);
  return { skeleton: skel.record, atlas: atlas.record, textures: textures.map(x => x.record),
    ...(rec.skin ? { skin: rec.skin } : {}), spineVersion: parsed.version,
    animations: parsed.durations, events: parsed.events, hits: parsed.hits, bounds: parsed.bounds,
    roles: resolveRoles(parsed.animations, { skillIndices, durations: parsed.durations }) };
}

async function imageData(pageName, charId, skillNames, modules) {
  const files = [`头像_${pageName}.png`, `立绘_${pageName}_1.png`, `立绘_${pageName}_2.png`, `半身像_${pageName}_1.png`, `半身像_${pageName}_2.png`,
    ...skillNames.map(name => `技能_${name}.png`)];
  const query = new URLSearchParams({ action: 'query', titles: files.map(x => `文件:${x}`).join('|'), prop: 'imageinfo', iiprop: 'url', format: 'json' });
  const data = await cachedJson(`${charId}-images`, `${API}?${query}`);
  const images = {};
  for (const page of Object.values(data.query.pages)) {
    const url = page.imageinfo?.[0]?.url;
    if (!url) continue;
    const filename = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    images[filename] = (await asset(`${charId}/images/${filename}`, url)).record;
  }
  for (const filename of [`头像_${pageName}.png`, ...skillNames.map(name => `技能_${name}.png`)]) {
    if (!images[filename]) throw Error(`PRTS image not found: ${filename}`);
  }
  for (const mod of modules.filter(m => !m.isBadge)) for (const [key, folder, id] of [
    ['image', 'uniequip_img', mod.id], ['typeIcon', 'uniequip_type', mod.typeIcon],
  ]) images[`${mod.id}.${key}`] = (await asset(`${charId}/images/${id}.png`, `https://torappu.prts.wiki/assets/${folder}/${id}.png`)).record;
  return images;
}

async function mapLimit(items, fn) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await fn(items[index], index); }
  }));
  return results;
}

async function importUnit(config, ownerCharId = null) {
  const { name, charId } = config;
  const query = new URLSearchParams({ action: 'parse', page: name, prop: 'wikitext|revid', format: 'json' });
  const data = await cachedJson(charId, `${API}?${query}`);
  const parsed = templates(data.parse.wikitext['*']);
  const fieldsOf = name => parsed.find(t => t.name === name)?.fields || {};
  const info = fieldsOf(ownerCharId ? '召唤物信息' : 'CharinfoV2');
  if (!ownerCharId && info.干员id !== charId) throw Error(`Unexpected PRTS operator id for ${name}: ${info.干员id}`);
  const skills = parsed.filter(t => /^技能2?$/.test(t.name)).map((t, i) => skillData(t.fields, i));
  const modules = parsed.filter(t => t.name === '模组').map(({ fields }) => ({
    id: fields.模组图标, name: plain(fields.名称), type: fields.类型 || 'ORIGINAL', typeIcon: fields.类型图标,
    isBadge: fields.基础证章 === 'yes',
    fields: cleanFields(Object.fromEntries(Object.entries(fields).filter(([key]) => !/^(基础信息|材料消耗|任务|类型颜色)/.test(key)))),
  }));
  const metaUrl = `https://torappu.prts.wiki/assets/char_spine/${charId}/meta.json`;
  const meta = await cachedJson(`${charId}-models`, metaUrl);
  const entries = Object.entries(meta.skin).flatMap(([skin, views]) => Object.entries(views).map(([view, rec]) => ({ skin, view, rec })));
  const models = await mapLimit(entries, async ({ skin, view, rec }) => ({ skin, view,
    data: await modelData(charId, meta, skin, view, rec, skills.map(s => s.index)) }));
  const spine = {};
  for (const model of models) (spine[model.skin] ||= {})[model.view] = model.data;
  const sourceUrl = `https://prts.wiki/w/${encodeURIComponent(name)}`;
  const record = { charId, name, aliases: config.aliases || [], isHidden: true, visible: false,
    game: { enabled: false, bonds: null, tier: null, trait: null },
    source: { site: 'PRTS', url: sourceUrl, pageId: data.parse.pageid, revisionId: data.parse.revid,
      revisionUrl: `https://prts.wiki/index.php?oldid=${data.parse.revid}`, modelMetadataUrl: metaUrl },
    original: ownerCharId ? { attributes: cleanFields(info), talents: parsed.filter(t => t.name === '召唤物天赋').map(t => cleanFields(t.fields)) }
      : { appellation: info.干员外文名, rarity: Number(info.稀有度) + 1, profession: info.职业, subProfession: info.分支, position: info.位置,
        traits: Object.fromEntries(Object.entries(info).filter(([key]) => /^特性\d*$/.test(key)).map(([key, v]) => [key, plain(v)])),
        attributes: cleanFields(fieldsOf('属性')), ranges: cleanFields(fieldsOf('干员攻击范围')),
        talents: parsed.filter(t => t.name === '天赋列表3').map(t => cleanFields(t.fields)),
        potential: cleanFields(fieldsOf('潜能提升')), skills, modules },
    assets: { images: ownerCharId ? {} : await imageData(name, charId, skills.map(s => s.name), modules), spine } };
  if (ownerCharId) record.ownerCharId = ownerCharId;
  else record.relatedTokens = (config.tokens || []).map(t => t.charId);
  console.log(`[PRTS] ${name}: ${skills.length} skills, ${modules.filter(m => !m.isBadge).length} modules, ${models.length} models`);
  return record;
}

function assetRefs(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.path && node.sourceUrl && node.sha256) out.push(node);
  else for (const child of Object.values(node)) assetRefs(child, out);
  return out;
}

async function main() {
  if (flags.has('--assets-only')) {
    const archive = JSON.parse(await readFile(OUTPUT, 'utf8'));
    const refs = assetRefs(archive);
    await mapLimit(refs, ref => asset(ref.path.replace('/assets/local/reserved-operators/', ''), ref.sourceUrl, ref.sha256, ref.pageSizes));
    console.log(`[PRTS] restored ${refs.length} archived asset files`);
    return;
  }
  const configs = JSON.parse(await readFile(join(ROOT, 'tools/data/reserved-operators.json'), 'utf8'));
  const archive = { schemaVersion: 1, status: 'reserved', runtimeRegistration: false,
    source: 'PRTS Wiki; original game data only. Game rules are pending.', operators: {}, tokens: {} };
  for (const config of configs) {
    archive.operators[config.charId] = await importUnit(config);
    for (const token of config.tokens || []) archive.tokens[token.charId] = await importUnit(token, config.charId);
  }
  await writeAtomic(OUTPUT, `${JSON.stringify(archive, null, 2)}\n`);
  console.log(`[PRTS] wrote data/reserved-operators.json; ${assetRefs(archive).length} files, no runtime registrations`);
}

await main();
