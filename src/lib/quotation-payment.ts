export const JUICE_PHONE = "57701144";
export const PAYMENT_WHATSAPP_PHONE = "59883880";
export const JUICE_LOGO_PATH = "/payments/mcb-juice.png";
export const FULL_PAYMENT_TERM = `Full payment is required before production. Pay by MCB Juice on ${JUICE_PHONE}.`;

export function paymentWhatsAppUrl(reference: string, clientName = "") {
  const message = `Hello MO T-SHIRT, I am sending my payment proof for quotation ${reference}${clientName ? `. Name: ${clientName}` : ""}.`;
  return `https://wa.me/230${PAYMENT_WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

export function quotationPaymentSummary(quote: Record<string, unknown>, quoteId: string) {
  const total = Number(quote.total);
  const received = Math.max(0, Number(quote.amountReceived) || 0);
  const balance = quote.total == null || quote.total === "" || !Number.isFinite(total)
    ? null : Math.max(0, total - received);
  const currency = typeof quote.currency === "string" && quote.currency.trim() ? quote.currency.trim() : "Rs";
  return {
    reference: typeof quote.documentNumber === "string" && quote.documentNumber.trim()
      ? quote.documentNumber.trim() : quoteId.slice(-8).toUpperCase(),
    amount: balance === null ? "See the attached quotation" : `${currency} ${balance.toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    balance,
  };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildQuotationPaymentInstructions(quote: Record<string, unknown>, quoteId: string, clientName = "") {
  const { reference, amount, balance } = quotationPaymentSummary(quote, quoteId);
  const whatsapp = paymentWhatsAppUrl(reference, clientName);
  const instruction = balance === 0
    ? "No balance remains to pay. Please contact us if you need help with your payment proof."
    : `Please pay the full outstanding amount (${amount}) by MCB Juice on ${JUICE_PHONE} before production.`;
  const proof = `Click Accept quotation below to upload your payment screenshot. Alternatively, send the screenshot on WhatsApp to ${PAYMENT_WHATSAPP_PHONE}, mentioning your quotation reference ${reference} or your name. We will verify your payment before confirming it.`;
  return {
    text: `Payment details\nQuotation reference: ${reference}\n${instruction}\n\n${proof}\nWhatsApp: ${whatsapp}`,
    html: `<div style="margin-top:22px;padding:20px;border:1px solid #eadfe1;border-radius:12px;background:#fff8f9;">
      <img src="cid:mcb-juice" width="56" height="56" alt="MCB Juice" style="display:block;border-radius:12px;margin-bottom:12px;" />
      <h2 style="font-size:18px;margin:0 0 10px;">Payment details</h2>
      <p style="margin:0 0 8px;">Quotation reference: <strong>${escapeHtml(reference)}</strong></p>
      <p>${escapeHtml(instruction)}</p>
      <p>${escapeHtml(proof)}</p>
      <a href="${escapeHtml(whatsapp)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#16803c;color:#fff;text-decoration:none;font-weight:700;">Send payment proof on WhatsApp</a>
    </div>`,
  };
}
