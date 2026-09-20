import { parseCapture } from './parser.js';

// Configured by the user. The extension holds no Supabase key or session.
let appOrigin = '';
const fields = [
  ['amount', 'Recurring amount'], ['currency', 'Currency (ISO)'], ['interval', 'Billing interval'], ['trial_period', 'Trial period'],
  ['trial_end', 'Trial end (YYYY-MM-DD)'], ['next_bill', 'Next bill (YYYY-MM-DD)'], ['cutoff', 'Cancellation cutoff (YYYY-MM-DD)']
];
let draft = null;
let permissionOrigin = '';
const $ = (id) => document.getElementById(id);
const message = (value) => { $('notice').textContent = value; };
chrome.storage.local.get('commit.appOrigin').then((item) => {
  appOrigin = item['commit.appOrigin'] || '';
  if (appOrigin) $('manual').href = `${appOrigin}/add`;
  else { $('manual').textContent = 'Set Commit web address'; $('manual').href = 'options.html'; }
});

function render() {
  $('editor').hidden = !draft;
  if (!draft) return;
  $('site').textContent = `${draft.site} · ${draft.host}`;
  $('merchant').value = draft.merchant || '';
  $('fields').replaceChildren();
  for (const [key, label] of fields) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.id = `field-${key}`;
    input.value = draft.fields[key]?.value || '';
    input.maxLength = 80;
    wrapper.append(input);
    const excerpt = document.createElement('span');
    excerpt.className = 'excerpt';
    excerpt.textContent = draft.fields[key]?.excerpt ? `Source: ${draft.fields[key].excerpt}` : 'Not found on this page';
    wrapper.append(excerpt);
    $('fields').append(wrapper);
  }
  document.querySelector(`[name=intention][value=${draft.intention || 'review'}]`).checked = true;
  $('purchased').checked = Boolean(draft.purchased);
  $('send').disabled = !draft.purchased;
}

function readForm() {
  draft.merchant = $('merchant').value.trim();
  for (const [key] of fields) draft.fields[key].value = $(`field-${key}`).value.trim();
  draft.intention = document.querySelector('[name=intention]:checked').value;
  draft.purchased = $('purchased').checked;
}

async function save() {
  readForm();
  await chrome.runtime.sendMessage({ type: 'draft:save', draft });
  message('Saved on this device for up to 24 hours. No reminders are scheduled.');
}

async function capture() {
  message('Reading visible subscription terms…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open a checkout page first.');
    updatePermission(tab.url);
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
    if (!result) throw new Error('The page could not be read.');
    const parsed = parseCapture(result);
    if (!parsed.recurring) message('No clear recurring terms found. You can enter and verify them manually.');
    else message('Check each proposed field against the page. Unknown terms stay blank.');
    draft = { ...parsed, requestId: crypto.randomUUID(), createdAt: Date.now(), intention: 'review', purchased: false };
    render();
    await chrome.runtime.sendMessage({ type: 'draft:save', draft });
  } catch (error) { message(error.message || 'Capture failed. Use manual entry.'); }
}

async function updatePermission(url) {
  const host = new URL(url).hostname;
  permissionOrigin = host === 'checkout.stripe.com' ? 'https://checkout.stripe.com/*'
    : host === 'paddle.com' || host.endsWith('.paddle.com') ? 'https://*.paddle.com/*' : '';
  if (!permissionOrigin) return;
  const granted = await chrome.permissions.contains({ origins: [permissionOrigin] });
  $('sitePermission').hidden = granted;
  $('revokePermission').hidden = !granted;
}

$('sitePermission').addEventListener('click', async () => {
  if (!permissionOrigin) return;
  const granted = await chrome.permissions.request({ origins: [permissionOrigin] });
  if (!granted) return message('Site access denied. Current-page capture and manual entry still work.');
  await chrome.scripting.registerContentScripts([{ id: `detect-${permissionOrigin.includes('stripe') ? 'stripe' : 'paddle'}`, matches: [permissionOrigin], js: ['detector.js'], runAt: 'document_idle' }]).catch(() => {});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) await updatePermission(tab.url);
  message('Detection enabled for this supported site. Only a badge signal leaves the page until you click Capture.');
});
$('revokePermission').addEventListener('click', async () => {
  if (!permissionOrigin) return;
  await chrome.permissions.remove({ origins: [permissionOrigin] });
  await chrome.scripting.unregisterContentScripts({ ids: [`detect-${permissionOrigin.includes('stripe') ? 'stripe' : 'paddle'}`] }).catch(() => {});
  $('sitePermission').hidden = false; $('revokePermission').hidden = true;
  message('Site detection turned off.');
});

async function send() {
  readForm();
  if (!draft.purchased) return message('Confirm that the purchase completed first.');
  if (!appOrigin) return message('Set your Commit web address in extension settings first.');
  if (!draft.merchant) return message('Enter a merchant name.');
  if (!/^[A-Z]{3}$/.test(draft.fields.currency.value)) return message('Enter a three-letter currency before importing.');
  if (Object.keys(draft.fields).some((key) => key.endsWith('bill') || key.endsWith('end') || key === 'cutoff' ? draft.fields[key].value && !/^\d{4}-\d{2}-\d{2}$/.test(draft.fields[key].value) : false)) return message('Use YYYY-MM-DD for dates.');
  await chrome.runtime.sendMessage({ type: 'draft:save', draft });
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(draft))));
  await chrome.tabs.create({ url: `${appOrigin}/capture/import#payload=${encodeURIComponent(encoded)}` });
  message('Opened Commit. Finish review there before any schedule becomes active.');
}

$('capture').addEventListener('click', capture);
$('save').addEventListener('click', save);
$('send').addEventListener('click', send);
$('discard').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'draft:clear' }); draft = null; render(); message('Draft discarded.'); });
$('editor').addEventListener('input', () => { $('send').disabled = !$('purchased').checked; });
chrome.runtime.sendMessage({ type: 'draft:get' }).then((saved) => { if (saved) { draft = saved; render(); message('Pending draft restored from this device.'); } });
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => { if (tab?.url?.startsWith('https:')) updatePermission(tab.url); });
