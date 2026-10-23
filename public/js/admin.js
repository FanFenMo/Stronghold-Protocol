const $ = id => document.getElementById(id);
let wallet = null;
let saving = false;
let lookupSequence = 0;
let pending = null;
let refreshing = false;

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

async function refreshMatches() {
  if (refreshing) return;
  refreshing = true;
  try {
    const { matches } = await request('matches');
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
  $('wallet-id').textContent = `档案 ${wallet.profileId}`;
  $('balance').value = wallet.balance;
  $('earned').value = wallet.lifetimeEarned;
  $('reason').value = '';
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
}

async function lookup(profileId, self = false) {
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
$('wallet-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!wallet || saving) return;
  const values = { profileId: wallet.profileId, balance: Number($('balance').value), lifetimeEarned: Number($('earned').value),
    revision: wallet.revision, reason: $('reason').value.trim() };
  if (!pending || JSON.stringify(pending.values) !== JSON.stringify(values)) pending = { values, requestId: requestId() };
  const body = { ...values, requestId: pending.requestId };
  saving = true;
  $('save-wallet').disabled = true;
  notice('正在保存奖杯修改……');
  try {
    showWallet(await request('profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    notice('奖杯修改已保存，在线玩家余额已同步。');
  } catch (error) {
    if (error.status === 409) { wallet = null; pending = null; $('wallet-form').hidden = true; }
    notice(error.message, true);
  } finally { saving = false; $('save-wallet').disabled = false; }
});

void refreshMatches();
const timer = setInterval(() => { if (!document.hidden) void refreshMatches(); }, 5000);
window.addEventListener('pagehide', () => clearInterval(timer));
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
const initial = new URLSearchParams(location.search).get('profile');
if (initial) void lookup(initial);
