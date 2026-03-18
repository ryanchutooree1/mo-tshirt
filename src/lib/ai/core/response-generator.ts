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

export function formatAssistantFieldLabel(field: AssistantRequiredField) {
  switch (field) {
    case "productType":
      return "product";
    case "quantity":
      return "quantity";
    case "printPositions":
      return "print position";
    case "sizeBreakdown":
      return "size breakdown";
    case "clientName":
      return "name";
    case "email":
      return "email";
    case "phone":
      return "WhatsApp number";
    case "deadline":
      return "deadline";
    default:
      return field;
  }
}

export function formatLeadSummary(lead: AssistantLead) {
  const rows: string[] = [];
  rows.push(`Product: ${lead.productType ? titleCase(lead.productType) : "Not set"}`);
  if (lead.quantity) rows.push(`Total qty: ${lead.quantity}`);
  if (lead.color) rows.push(`Color: ${titleCase(lead.color)}`);
  if (lead.sizeBreakdown.length) {
    rows.push(
      `Selected sizes: ${lead.sizeBreakdown
        .map((line) => `${line.size} x ${line.quantity}`)
        .join(", ")}`
    );
  }
  if (lead.printPositions.length) rows.push(`Print: ${lead.printPositions.map(titleCase).join(", ")}`);
  if (lead.printType) rows.push(`Print type: ${titleCase(lead.printType)}`);
  if (lead.deliveryMethod) rows.push(`Delivery: ${titleCase(lead.deliveryMethod)}`);
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
    "Please send the full size breakdown in one message, one line per variation, like this:",
    "",
    "Copy, edit, and send this size template:",
    "```",
    buildSizeTemplate(lead),
    "```",
    "Replace each quantity with the real count and delete any size lines you do not need.",
    "",
    "You can also answer naturally, for example: 2 XL and 1 M.",
  ].join("\n");
}

function shouldPromptForLogoUpload(lead: AssistantLead, missingFields: AssistantRequiredField[]) {
  return !missingFields.includes("sizeBreakdown") && !lead.logoAttachment && !lead.logoPending && lead.logoReady !== false;
}

function nextContactPrompt(missingFields: AssistantRequiredField[]) {
  if (missingFields.includes("clientName")) return "What is your name?";
  if (missingFields.includes("email")) return "What is your email address so we can reply to you later?";
  if (missingFields.includes("phone")) return "What is your WhatsApp number so we can reply to you later?";
  if (missingFields.includes("deadline")) return "What is your deadline?";
  return "Please confirm the remaining order details.";
}

function promptForMissingField(field: AssistantRequiredField, lead: AssistantLead) {
  switch (field) {
    case "productType":
      return "What product do you need: T-Shirt, Polo, Hoodie, or Cap?";
    case "quantity":
      return "How many pieces do you need?";
    case "printPositions":
      return "Where do you want the print: front left chest, front center, back, sleeve, small front and small back, small front and large back, or large front and large back?";
    case "sizeBreakdown":
      return sizeBreakdownPrompt(lead);
    case "clientName":
      return "What is your name?";
    case "email":
      return "What is your email address so we can reply to you later?";
    case "phone":
      return "What is your WhatsApp number so we can reply to you later?";
    case "deadline":
      return "What is your deadline?";
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
  const { lead, decision, missingFields, retrievalMatches } = input;
  const candidates: ResponseCandidate[] = [];

  if (input.attachmentReceived) {
    candidates.push({
      text: `Logo received and attached to your request. ${nextContactPrompt(missingFields)}`,
      score: 1,
    });
  }

  if (input.logoPendingAcknowledged) {
    candidates.push({
      text: `Logo noted. The file is pending upload for now. ${nextContactPrompt(missingFields)}`,
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
      text: "If the design or logo is ready, upload it as PNG, JPG, PDF, or AI. As soon as it is attached, I will collect your name, email address, WhatsApp number, and deadline.",
      score: 1.15,
    });
  }

  if (decision.action === "suggest_best_option" && decision.targetField) {
    const topMatch = retrievalMatches[0];
    const baseQuestion = promptForMissingField(decision.targetField, lead);
    if (topMatch?.kind === "approved_summary" || topMatch?.kind === "past_lead") {
      candidates.push({
        text: `A similar approved order used this setup: ${topMatch.text}.\n\n${baseQuestion}`,
        score: 0.92,
      });
    }
    candidates.push({
      text: baseQuestion,
      score: 0.88,
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
      text: "I’m not fully confident about that message yet. Please restate the request with the product, quantity, print, and any deadline so I can capture it properly.",
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
