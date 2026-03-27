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

function sizeBreakdownPrompt(lead: AssistantLead) {
  return [
    "Please send the full garment breakdown in one message, one line per garment, color, and size, like this:",
    "",
    "Copy, edit, and send this size template:",
    "```",
    buildSizeTemplate(lead),
    "```",
    "Replace each quantity with the real count, delete any lines you do not need, and add extra lines if you have more than one garment or color.",
    "",
    "You can also answer naturally, for example: T-Shirt white M x 2 and Poloshirt black 4XL x 1.",
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
