import type { EmailQuoteDraft } from "./email-quote.ts";
import type { InboxMessage } from "./gmail-inbox.ts";

export type IntakeItem = { product: string; quantity: number | ""; colour: string; sizes: string; printMethod: string; placement: string; artwork: string };
export type MissingDetail = { key: string; label: string; question: string };
export type IntakeAnalysis = { classification: "enquiry" | "other" | "uncertain"; confidence: number; language: "en" | "fr"; summary: string; draft: EmailQuoteDraft; items: IntakeItem[]; missing: MissingDetail[]; warnings: string[] };
export type EmailIntake = IntakeAnalysis & { id: string; threadId: string; version: string; subject: string; email: string; lastMessage: InboxMessage; status: "needs_details" | "waiting" | "ready" | "review" | "ignored" | "error"; quoteId?: string; updatedAtIso: string; lastReplyAt: string; error?: string; sendState?: "sending" | "sent" | "unknown"; sentVersion?: string; sentAtIso?: string; outboundMessageId?: string; originalText: string; attachmentNames: string[] };
export function mailboxAddress(value: string) { return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || ""; }
export function plainClientText(message: InboxMessage) {
  return (message.text || message.snippet).split(/\n(?:On .+wrote:|Le .+écrit\s*:|>{1,}|-{2,}\s*(?:Original Message|Forwarded message))/i)[0];
}
export function getMissingDetails(draft: EmailQuoteDraft, items: IntakeItem[], language: "en" | "fr"): MissingDetail[] {
  const missing: MissingDetail[] = [];
  const add = (key: string, label: string, en: string, fr: string) => missing.push({ key, label, question: language === "fr" ? fr : en });
  if (!draft.name) add("name", "Contact name", "What is your full name?", "Quel est votre nom complet ?");
  if (!draft.phone) add("phone", "Phone / WhatsApp", "What phone or WhatsApp number can we contact you on?", "Quel est votre numéro de téléphone ou WhatsApp ?");
  if (!items.length) add("products", "Products", "Which garments or products would you like us to quote for?", "Quels vêtements ou produits souhaitez-vous faire chiffrer ?");
  items.forEach((item, index) => {
    const prefix = `${index + 1}. ${item.product || (language === "fr" ? "Article" : "Item")}`;
    if (!item.product) add(`item${index}.product`, "Product", `For item ${index + 1}, which garment or product do you need?`, `Pour l’article ${index + 1}, quel vêtement ou produit souhaitez-vous ?`);
    if (!item.quantity) add(`item${index}.quantity`, `${prefix}: quantity`, `For ${prefix}, how many pieces do you need?`, `Pour ${prefix}, combien de pièces souhaitez-vous ?`);
    if (!item.colour) add(`item${index}.colour`, `${prefix}: colour`, `For ${prefix}, what garment colour(s) would you like?`, `Pour ${prefix}, quelle(s) couleur(s) de vêtement souhaitez-vous ?`);
    if (!item.sizes && !/\b(cap|caps|casquette|casquettes|sash|sashes)\b/i.test(item.product)) add(`item${index}.sizes`, `${prefix}: sizes`, `For ${prefix}, please provide the sizes and quantity per size.`, `Pour ${prefix}, merci d’indiquer les tailles et la quantité par taille.`);
    const blank = /^(none|no print|blank|sans impression|sans personnalisation|plain)$/i.test(item.printMethod.trim());
    if (!item.printMethod) add(`item${index}.printMethod`, `${prefix}: personalisation`, `For ${prefix}, do you need printing, embroidery, or plain garments? If unsure, describe the finish you want.`, `Pour ${prefix}, souhaitez-vous une impression, une broderie ou des vêtements sans personnalisation ? Si vous hésitez, décrivez le résultat souhaité.`);
    if (!blank && !item.placement) add(`item${index}.placement`, `${prefix}: print position`, `For ${prefix}, where should the design go (front, back, sleeve), and approximately how large?`, `Pour ${prefix}, où placer le visuel (devant, dos, manche), et dans quelles dimensions approximatives ?`);
    if (!blank && !item.artwork) add(`item${index}.artwork`, `${prefix}: artwork`, `For ${prefix}, please attach your logo/design, or describe the text and design you need.`, `Pour ${prefix}, merci de joindre votre logo/visuel, ou de décrire le texte et le design souhaités.`);
  });
  if (!draft.deadline) add("deadline", "Required date", "When do you need the order? You can also say that your date is flexible.", "Pour quelle date souhaitez-vous la commande ? Vous pouvez aussi préciser que la date est flexible.");
  if (!draft.delivery) add("delivery", "Collection / delivery", "Will you collect the order, or do you need delivery? If delivery, please give the address.", "Souhaitez-vous récupérer la commande ou être livré(e) ? Pour une livraison, merci de préciser l’adresse.");
  else if (/deliver|courier|ship|livrai|expédi/i.test(draft.delivery) && !/collect|pickup|pick.up|retrait|récup/i.test(draft.delivery) && !draft.address) add("address", "Delivery address", "What is the delivery address?", "Quelle est l’adresse de livraison ?");
  return missing;
}
export function questionEmail(intake: Pick<EmailIntake, "language" | "draft" | "missing" | "subject" | "email">) {
  const french = intake.language === "fr";
  const name = intake.draft.name.split(/\s+/)[0] || "";
  return {
    to: intake.email,
    subject: /^re:/i.test(intake.subject) ? intake.subject : `Re: ${intake.subject}`,
    text: `${french ? "Bonjour" : "Hi"}${name ? ` ${name}` : ""},\n\n${french ? "Merci pour votre demande. Pour préparer votre devis MO T-SHIRT, pourriez-vous préciser les éléments suivants ?" : "Thank you for your enquiry. To prepare your MO T-SHIRT quotation, could you please help us with the following details?"}\n\n${intake.missing.map((item, i) => `${i + 1}. ${item.question}`).join("\n\n")}\n\n${french ? "Répondez directement à cet email avec vos informations et éventuelles pièces jointes. Nous préparerons votre devis dès que les détails seront complets." : "Please reply directly to this email with your details and any artwork attachments. We will prepare your quotation once the details are complete."}\n\n${french ? "Merci," : "Thank you,"}\nMO T-SHIRT Team`,
  };
}
