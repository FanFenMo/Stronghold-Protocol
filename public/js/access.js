const form = document.getElementById('access-form');
const error = document.getElementById('access-error');
const button = form.querySelector('button');

function destination() {
  const next = new URLSearchParams(location.search).get('next') || '/';
  const url = new URL(next, location.origin);
  return url.origin === location.origin && url.pathname !== '/login' ? url.pathname + url.search + url.hash : '/';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  error.textContent = '';
  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.elements.username.value, password: form.elements.password.value }),
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) { error.textContent = result.message; return; }
    form.elements.password.value = '';
    location.replace(destination());
  } catch {
    error.textContent = '无法连接服务器，请稍后重试。';
  } finally {
    button.disabled = false;
  }
});
