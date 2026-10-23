import { useEffect } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { createStore, useStore } from '../store.js';
import { profileStore } from './profile.js';

const adminView = createStore({ open: false });

export function AdminButton() {
  const isAdmin = useStore(s => s.me.isAdmin === true);
  if (!isAdmin) return null;
  return html`<${Button} size="sm" variant="secondary" data-testid="admin-open"
    onClick=${() => adminView.set({ open: true })}>账号管理<//>`;
}

export function AdminHost() {
  const isAdmin = useStore(s => s.me.isAdmin === true);
  const open = useStore(s => s.open, Object.is, adminView);
  const profileId = useStore(s => s.profile?.profileId, Object.is, profileStore);
  const close = () => adminView.set({ open: false });
  useEffect(() => {
    const listener = event => {
      if (event.origin === location.origin && event.source === document.getElementById('admin-frame')?.contentWindow && event.data === 'admin.close') close();
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  if (!isAdmin) return null;
  return html`<${Modal} open=${open} onClose=${close} closeOnBackdrop=${false} class="admin-modal" width="min(1500px, 96vw)"
    title=${html`<span class="admin-modal__heading">账号与奖杯管理<${Button} size="sm" onClick=${close} data-testid="admin-close">返回游戏<//></span>`}>
    <iframe id="admin-frame" title="账号与奖杯管理" src=${`/admin.html?embedded=1${profileId ? `&profile=${encodeURIComponent(profileId)}` : ''}`}></iframe>
  <//>`;
}
