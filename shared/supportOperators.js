// Per-player external roster, shared by the lobby, match and browser.
export const EMPTY_SUPPORT_OPERATORS = Object.freeze({ 5: Object.freeze([]), 6: Object.freeze([]) });
export const SUPPORT_LIMIT = 2;

export function isSupportSelection(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(k => k === '5' || k === '6')
    && [5, 6].every(t => Array.isArray(value[t]) && value[t].length <= SUPPORT_LIMIT
      && value[t].every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)));
}

export function freezeSupportOperators(value) {
  return Object.freeze({ 5: Object.freeze([...value[5]]), 6: Object.freeze([...value[6]]) });
}

export function checkSupportOperators(value, getChess) {
  if (!isSupportSelection(value)) return { error: 'BAD_MSG', detail: '五本、六本各最多添加两名外援' };
  const seen = new Set();
  for (const tier of [5, 6]) for (const id of value[tier]) {
    const c = getChess(id);
    if (!c?.supportOperator || c.isGolden || c.tier !== tier || !c.visible)
      return { error: 'BAD_TARGET', detail: '无效的外援干员或档位' };
    if (seen.has(c.charId)) return { error: 'BAD_TARGET', detail: '同一干员不可重复添加' };
    seen.add(c.charId);
  }
  return { ok: true, selection: freezeSupportOperators(value) };
}

// Keep valid saved choices across roster updates, without dropping other choices.
export function sanitizeSupportOperators(value, getChess) {
  const out = { 5: [], 6: [] }, seen = new Set();
  for (const tier of [5, 6]) for (const id of Array.isArray(value?.[tier]) ? value[tier] : []) {
    const c = getChess(id);
    if (out[tier].length >= SUPPORT_LIMIT || !c?.supportOperator || c.isGolden
      || c.tier !== tier || !c.visible || seen.has(c.charId)) continue;
    out[tier].push(id);
    seen.add(c.charId);
  }
  return freezeSupportOperators(out);
}

export function supportAvailable(chess, selection = EMPTY_SUPPORT_OPERATORS) {
  return !chess?.supportOperator || !!selection?.[chess.tier]?.includes(chess.baseId || chess.chessId);
}

export function supportCatalog(records) {
  return records.filter(c => c.supportOperator && !c.isGolden && c.tier === 5)
    .sort((a, b) => a.identifier - b.identifier || a.chessId.localeCompare(b.chessId));
}
