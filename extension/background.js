const DRAFT_KEY = 'commit.pending.capture.v1';
const DAY = 24 * 60 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
  if (message.type === 'site:detected' && sender.tab?.id) {
    let host = '';
    try { host = new URL(sender.url || sender.tab.url).hostname; } catch { return; }
    if (host === 'checkout.stripe.com' || host === 'paddle.com' || host.endsWith('.paddle.com')) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: '•' });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#294c3e' });
    }
    return;
  }
  if (message.type === 'draft:get') {
    chrome.storage.local.get(DRAFT_KEY).then((record) => {
      const draft = record[DRAFT_KEY];
      if (!draft || Date.now() - draft.createdAt >= DAY) {
        chrome.storage.local.remove(DRAFT_KEY).then(() => respond(null));
      } else respond(draft);
    });
    return true;
  }
  if (message.type === 'draft:save') {
    if (!message.draft || JSON.stringify(message.draft).length > 16000) return;
    chrome.storage.local.set({ [DRAFT_KEY]: { ...message.draft, createdAt: message.draft.createdAt || Date.now(), savedAt: Date.now() } }).then(() => respond(true));
    return true;
  }
  if (message.type === 'draft:clear') {
    chrome.storage.local.remove(DRAFT_KEY).then(() => respond(true));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => chrome.storage.local.get(DRAFT_KEY).then(({ [DRAFT_KEY]: draft }) => {
  if (draft && Date.now() - draft.createdAt >= DAY) chrome.storage.local.remove(DRAFT_KEY);
}));
chrome.permissions.onRemoved.addListener(({ origins }) => {
  const ids = [];
  if (origins?.some((origin) => origin.includes('checkout.stripe.com'))) ids.push('detect-stripe');
  if (origins?.some((origin) => origin.includes('paddle.com'))) ids.push('detect-paddle');
  if (ids.length) chrome.scripting.unregisterContentScripts({ ids }).catch(() => {});
});
