import type {
  AssistantDecision,
  AssistantLead,
  AssistantRequiredField,
  AssistantRetrievalMatch,
} from "./types.ts";
import { titleCase } from "./utils.ts";

const SIZE_TEMPLATE_ORDER = ["S", "M", "L", "XL"] as const;

type ResponseCandidate = {
  text: string;
  score: number;
};

function formatProductLabel(value: string | null | undefined) {
  if (!value) return "Custom item";
  if (value === "t-shirt") return "T-Shirt";
  if (value === "polo") return "Poloshirt";
  return titleCase(value);
}

function formatProductLabelPlural(value: string | null | undefined, quantity: number | null | undefined) {
  const base = formatProductLabel(value);
  if (!quantity || quantity === 1) return base;
  if (base === "Poloshirt") return "Poloshirts";
  if (base.endsWith("y")) return `${base.slice(0, -1)}ies`;
  if (base.endsWith("s")) return base;
  return `${base}s`;
}

function formatPrintMethodLabel(value: string | null | undefined) {
  if (!value) return "";
  if (value === "dtf printing") return "DTF Printing";
  if (value === "vinyl heat press") return "Vinyl Heat Press";
  if (value === "screen printing") return "Screen Printing";
  if (value === "not sure") return "Not sure";
  return titleCase(value);
}

function formatDeliveryMethodLabel(value: AssistantLead["deliveryMethod"]) {
  if (value === "pickup") return "Surinam Pickup";
  if (value === "delivery") return "Delivery";
  return "";
}

export function formatAssistantFieldLabel(field: AssistantRequiredField) {
  switch (field) {
    case "sizeBreakdown":
      return "garment breakdown";
    case "printType":
      return "print method";
    case "deliveryMethod":
      return "delivery method";
    case "clientName":
      return "name";
    case "email":
      return "email";
    case "phone":
      return "WhatsApp number";
    default:
      return field;
  }
}

export function formatLeadSummary(lead: AssistantLead) {
  const rows: string[] = [];
  if (lead.sizeBreakdown.length) {
    rows.push(
      `Garments: ${lead.sizeBreakdown
        .map((line) => {
          const product = formatProductLabel(line.productType || lead.productType);
          const color = line.color || lead.color;
          const variant = [color ? titleCase(color) : null, line.size].filter(Boolean).join(" / ");
          return `${product}${variant ? ` (${variant})` : ""} x ${line.quantity}`;
        })
        .join("; ")}`
    );
  } else {
    rows.push(`Product: ${lead.productType ? formatProductLabel(lead.productType) : "Not set"}`);
  }
  if (lead.quantity) rows.push(`Total qty: ${lead.quantity}`);
  if (lead.color) rows.push(`Color: ${titleCase(lead.color)}`);
  if (lead.printPositions.length) rows.push(`Print: ${lead.printPositions.map(titleCase).join(", ")}`);
  if (lead.printType) rows.push(`Print method: ${formatPrintMethodLabel(lead.printType)}`);
  if (lead.deliveryMethod) rows.push(`Delivery: ${formatDeliveryMethodLabel(lead.deliveryMethod)}`);
  if (lead.deadline) rows.push(`Deadline: ${lead.deadline}`);
  if (lead.clientName) rows.push(`Client: ${lead.clientName}`);
  if (lead.companyName) rows.push(`Company: ${lead.companyName}`);
  if (lead.email) rows.push(`Email: ${lead.email}`);
  if (lead.phone) rows.push(`Phone: ${lead.phone}`);
  if (lead.logoAttachment?.name) rows.push(`Logo file: ${lead.logoAttachment.name}`);
  else if (lead.logoPending) rows.push("Logo pending: Yes");
  return rows.join("\n");
}

function buildSizeTemplate(lead: AssistantLead) {
  const product = lead.productType ? titleCase(lead.productType) : "T-Shirt";
  const color = lead.color ? titleCase(lead.color) : "Black";
  const quantities = new Map(lead.sizeBreakdown.map((line) => [line.size, line.quantity]));
  return SIZE_TEMPLATE_ORDER.map(
    (size) => `Product: ${product} Colour: ${color} Size: ${size} Quantity: ${quantities.get(size) || 0}`
  ).join("\n");
}

function buildExistingBreakdownTemplate(lead: AssistantLead) {
  return lead.sizeBreakdown
    .map((line) => {
      const product = formatProductLabel(line.productType || lead.productType);
      const color = titleCase(line.color || lead.color || "Black");
      return `Product: ${product} Colour: ${color} Size: ${line.size} Quantity: ${line.quantity}`;
    })
    .join("\n");
}

function buildCopyEditSendBlock(lead: AssistantLead) {
  const template = lead.sizeBreakdown.length ? buildExistingBreakdownTemplate(lead) : buildSizeTemplate(lead);

  return [
    "Copy, edit, and send this size template:",
    "```",
    template,
    "```",
    "You can also answer naturally, for example: T-Shirt white M x 2 and Poloshirt black 4XL x 1.",
  ].join("\n");
}

function formatKnownOrderStub(lead: AssistantLead) {
  const quantity = lead.quantity || null;
  const product = formatProductLabelPlural(lead.productType, quantity);
  const sizeList = lead.sizes.join(", ");
  const parts = [
    quantity ? `${quantity}` : "",
    lead.color ? titleCase(lead.color) : "",
    product !== "Custom item" ? product : "",
    sizeList ? `in size${lead.sizes.length > 1 ? "s" : ""} ${sizeList}` : "",
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function formatOrderHeading(lead: AssistantLead) {
  return [
    lead.quantity ? `${lead.quantity}` : "",
    lead.color ? titleCase(lead.color) : "",
    lead.productType ? formatProductLabelPlural(lead.productType, lead.quantity) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBreakdownSummary(lead: AssistantLead) {
  return lead.sizeBreakdown.map((line) => `${line.size} x ${line.quantity}`).join(" and ");
}

function targetedSizeBreakdownPrompt(lead: AssistantLead) {
  const knownOrder = formatKnownOrderStub(lead);
  const orderHeading = formatOrderHeading(lead);
  const breakdownTotal = lead.sizeBreakdown.reduce((sum, line) => sum + line.quantity, 0);
  const remaining = lead.quantity && breakdownTotal < lead.quantity ? lead.quantity - breakdownTotal : 0;
  const breakdownSummary = formatBreakdownSummary(lead);

  if (!lead.productType && (lead.quantity || lead.color || lead.sizes.length)) {
    return "I already have part of the order. What garment do you need, and what color and size should I quote?";
  }

  if (lead.productType && lead.quantity && lead.color && lead.sizeBreakdown.length && remaining > 0) {
    return `Noted: ${orderHeading} with ${breakdownSummary}. What size is the remaining ${remaining} piece${remaining > 1 ? "s" : ""}?`;
  }

  if (lead.productType && lead.quantity && !lead.color && lead.sizeBreakdown.length && remaining > 0) {
    return `Noted: ${orderHeading} with ${breakdownSummary}. What color do you need, and what about the remaining ${remaining} piece${remaining > 1 ? "s" : ""}?`;
  }

  if (lead.productType && !lead.quantity && lead.color && lead.sizes.length === 1) {
    return `Noted: ${titleCase(lead.color)} ${formatProductLabel(lead.productType)} in size ${lead.sizes[0]}. How many pieces do you need?`;
  }

  if (lead.productType && !lead.quantity && lead.color) {
    return `Noted: ${titleCase(lead.color)} ${formatProductLabelPlural(lead.productType, 2)}. How many pieces do you need, and what is the size breakdown?`;
  }

  if (lead.productType && !lead.quantity && lead.sizes.length === 1) {
    return `Noted: ${formatProductLabel(lead.productType)} in size ${lead.sizes[0]}. How many pieces do you need, and what color should I quote?`;
  }

  if (lead.productType && lead.quantity && !lead.color && !lead.sizes.length) {
    return `Noted: ${knownOrder}. What color and size do you need? If the sizes are mixed, send a quick breakdown like M x 2 and L x 2.`;
  }

  if (lead.productType && lead.quantity && lead.color && !lead.sizes.length) {
    return `Noted: ${knownOrder}. What size do you need? If the sizes are mixed, send a quick breakdown like M x 2 and L x 2.`;
  }

  if (lead.productType && lead.quantity && !lead.color && lead.sizes.length === 1) {
    return `Noted: ${knownOrder}. What color do you need?`;
  }

  if (lead.productType && lead.quantity && !lead.color && lead.sizes.length > 1) {
    return `Noted: ${knownOrder}. What color do you need for these ${formatProductLabelPlural(lead.productType, lead.quantity)}?`;
  }

  if (lead.productType && lead.quantity && lead.color && lead.sizes.length > 1) {
    return `Noted: ${knownOrder}. How many pieces do you need in each size?`;
  }

  return null;
}

function sizeBreakdownPrompt(lead: AssistantLead) {
  const targetedPrompt = targetedSizeBreakdownPrompt(lead);
  if (targetedPrompt) {
    return [targetedPrompt, "", buildCopyEditSendBlock(lead)].join("\n");
  }

  return [
    "Please send the full garment breakdown in one message, one line per garment, color, and size, like this:",
    "",
    buildCopyEditSendBlock(lead),
    "",
    "Replace each quantity with the real count, delete any lines you do not need, and add extra lines if you have more than one garment or color.",
  ].join("\n");
}

function shouldPromptForLogoUpload(lead: AssistantLead, missingFields: AssistantRequiredField[]) {
  return (
    !missingFields.includes("sizeBreakdown") &&
    !lead.logoAttachment &&
    !lead.logoPending &&
    lead.logoReady !== false &&
    missingFields.includes("printType")
  );
}

function nextMissingFieldPrompt(lead: AssistantLead, missingFields: AssistantRequiredField[]) {
  if (missingFields.length) {
    return promptForMissingField(missingFields[0], lead);
  }
  return "Please confirm the remaining order details.";
}

function promptForMissingField(field: AssistantRequiredField, lead: AssistantLead) {
  switch (field) {
    case "sizeBreakdown":
      return sizeBreakdownPrompt(lead);
    case "printType":
      return "What print method do you want: DTF Printing, Vinyl Heat Press, Screen Printing, or Not sure?";
    case "deliveryMethod":
      return "How would you like to receive the order: Surinam pickup or delivery?";
    case "clientName":
      return "What is your name?";
    case "email":
      return "What is your email address so we can reply to you later?";
    case "phone":
      return "What is your WhatsApp number so we can reply to you later?";
    default:
      return `Please send the ${formatAssistantFieldLabel(field)}.`;
  }
}

function rankResponse(candidates: ResponseCandidate[]) {
  return candidates.sort((left, right) => right.score - left.score || left.text.length - right.text.length)[0];
}

export function generateAssistantReply(input: {
  lead: AssistantLead;
  decision: AssistantDecision;
  missingFields: AssistantRequiredField[];
  retrievalMatches: AssistantRetrievalMatch[];
  conflicts: Array<{ field: string; values: unknown[]; explanation: string }>;
  explicitSummaryRequest: boolean;
  attachmentReceived: boolean;
  logoPendingAcknowledged: boolean;
}) {
  const { lead, decision, missingFields } = input;
  const candidates: ResponseCandidate[] = [];

  if (input.attachmentReceived) {
    candidates.push({
      text: `Logo received and attached to your request. ${nextMissingFieldPrompt(lead, missingFields)}`,
      score: 1,
    });
  }

  if (input.logoPendingAcknowledged) {
    candidates.push({
      text: `Logo noted. The file is pending upload for now. ${nextMissingFieldPrompt(lead, missingFields)}`,
      score: 0.95,
    });
  }

  if (input.explicitSummaryRequest || decision.action === "generate_summary") {
    candidates.push({
      text: `Lead summary:\n${formatLeadSummary(lead)}`,
      score: input.explicitSummaryRequest ? 1.2 : 0.6,
    });
  }

  if (decision.action === "answer_faq" && decision.faqMatch?.answer) {
    candidates.push({
      text: decision.faqMatch.answer,
      score: 1.05,
    });
  }

  if (decision.action === "clarify_ambiguous_field" && input.conflicts[0]) {
    const conflict = input.conflicts[0];
    candidates.push({
      text: `I picked up conflicting ${conflict.field.replace(/_/g, " ")} details. Please resend that part clearly so I can continue.`,
      score: 1.1,
    });
  }

  if (shouldPromptForLogoUpload(lead, missingFields)) {
    candidates.push({
      text: "If the design or logo is ready, use the upload button here to attach it now.",
      score: 1.15,
    });
  }

  if (decision.action === "suggest_best_option" && decision.targetField) {
    const baseQuestion = promptForMissingField(decision.targetField, lead);
    candidates.push({
      text: baseQuestion,
      score: 0.92,
    });
  }

  if (decision.action === "ask_missing_field" && decision.targetField) {
    candidates.push({
      text: promptForMissingField(decision.targetField, lead),
      score: 0.9,
    });
  }

  if (decision.action === "escalate_to_human") {
    candidates.push({
      text: "I’m not fully confident about that message yet. Please restate the request with the garments, print method, delivery method, and contact details so I can capture it properly.",
      score: 0.85,
    });
  }

  if (!candidates.length) {
    candidates.push({
      text: missingFields.length ? promptForMissingField(missingFields[0], lead) : `Lead summary:\n${formatLeadSummary(lead)}`,
      score: 0.5,
    });
  }

  return rankResponse(candidates).text;
}
