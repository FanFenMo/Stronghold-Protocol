/** A restarted server rejects the old cookie. Reload to its login page, retaining the room link. */
export function installAccessGuard(net, { fetchFn = globalThis.fetch, reload = () => globalThis.location.reload() } = {}) {
  let pending = null;
  let expired = false;
  function check() {
    if (expired) return Promise.resolve(false);
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetchFn('/auth/status', { cache: 'no-store' });
        if (response.status === 401) {
          expired = true;
          net.close();
          reload();
          return false;
        }
      } catch { /* The host is offline; the next reconnect checks again. */ }
      return true;
    })().finally(() => { pending = null; });
    return pending;
  }
  const off = net.on('status', ({ status }) => {
    if (status === 'connecting' || status === 'reconnecting') void check();
  });
  return { check, dispose: off };
}
