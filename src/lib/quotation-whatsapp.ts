export function normalizeWhatsAppPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /[^+\d\s().-]/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  else if (!trimmed.startsWith("+") && digits.length === 8) digits = `230${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function buildQuotationWhatsAppUrl(phone: string, name: string, reference: string, quotationUrl: string) {
  const number = normalizeWhatsAppPhone(phone);
  if (!number) throw new Error("Enter a valid client WhatsApp number, including the country code for overseas clients.");
  const message = `Hi ${name || "there"},\n\nYour MO T-SHIRT quotation ${reference} is ready.\n\nClick the link to view your quotation and upload your payment proof after payment:\n${quotationUrl}\n\nThank you,\nMO T-SHIRT`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
