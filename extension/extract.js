// Injected only after the user clicks Capture, or after optional site permission.
// Never traverse inputs, frames, scripts, or the full document HTML.
(() => {
  const host = location.hostname.toLowerCase();
  const supported = host === 'checkout.stripe.com' ? 'Stripe Checkout'
    : (host === 'paddle.com' || host.endsWith('.paddle.com')) ? 'Paddle Checkout' : null;
  const selectors = supported === 'Stripe Checkout'
    ? ['[data-testid="product-summary"]', '[data-testid="order-summary"]', 'main', '[role="main"]']
    : supported === 'Paddle Checkout'
      ? ['[data-testid="checkout"]', '.paddle-checkout', 'main', '[role="main"]']
      : ['main', '[role="main"]', 'body'];
  const safeText = (node) => {
    if (!node || ['INPUT', 'TEXTAREA', 'SELECT', 'SCRIPT', 'STYLE'].includes(node.nodeName)) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('input,textarea,select,script,style,iframe,[autocomplete],form,[contenteditable], [type="password"], [type="email"], [type="tel"]').forEach((el) => el.remove());
    copy.querySelectorAll('p,li,div,section,h1,h2,h3').forEach((el) => el.append('\n'));
    return (copy.textContent || '').slice(0, 5000);
  };
  let text = '';
  for (const selector of selectors) {
    text = safeText(document.querySelector(selector));
    if (text.length >= 20) break;
  }
  // Return only short, relevant sentences. Discard the raw page text immediately.
  const chunks = text.split(/[\r\n]+|(?<=[.!?])\s+/).map((s) => s.replace(/\s+/g, ' ').trim());
  const relevant = chunks.filter((s) => s.length <= 280 && /subscri|recurr|renew|bill|per month|per year|every month|every year|trial|cancel|€|£|\$/.test(s.toLowerCase())).slice(0, 12);
  const redact = (s) => s.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted card number]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted email]');
  const excerpts = relevant.map(redact);
  return { host, supported, title: redact((document.title || '').slice(0, 100)), excerpts };
})()
