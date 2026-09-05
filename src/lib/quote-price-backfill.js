const { buildAutomaticQuotePricing } = require('./quote-auto-pricing');

// Only fill missing prices on open requests. Existing commercial agreements and
// manually edited line structures must remain unchanged.
function buildMissingPricePatch(record) {
  if (!['new', 'review'].includes(record.status) || record.sentAt || record.clientDecision || record.orderTransactionId) return null;
  const saved = record.quote || {};
  if (saved.documentType && saved.documentType !== 'quotation') return null;
  if (saved.currency && !['Rs', 'MUR'].includes(saved.currency)) return null;
  const pricing = buildAutomaticQuotePricing(record);
  const existing = Array.isArray(saved.lines) && saved.lines.length ? saved.lines : null;
  if (existing && (existing.length !== pricing.lines.length || existing.some((line, i) => Number(line.quantity) !== pricing.lines[i].quantity))) return null;
  let changed = 0;
  const lines = pricing.lines.map((automatic, index) => {
    const line = existing?.[index];
    if (line && (Number(line.unitPrice) > 0 || line.priceSource === 'manual' || line.includeInTotals === false)) return line;
    if (!automatic.unitPrice) return line || { description: automatic.description, quantity: automatic.quantity, unitPrice: 0, includeInTotals: true };
    changed++;
    return { ...line, description: automatic.description, quantity: automatic.quantity, unitPrice: automatic.unitPrice, includeInTotals: true, priceSource: 'automatic', priceSetByName: 'Website pricing', priceSetAtIso: new Date().toISOString() };
  });
  if (!changed) return null;
  const deliveryFee = saved.deliveryFee ?? pricing.deliveryFee;
  const subtotal = Math.round(lines.reduce((sum, line) => sum + (line.includeInTotals === false ? 0 : Number(line.quantity) * Number(line.unitPrice || 0)), 0) * 100) / 100;
  const total = Math.max(0, Math.round((subtotal + Number(deliveryFee) - Number(saved.discount || 0)) * 100) / 100);
  return {
    quote: { documentType: 'quotation', currency: 'Rs', paymentStatus: 'Quotation only', ...saved, lines, subtotal, deliveryFee, total },
    automaticPricing: { ...record.automaticPricing, source: 'website-print-placement', pricedLineCount: lines.filter(line => Number(line.unitPrice) > 0).length, lineCount: lines.length, requiresReview: lines.some(line => !(Number(line.unitPrice) > 0)) },
  };
}
module.exports = { buildMissingPricePatch };
