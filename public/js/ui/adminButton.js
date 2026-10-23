import { html, Button } from './components.js';
import { useStore } from '../store.js';
import { profileStore } from './profile.js';

export function AdminButton() {
  const isAdmin = useStore(s => s.me.isAdmin === true);
  const profileId = useStore(s => s.profile?.profileId, Object.is, profileStore);
  if (!isAdmin) return null;
  return html`<${Button} size="sm" variant="secondary" data-testid="admin-open"
    onClick=${() => window.open(`/admin.html${profileId ? `?profile=${encodeURIComponent(profileId)}` : ''}`, '_blank', 'noopener,width=1180,height=820')}>管理窗口<//>`;
}
