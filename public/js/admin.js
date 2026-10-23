import { copyText } from './ui/clipboard.js';

const $ = id => document.getElementById(id);
let wallet = null;
let saving = false;
let lookupSequence = 0;
let pending = null;
let refreshing = false;
let accountPage = 1;
let accountSearch = '';
let accountsSequence = 0;
let walletMode = 'grant';
let accountsSnapshot = '';
let matchesSnapshot = '';
const embedded = new URLSearchParams(location.search).get('embedded') === '1';
if (embedded) {
  document.documentElement.classList.add('embedded');
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.parent.postMessage('admin.close', location.origin);
  });
}

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').className = error ? 'error' : '';
}

async function request(path, options = {}) {
  const response = await fetch(`/api/admin/${path}`, { cache: 'no-store', ...options });
  if (response.status === 401 || response.status === 403) {
    location.replace(`/login?switch=1&next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error('请使用管理员账号重新登录');
  }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message), { status: response.status });
  return result;
}

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

const phases = { INFO_CHECK: '信息确认', BAND_DRAFT: '策略选择', PREP: '备战', COMBAT: '战斗',
  SETTLE: '结算', SP_DRAFT: '机变', ROUND_START: '回合开始', RESULT: '模拟结束' };
const difficulties = { FUNNY: '标准', NORMAL: '险境', HARD: '绝境', ABYSS: '终极' };
const oldNames = account => account.names.filter(row => row.name !== account.lastName).map(row => row.name);

async function refreshAccounts() {
  const sequence = ++accountsSequence;
  try {
    const result = await request(`profiles?q=${encodeURIComponent(accountSearch)}&page=${accountPage}`);
    if (sequence !== accountsSequence) return;
    const snapshot = JSON.stringify(result);
    if (snapshot === accountsSnapshot) return;
    accountsSnapshot = snapshot;
    $('account-total').textContent = result.total;
    const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
    $('accounts-page').textContent = `第 ${result.page} / ${pages} 页 · 共 ${result.total} 个账号`;
    $('accounts-prev').disabled = result.page <= 1;
    $('accounts-next').disabled = result.page >= pages;
    const cards = result.profiles.map(account => {
      const card = element('button', undefined, 'account');
      card.type = 'button'; card.dataset.profileId = account.profileId;
      card.setAttribute('aria-pressed', String(wallet?.profileId === account.profileId));
      card.append(element('strong', `${account.lastName || '尚无昵称记录'}${account.online ? ' · 在线' : ' · 离线'}`));
      const names = oldNames(account);
      card.append(element('small', names.length ? `曾用名：${names.slice(0, 3).join('、')}${names.length > 3 ? ` 等 ${names.length} 个` : ''}` : '暂无其他昵称'));
      card.append(element('span', `可用 ${account.balance} · 历史累计 ${account.lifetimeEarned}`),
        element('code', account.profileId), element('small', `最近访问：${new Date(account.lastSeenAt).toLocaleString()}`));
      card.addEventListener('click', () => lookup(account.profileId));
      return card;
    });
    $('accounts').replaceChildren(...(cards.length ? cards : [element('p', '没有找到匹配的匿名账号。', 'hint')]));
  } catch (error) { if (sequence === accountsSequence) notice(error.message, true); }
}

function setMode(mode) {
  walletMode = mode;
  const grant = mode === 'grant';
  $('grant-fields').hidden = !grant;
  $('set-fields').hidden = grant;
  $('grant-amount').disabled = !grant;
  $('balance').disabled = $('earned').disabled = grant;
  $('save-wallet').textContent = grant ? '发放奖杯' : '保存奖杯修改';
  document.querySelectorAll('[data-wallet-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.walletMode === mode)));
}

async function refreshMatches() {
  if (refreshing) return;
  refreshing = true;
  try {
    const { matches } = await request('matches');
    const snapshot = JSON.stringify(matches);
    if (snapshot === matchesSnapshot) return;
    matchesSnapshot = snapshot;
    $('match-count').textContent = matches.length;
    const nodes = matches.map(match => {
      const card = element('article', undefined, 'match');
      const header = element('div', undefined, 'match-head');
      header.append(element('strong', match.code), element('span', `${match.mode === 'solo' ? '独立模拟' : '同盟模拟'} · ${difficulties[match.difficulty] || match.difficulty}${match.difficulty === 'ABYSS' ? ` N${match.ultimateLevel}` : ''}`),
        element('span', `${phases[match.phase] || match.phase} · 第 ${match.round || 0} 回合`));
      const watch = element('a', '进入观战', 'watch-link');
      watch.href = `/?watch=${encodeURIComponent(match.code)}`;
      watch.target = '_blank'; watch.rel = 'noopener';
      watch.dataset.code = match.code;
      header.append(watch);
      const players = element('div', undefined, 'players');
      for (const player of match.players) {
        const item = element(player.profileId ? 'button' : 'div', undefined, 'player');
        item.append(element('span', `${player.name}${player.isBot ? ' · AI' : player.left ? ' · 已离场' : player.connected ? ' · 在线' : ' · 离线'}`));
        if (player.profileId) {
          item.type = 'button';
          item.append(element('small', player.profileId));
          item.addEventListener('click', () => lookup(player.profileId));
        }
        players.append(item);
      }
      card.append(header, players);
      return card;
    });
    $('matches').replaceChildren(...(nodes.length ? nodes : [element('p', '目前没有正在进行的对局。', 'hint')]));
  } catch (error) { notice(error.message, true); }
  finally { refreshing = false; }
}

function showWallet(result) {
  wallet = result.profile;
  pending = null;
  $('profile-id').value = wallet.profileId;
  $('wallet-id').textContent = wallet.profileId;
  $('wallet-name').textContent = result.account.lastName || '尚无昵称记录';
  const names = oldNames(result.account);
  $('wallet-names').textContent = names.length ? `曾用名：${names.join('、')}` : '暂无其他昵称';
  $('wallet-summary').textContent = `可用奖杯 ${wallet.balance} · 历史累计 ${wallet.lifetimeEarned} · 建立于 ${new Date(result.account.createdAt).toLocaleString()}`;
  $('balance').value = wallet.balance;
  $('earned').value = wallet.lifetimeEarned;
  $('reason').value = '';
  $('grant-amount').value = '';
  setMode(walletMode);
  $('wallet-form').hidden = false;
  const title = element('h3', '最近奖杯流水');
  const rows = result.ledger.map(row => {
    const source = { initial: '初始赠送', match: '对局奖励', purchase: '商店消费', admin: '管理员修改' }[row.source] || row.source;
    const item = element('div', `${source} · 可用 ${row.delta >= 0 ? '+' : ''}${row.delta} · 累计 ${row.earnedDelta >= 0 ? '+' : ''}${row.earnedDelta}`, 'ledger-row');
    item.append(element('small', `${new Date(row.createdAt).toLocaleString()} · 修改后可用 ${row.balanceAfter} / 累计 ${row.earnedAfter}`));
    if (row.reason) item.append(element('small', `原因：${row.reason}`));
    return item;
  });
  $('ledger').replaceChildren(title, ...rows);
  document.querySelectorAll('.account').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.profileId === wallet.profileId)));
}

async function lookup(profileId, self = false, scroll = true) {
  if (saving) return;
  const sequence = ++lookupSequence;
  wallet = null; pending = null;
  $('wallet-form').hidden = true;
  $('ledger').replaceChildren();
  notice('正在查询档案……');
  try {
    const result = await request(self ? 'self' : `profile?id=${encodeURIComponent(profileId.trim())}`,
      self ? { headers: { 'X-Profile-Token': localStorage.getItem('sp.profile') || '' } } : {});
    if (sequence !== lookupSequence) return;
    showWallet(result);
    notice('档案已载入。');
    if (scroll) $('wallet-form').scrollIntoView({ block: 'start' });
  } catch (error) { if (sequence === lookupSequence) notice(error.message, true); }
}

// getRandomValues also works on HTTP LAN origins where randomUUID is unavailable.
function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

$('lookup-form').addEventListener('submit', event => { event.preventDefault(); void lookup($('profile-id').value); });
$('self-profile').addEventListener('click', () => lookup('', true));
$('refresh-matches').addEventListener('click', refreshMatches);
$('refresh-accounts').addEventListener('click', refreshAccounts);
$('accounts-form').addEventListener('submit', event => {
  event.preventDefault(); accountSearch = $('account-search').value.trim(); accountPage = 1; void refreshAccounts();
});
$('accounts-prev').addEventListener('click', () => { accountPage--; void refreshAccounts(); });
$('accounts-next').addEventListener('click', () => { accountPage++; void refreshAccounts(); });
document.querySelectorAll('[data-wallet-mode]').forEach(button => button.addEventListener('click', () => { if (!saving) setMode(button.dataset.walletMode); }));
$('copy-profile').addEventListener('click', async () => {
  if (!wallet) return;
  notice(await copyText(wallet.profileId) ? '档案 ID 已复制。' : '复制失败，可选中档案 ID 手动复制。');
});
$('wallet-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!wallet || saving) return;
  const amount = Number($('grant-amount').value);
  const values = { profileId: wallet.profileId,
    balance: walletMode === 'grant' ? wallet.balance + amount : Number($('balance').value),
    lifetimeEarned: walletMode === 'grant' ? wallet.lifetimeEarned + ($('grant-earned').checked ? amount : 0) : Number($('earned').value),
    revision: wallet.revision, reason: $('reason').value.trim() };
  if (!pending || JSON.stringify(pending.values) !== JSON.stringify(values)) pending = { values, requestId: requestId() };
  const body = { ...values, requestId: pending.requestId };
  saving = true;
  $('save-wallet').disabled = true;
  notice('正在保存奖杯修改……');
  try {
    showWallet(await request('profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    notice('奖杯修改已保存，在线玩家余额已同步。');
    void refreshAccounts();
  } catch (error) {
    if (error.status === 409) { wallet = null; pending = null; $('wallet-form').hidden = true; }
    notice(error.message, true);
  } finally { saving = false; $('save-wallet').disabled = false; }
});

void refreshMatches();
void refreshAccounts();
const timer = setInterval(() => { if (!document.hidden) { void refreshMatches(); void refreshAccounts(); } }, 5000);
window.addEventListener('pagehide', () => clearInterval(timer));
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
const initial = new URLSearchParams(location.search).get('profile');
if (initial) void lookup(initial, false, false);
