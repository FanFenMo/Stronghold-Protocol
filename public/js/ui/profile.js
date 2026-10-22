import { createStore } from '../store.js';
import { net } from '../net.js';
import { toast } from './toasts.js';

const KEY = 'sp.profile';
const validToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const readToken = () => globalThis.localStorage.getItem(KEY);
export const profileStore = createStore({ profile: null, status: 'connecting', error: null, token: null });
let binding = 0;

export function acceptWallet(profile) {
  const old = profileStore.get().profile;
  if (old?.profileId === profile.profileId && old.revision > profile.revision) return;
  profileStore.set({ profile });
}

async function bindProfile() {
  const seq = ++binding;
  profileStore.set({ status: 'connecting', error: null });
  try {
    let token = readToken();
    if (token !== null && !validToken(token)) throw new Error('本机档案凭证无法读取，请使用备份文件恢复');
    const result = await net.request('profile.bind', validToken(token) ? { token } : {});
    if (seq !== binding) return;
    if (result.profile.token) {
      // A concurrent first tab may have already persisted its profile while this request was in flight.
      const current = readToken();
      if (validToken(current) && current !== result.profile.token) return bindProfile();
      token = result.profile.token;
      globalThis.localStorage.setItem(KEY, token);
      return bindProfile();
    }
    if (readToken() !== token) return bindProfile();
    acceptWallet(result.profile);
    profileStore.set({ token, status: 'ready' });
  } catch (error) {
    if (seq === binding) profileStore.set({ status: 'error', error: error.detail || error.message });
  }
}

export async function refreshProfile() {
  const result = await net.request('profile.get');
  acceptWallet(result.profile);
  return result.profile;
}

export function profileBackup() {
  const { token, profile } = profileStore.get();
  if (!validToken(token) || !profile) throw new Error('匿名档案尚未连接');
  return { app: 'stronghold-protocol', kind: 'anonymous-profile', v: 1, profileId: profile.profileId, token };
}

export async function restoreProfile(raw) {
  if (raw?.app !== 'stronghold-protocol' || raw.kind !== 'anonymous-profile' || raw.v !== 1 || !validToken(raw.token)) {
    throw new Error('这不是有效的匿名档案恢复文件');
  }
  const result = await net.request('profile.bind', { token: raw.token });
  ++binding;
  globalThis.localStorage.setItem(KEY, raw.token);
  acceptWallet(result.profile);
  profileStore.set({ token: raw.token, status: 'ready', error: null });
}

export function installProfileSync() {
  net.on('welcome', msg => {
    if (msg.profileRequired) void bindProfile();
    else profileStore.set({ status: 'disabled', error: '此服务器未启用匿名档案' });
  });
  net.on('profile.wallet', msg => {
    if (msg.profile.profileId === profileStore.get().profile?.profileId) acceptWallet(msg.profile);
  });
  net.on('profile.storageError', () => toast('本局奖杯尚未入账，服务器正在重试保存', 'warn'));
  net.on('status', () => {
    if (net.status !== 'online') { ++binding; profileStore.set({ status: 'connecting' }); }
  });
  globalThis.addEventListener('storage', event => {
    if (event.key !== KEY || net.status !== 'online') return;
    if (event.newValue !== profileStore.get().token) void bindProfile();
  });
}
