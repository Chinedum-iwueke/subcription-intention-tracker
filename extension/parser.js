export function parseCapture(source) {
  const lines = source.excerpts || [];
  const joined = lines.join(' ');
  const recurring = !/\b(?:no|not)\s+(?:subscription|recurring|renewal)\b|\bone[- ](?:time|off)\b/i.test(joined)
    && /subscri|recurr|renew|per\s+(?:month|year|week)|every\s+(?:month|year|week)|monthly|annual|yearly/i.test(joined);
  const priceLine = lines.find((line) => /(?:€|£|\$)\s?\d+(?:[.,]\d{2})?/.test(line) && /per|monthly|annual|yearly|every|renew|recurr|bill/i.test(line));
  const price = priceLine?.match(/(€|£|\$)\s?(\d+(?:[.,]\d{2})?)/);
  const intervalLine = lines.find((line) => /(?:per|every)\s+(?:\d+\s+)?(?:day|week|month|year)|\bmonthly\b|\bannual(?:ly)?\b|\byearly\b/i.test(line));
  const intervalMatch = intervalLine?.match(/(?:per|every)\s+(\d+\s+)?(day|week|month|year)/i);
  const interval = intervalMatch ? `${intervalMatch[1] || '1 '}${intervalMatch[2].toLowerCase()}` : /monthly/i.test(intervalLine || '') ? '1 month' : /annual|yearly/i.test(intervalLine || '') ? '1 year' : '';
  const explicitDate = (text) => {
    if (!text) return '';
    const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return validDate(`${iso[1]}-${iso[2]}-${iso[3]}`);
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const month = months.join('|');
    const md = text.match(new RegExp(`\\b(${month})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, 'i'));
    const dm = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${month})\\s+(20\\d{2})\\b`, 'i'));
    const match = md || dm;
    if (!match) return '';
    const year = md ? match[3] : match[3];
    const monthIndex = months.indexOf((md ? match[1] : match[2]).toLowerCase()) + 1;
    const day = md ? match[2] : match[1];
    return validDate(`${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };
  const validDate = (value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : '';
  };
  const dated = (pattern) => {
    const excerpt = lines.find((line) => pattern.test(line) && explicitDate(line)) || '';
    return { value: explicitDate(excerpt), excerpt };
  };
  const trialLine = lines.find((line) => /\b\d+[- ](?:day|week|month)s?\s+(?:free\s+)?trial|\btrial\s+(?:for\s+)?\d+[- ](?:day|week|month)s?/i.test(line));
  const trialPeriod = trialLine?.match(/\b(\d+)[- ](day|week|month)s?/i);
  const field = (value, excerpt) => ({ value: value || '', excerpt: excerpt || '' });
  return {
    merchant: (source.title || source.host).split(/[|–—]/)[0].trim().slice(0, 80),
    site: source.supported || 'User-invoked page',
    host: source.host,
    recurring,
    excerpts: lines,
    fields: {
      amount: field(price ? price[2].replace(',', '.') : '', priceLine),
      currency: field(price ? ({ '€': 'EUR', '£': 'GBP', '$': 'USD' })[price[1]] : '', priceLine),
      interval: field(interval.trim(), intervalLine),
      trial_period: field(trialPeriod ? `${trialPeriod[1]} ${trialPeriod[2]}` : '', trialLine),
      trial_end: dated(/trial.{0,40}(?:end|until)|(?:end|until).{0,40}trial/i),
      next_bill: dated(/next\s+(?:bill|charge|renew)|(?:bill|charge|renew).{0,25}(?:on|from|starting)/i),
      cutoff: dated(/cancel\s+(?:by|before)|(?:cancellation|action)\s+cutoff/i)
    }
  };
}
