const input = document.getElementById('origin');
const notice = document.getElementById('notice');
chrome.storage.local.get('commit.appOrigin').then((item) => { input.value = item['commit.appOrigin'] || ''; });
document.getElementById('save').addEventListener('click', async () => {
  try {
    const url = new URL(input.value.trim());
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) || url.pathname !== '/' || url.search || url.hash) throw new Error('Use an HTTPS origin, or localhost for development.');
    await chrome.storage.local.set({ 'commit.appOrigin': url.origin });
    notice.textContent = 'Connection address saved.';
  } catch (error) { notice.textContent = error.message; }
});
