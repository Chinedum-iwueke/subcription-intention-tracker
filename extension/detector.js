// Runs only on a site for which the user separately granted host permission.
// It sends a boolean detection signal, never page content.
const signal = () => {
  const container = document.querySelector('main,[role="main"]');
  if (!container) return;
  const copy = container.cloneNode(true);
  copy.querySelectorAll('form,input,textarea,select,script,style,iframe,[contenteditable]').forEach((node) => node.remove());
  const text = (copy.textContent || '').slice(0, 3500);
  if (/subscri|recurr|renew|per\s+(?:month|year)|monthly|annual|trial/i.test(text))
    chrome.runtime.sendMessage({ type: 'site:detected' });
};
signal();
