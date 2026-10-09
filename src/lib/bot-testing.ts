// Pure synthetic workflow. This module deliberately has no network or database dependencies.
export const TEST_SCENARIOS = [
  { id: "tees", label: "Team T-shirts", customer: "TEST · Example Team", product: "Sample printed T-shirt", quantity: 12, unitPrice: 300 },
  { id: "polos", label: "Restaurant polos", customer: "TEST · Example Restaurant", product: "Sample embroidered polo", quantity: 20, unitPrice: 450 },
  { id: "hoodies", label: "Club hoodies", customer: "TEST · Example Club", product: "Sample printed hoodie", quantity: 8, unitPrice: 900 },
] as const;

export type TestScenarioId = typeof TEST_SCENARIOS[number]["id"];
export type TestMessage = { role: "user" | "bot"; text: string };
export type TestState = {
  version: 1;
  scenarioId: TestScenarioId;
  quote: "none" | "draft" | "accepted" | "rejected";
  invoice: "none" | "unpaid" | "paid";
  messages: TestMessage[];
};
export const TEST_WELCOME = "Simulation ready. Choose a synthetic scenario, then ask me to create a quote, accept or reject it, create an invoice, or mark it paid. Every action stays in this test area.";

export function emptyTestState(scenarioId: TestScenarioId = "tees"): TestState {
  return { version: 1, scenarioId, quote: "none", invoice: "none", messages: [{ role: "bot", text: TEST_WELCOME }] };
}

export function testStorageKey(accountId: string) {
  return `mo-tshirt:bot-testing:v1:${encodeURIComponent(accountId)}`;
}

export function restoreTestState(raw: string | null): TestState {
  if (!raw || raw.length > 100_000) return emptyTestState();
  try {
    const state = JSON.parse(raw) as TestState;
    if (state.version !== 1 || !TEST_SCENARIOS.some(s => s.id === state.scenarioId)) return emptyTestState();
    if (!["none", "draft", "accepted", "rejected"].includes(state.quote) || !["none", "unpaid", "paid"].includes(state.invoice)) return emptyTestState();
    if (state.invoice !== "none" && state.quote !== "accepted") return emptyTestState();
    if (!Array.isArray(state.messages) || state.messages.length > 80 || state.messages.some(m => !m || !["user", "bot"].includes(m.role) || typeof m.text !== "string" || m.text.length > 2_000)) return emptyTestState();
    return { version: 1, scenarioId: state.scenarioId, quote: state.quote, invoice: state.invoice, messages: state.messages.map(m => ({ role: m.role, text: m.text })) };
  } catch { return emptyTestState(); }
}

const money = (value: number) => `MUR ${value.toLocaleString("en-US")}`;

export function simulateTestMessage(state: TestState, message: string): TestState {
  const text = message.trim().slice(0, 1_000);
  if (!text) return state;
  const command = text.toLowerCase().replace(/[.!?]+$/g, "");
  const next = { ...state };
  const fixture = TEST_SCENARIOS.find(s => s.id === state.scenarioId)!;
  const total = money(fixture.quantity * fixture.unitPrice);
  let reply: string;
  if (/\b(email|send|customer|payment link|checkout|real|live)\b/.test(command)) {
    reply = "This test area cannot contact customers, send email, take payments, or create real records. Use the synthetic quote and invoice actions below.";
  } else if (/^(please )?(create|draft)( a| the| test| a test| the test)? quote$/.test(command)) {
    if (state.quote !== "none") reply = "TEST-Q001 already exists. Repeated requests do not create duplicates. Reset the test to start again.";
    else { next.quote = "draft"; reply = `Created synthetic quote TEST-Q001 for ${fixture.customer}: ${fixture.quantity} × ${fixture.product} at ${money(fixture.unitPrice)} = ${total}. No email sent.`; }
  } else if (/^(please )?accept( a| the| test| a test| the test)? quote$/.test(command)) {
    if (state.quote === "draft") { next.quote = "accepted"; reply = "TEST-Q001 accepted in simulation. You can now create a test invoice."; }
    else reply = state.quote === "accepted" ? "TEST-Q001 is already accepted." : "Create a draft test quote first. Reset if the quote was rejected.";
  } else if (/^(please )?reject( a| the| test| a test| the test)? quote$/.test(command)) {
    if (state.quote === "draft") { next.quote = "rejected"; reply = "TEST-Q001 rejected in simulation. Reset to try a new workflow."; }
    else reply = "Only a draft test quote can be rejected. Reset to try another workflow.";
  } else if (/^(please )?create( a| the| test| a test| the test)? invoice$/.test(command)) {
    if (state.quote !== "accepted") reply = "Accept the test quote before creating an invoice.";
    else if (state.invoice !== "none") reply = "TEST-I001 already exists. Repeated requests do not create duplicates.";
    else { next.invoice = "unpaid"; reply = `Created synthetic invoice TEST-I001 for ${total}. It is unpaid; no real invoice or payment link was created.`; }
  } else if (/^(please )?(mark( the| test| the test)? invoice paid|mark paid|pay invoice)$/.test(command)) {
    if (state.invoice === "unpaid") { next.invoice = "paid"; reply = `TEST-I001 marked paid in simulation (${total}). No money moved and no receipt was sent.`; }
    else reply = state.invoice === "paid" ? "TEST-I001 is already marked paid in simulation." : "Create a test invoice first.";
  } else if (/^(status|help|summary|show status)$/.test(command)) {
    reply = `Synthetic scenario: ${fixture.label}. Quote: ${state.quote}. Invoice: ${state.invoice}. Total: ${total}. Try “Create quote”, “Accept quote”, “Create invoice”, or “Mark invoice paid”.`;
  } else {
    reply = "I am a deterministic simulation, not a connected AI model. I recognise: Create quote, Accept quote, Reject quote, Create invoice, Mark invoice paid, and Status. Use the buttons to try them.";
  }
  next.messages = [...state.messages, { role: "user", text } as TestMessage, { role: "bot", text: reply } as TestMessage].slice(-80);
  return next;
}
