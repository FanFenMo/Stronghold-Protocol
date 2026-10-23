import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from '../ui/components.js';
import { createStore, useStore } from '../store.js';
import { net } from '../net.js';
import { PHASE } from '../../../shared/constants.js';
import { TROPHY_SHOP_GROUPS } from '../../../shared/trophyShop.js';
import { profileStore, acceptWallet, profileBackup, restoreProfile } from '../ui/profile.js';
import { toast } from '../ui/toasts.js';
import { copyText } from '../ui/clipboard.js';

const shopStore = createStore({ open: false, snapshot: null, busy: null, reward: null });
let rewardTimer;

async function refreshShop() {
  if (profileStore.get().status !== 'ready') return;
  try {
    const snapshot = await net.request('shop.get');
    const pending = pendingPurchase();
    if (pending && (pending.matchId !== snapshot.matchId || snapshot.receipts.includes(pending.requestId))) {
      sessionStorage.removeItem('sp.shop.pending');
    }
    shopStore.set({ snapshot });
    acceptWallet(snapshot.profile);
  } catch (error) { toast(error.detail || error.message, 'error'); }
}

export function ShopButton({ size = 'md', class: cls = '' }) {
  return html`<${Button} size=${size} variant="secondary" class=${cls} data-testid="trophy-shop-open"
    onClick=${() => { shopStore.set({ open: true }); void refreshShop(); }}>商店<//>`;
}

/** Scroll-snap selection follows the established N-difficulty wheel interaction. */
function OptionWheel({ options, value, onChange, label }) {
  const box = useRef(null);
  const current = useRef(value);
  current.current = value;
  const height = () => box.current?.firstElementChild?.offsetHeight || 1;
  useEffect(() => {
    box.current.scrollTop = value * height();
    const observer = new ResizeObserver(() => { box.current.scrollTop = current.current * height(); });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const choose = index => {
    index = Math.max(0, Math.min(options.length - 1, index));
    onChange(index);
    box.current.scrollTo({ top: index * height(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return html`<div class="tshop-wheelframe"><div class="tshop-wheelfocus" aria-hidden="true"></div>
    <div class="tshop-wheel" ref=${box} tabIndex="0" role="listbox" aria-label=${label}
      onScroll=${() => onChange(Math.max(0, Math.min(options.length - 1, Math.round(box.current.scrollTop / height()))))}
      onKeyDown=${event => {
        const targets = { ArrowUp: value - 1, ArrowDown: value + 1, Home: 0, End: options.length - 1 };
        if (event.key in targets) { event.preventDefault(); choose(targets[event.key]); }
      }}>
      ${options.map((item, index) => html`<button key=${item.id} type="button" role="option" aria-selected=${index === value}
        tabIndex="-1" class=${`tshop-option${index === value ? ' is-selected' : ''}`}
        style=${`--shop-distance:${Math.min(2, Math.abs(index - value))};--shop-tilt:${Math.max(-2, Math.min(2, index - value)) * -13}deg`}
        onClick=${() => choose(index)}>${item.name}</button>`)}
    </div></div>`;
}

function pendingPurchase() {
  const raw = sessionStorage.getItem('sp.shop.pending');
  return raw ? JSON.parse(raw) : null;
}

async function buy(product, snapshot) {
  if (shopStore.get().busy) return;
  let pending;
  try {
    pending = pendingPurchase();
    if (pending && pending.matchId !== snapshot.matchId) pending = null;
    if (pending && pending.productId !== product.id) { toast('请先重试上一笔购买，确认购买结果', 'warn'); return; }
    if (!pending) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      pending = { productId: product.id, matchId: snapshot.matchId,
        requestId: [...bytes].map(value => value.toString(16).padStart(2, '0')).join('') };
      sessionStorage.setItem('sp.shop.pending', JSON.stringify(pending));
    }
    shopStore.set({ busy: product.id });
    const result = await net.request('shop.buy', { productId: product.id, requestId: pending.requestId });
    sessionStorage.removeItem('sp.shop.pending');
    shopStore.set({ snapshot: result });
    acceptWallet(result.profile);
    toast('购买成功，本局生效', 'success');
  } catch (error) {
    if (error.code !== 'TIMEOUT' && error.code !== 'OFFLINE') sessionStorage.removeItem('sp.shop.pending');
    toast(error.code === 'NO_FUNDS' ? '可用奖杯不足' : error.detail || error.message, 'error');
  } finally { shopStore.set({ busy: null }); }
}

function ProductGroup({ group, snapshot, busy, balance }) {
  const options = snapshot.products.filter(product => product.group === group.id)
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || (a.order ?? 0) - (b.order ?? 0));
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const product = options[selected] || options[0];
  const count = snapshot.counts[group.id] || 0;
  const unpriced = product.price === null;
  const exhausted = count >= product.limit;
  const canBuy = snapshot.canBuy && !unpriced && !exhausted && !busy && balance >= product.price;
  return html`<section class="tshop-product brackets">
    ${group.expandable ? html`<button type="button" class="tshop-expand" aria-expanded=${expanded}
      onClick=${() => setExpanded(!expanded)}><strong>${group.name}</strong><span>${expanded ? '收起' : '展开'}</span></button>`
      : html`<h3>${group.name}</h3>`}
    ${group.expandable ? expanded ? html`<${OptionWheel} options=${options} value=${selected} onChange=${setSelected} label=${group.name} />`
      : html`<p class="tshop-selection">${product.name}</p>` : null}
    ${group.id === 'equipment' && expanded ? html`<p class="tshop-tier">${product.tierName} · 同档同价 · 本局仅可购买其中一件</p>` : null}
    ${group.id === 'round12' ? html`<p class="tshop-note">可叠加，每局最多 10 次</p>` : null}
    <div class="tshop-buy"><span class="tshop-price">${unpriced ? '' : `${product.price} 奖杯`}</span>
      <span class="tshop-count">${count}/${product.limit}</span>
      <${Button} size="sm" disabled=${!canBuy} onClick=${() => buy(product, snapshot)}
        title=${unpriced ? '尚未定价' : !snapshot.canBuy ? '仅在本局信息确认前购买' : exhausted ? '本局已达到购买上限' : ''}>
        ${busy === product.id ? '购买中' : exhausted ? '本局已购' : unpriced ? '尚未定价' : '购买'}<//>
    </div>
  </section>`;
}

function downloadBackup() {
  try {
    const blob = new Blob([JSON.stringify(profileBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = '卫戍协议-匿名档案恢复凭证.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(error.message, 'error'); }
}

export function ShopHost() {
  const shop = useStore(value => value, Object.is, shopStore);
  const profile = useStore(value => value, Object.is, profileStore);
  const phase = useStore(value => value.match?.public?.phase);
  const inMatch = useStore(value => !!value.room?.inMatch);
  const file = useRef(null);
  useEffect(() => {
    if (shop.open && profile.status === 'ready') void refreshShop();
  }, [shop.open, profile.status, phase]);
  useEffect(() => {
    if (shop.open && inMatch && phase !== PHASE.INFO_CHECK) shopStore.set({ open: false });
  }, [phase, inMatch]);
  useEffect(() => {
    const off = net.on('m.shopReward', message => {
      clearTimeout(rewardTimer);
      shopStore.set({ reward: message });
      rewardTimer = setTimeout(() => shopStore.set({ reward: null }), 3500);
    });
    return () => { off(); clearTimeout(rewardTimer); };
  }, []);
  const snapshot = shop.snapshot;
  return html`${shop.reward ? html`<div class="tshop-reward" role="status"><div class="tshop-reward__light"></div>
      <strong>${shop.reward.name}</strong><span>特殊干员已加入整备区</span></div>` : null}
    <${Modal} open=${shop.open} class="tshop-modal" width="min(1200px, 96vw)" onClose=${() => shopStore.set({ open: false })}
      title=${html`<span class="tshop-heading"><strong>商店</strong><span>可用奖杯 <b class="num">${profile.profile?.balance ?? '—'}</b></span>
        <button type="button" class="tshop-close" onClick=${() => shopStore.set({ open: false })} aria-label="关闭商店">×</button></span>`}>
      <div class="tshop-toolbar"><span>历史累计获得：${profile.profile?.lifetimeEarned ?? '—'} 奖杯</span>
        <span title="定向发放奖杯时提供此 ID">档案 ID：<code class="selectable" data-testid="profile-id">${profile.profile?.profileId ?? '—'}</code></span>
        <${Button} size="sm" variant="ghost" data-testid="profile-copy" disabled=${profile.status !== 'ready'} onClick=${async () => {
          const copied = await copyText(profile.profile.profileId);
          toast(copied ? '档案 ID 已复制' : '复制失败，可选中档案 ID 手动复制', copied ? 'success' : 'warn');
        }}>复制 ID<//>
        <${Button} size="sm" variant="ghost" disabled=${profile.status !== 'ready'} onClick=${downloadBackup}>备份档案凭证<//>
        <${Button} size="sm" variant="ghost" disabled=${inMatch || net.status !== 'online'} onClick=${() => file.current.click()}>恢复档案<//>
        <input ref=${file} type="file" accept="application/json,.json" hidden onChange=${async event => {
          const input = event.currentTarget;
          const selected = input.files?.[0];
          input.value = '';
          if (!selected) return;
          try {
            if (selected.size > 8192) throw new Error('这不是有效的匿名档案恢复文件');
            await restoreProfile(JSON.parse(await selected.text()));
            await refreshShop(); toast('档案已恢复', 'success');
          } catch (error) { toast(error.detail || error.message, 'error'); }
        }} />
      </div>
      ${profile.status === 'error' || profile.status === 'disabled' ? html`<p class="tshop-status">${profile.error}</p>`
        : !snapshot || profile.status !== 'ready' ? html`<p class="tshop-status">正在连接匿名档案……</p>`
        : html`<p class="tshop-status">${snapshot.canBuy ? '购买后仅对本局生效，确认本局信息后停止购买。' : '当前仅可浏览，请在本局信息确认前购买。'}</p>
          <div class="tshop-grid">${TROPHY_SHOP_GROUPS.map(group => html`<${ProductGroup} key=${group.id} group=${group}
            snapshot=${snapshot} busy=${shop.busy} balance=${profile.profile.balance} />`)}</div>`}
    <//>`;
}
