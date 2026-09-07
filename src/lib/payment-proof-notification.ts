import { SITE_URL } from "@/lib/seo";
import { quotationPaymentSummary } from "@/lib/quotation-payment";

const RECIPIENT = "ryanchutooree@gmail.com";

type PaymentProofNotification = {
  quoteId: string;
  quoteData: Record<string, unknown>;
  filename: string;
  contentType: string;
  buffer: Buffer;
};

export function buildPaymentProofNotification(input: PaymentProofNotification) {
  const quote = input.quoteData.quote && typeof input.quoteData.quote === "object"
    ? input.quoteData.quote as Record<string, unknown> : {};
  const { reference, amount } = quotationPaymentSummary(quote, input.quoteId);
  const name = typeof input.quoteData.name === "string" ? input.quoteData.name : "Client";
  const email = typeof input.quoteData.email === "string" ? input.quoteData.email : "Not provided";
  const reviewUrl = `${SITE_URL}/admin/quotation-approval?quoteId=${encodeURIComponent(input.quoteId)}`;
  return {
    to: RECIPIENT,
    subject: `Payment proof uploaded — ${reference.replace(/[\r\n]/g, " ")}`,
    text: `A client has uploaded payment proof.\n\nClient: ${name}\nEmail: ${email}\nQuotation: ${reference}\nOutstanding quotation amount: ${amount}\n\nThe screenshot is attached. Payment is awaiting your verification; it has not been marked as paid.\n\nReview quotation: ${reviewUrl}\n\nMO T-SHIRT`,
    attachments: [{ filename: input.filename, contentType: input.contentType, content: input.buffer }],
  };
}

export async function sendPaymentProofNotification(input: PaymentProofNotification) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("Payment proof email is not configured.");
  // @ts-expect-error nodemailer has no local type declarations
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transporter.sendMail({
    ...buildPaymentProofNotification(input),
    from: { name: "MO T-SHIRT", address: user },
  });
}
