import test from "node:test";
import assert from "node:assert/strict";
import {
  OPENCLAW_WHATSAPP_REPLY_TEXT,
  OPENCLAW_WHATSAPP_TRIGGER_MESSAGE,
  buildClientRequestReply,
  getThinkingDelayMs,
  isMatchingOpenClawCommand,
  parseWhatsAppWebhookPayload,
} from "../src/lib/openclaw-whatsapp.ts";

test("direct JSON payloads are parsed into an inbound WhatsApp message", () => {
  const incoming = parseWhatsAppWebhookPayload({
    from: "whatsapp:+23059883880",
    message: OPENCLAW_WHATSAPP_TRIGGER_MESSAGE,
    messageSid: "SM123",
  });

  assert.deepEqual(incoming, {
    provider: "json",
    from: "whatsapp:+23059883880",
    text: OPENCLAW_WHATSAPP_TRIGGER_MESSAGE,
    messageSid: "SM123",
  });
});

test("Twilio webhook payloads are parsed from form-style fields", () => {
  const incoming = parseWhatsAppWebhookPayload({
    From: "whatsapp:+23059883880",
    Body: OPENCLAW_WHATSAPP_TRIGGER_MESSAGE,
    MessageSid: "SM456",
  });

  assert.deepEqual(incoming, {
    provider: "twilio",
    from: "whatsapp:+23059883880",
    text: OPENCLAW_WHATSAPP_TRIGGER_MESSAGE,
    messageSid: "SM456",
  });
});

test("Meta webhook payloads are parsed from entry changes", () => {
  const incoming = parseWhatsAppWebhookPayload({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.123",
                  from: "23059883880",
                  text: {
                    body: OPENCLAW_WHATSAPP_TRIGGER_MESSAGE,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(incoming, {
    provider: "meta",
    from: "23059883880",
    text: OPENCLAW_WHATSAPP_TRIGGER_MESSAGE,
    messageSid: "wamid.123",
  });
});

test("command matching is exact", () => {
  assert.equal(isMatchingOpenClawCommand(OPENCLAW_WHATSAPP_TRIGGER_MESSAGE, OPENCLAW_WHATSAPP_TRIGGER_MESSAGE), true);
  assert.equal(isMatchingOpenClawCommand("Hi, analyse all client requests", OPENCLAW_WHATSAPP_TRIGGER_MESSAGE), false);
});

test("demo reply stays on the expected hardcoded text", () => {
  const reply = buildClientRequestReply({
    draftedEmails: 8,
    assignedTasks: 15,
    pendingApprovals: 3,
  });

  assert.equal(reply, OPENCLAW_WHATSAPP_REPLY_TEXT);
});

test("thinking delay stays inside the configured range", () => {
  for (let index = 0; index < 50; index += 1) {
    const delayMs = getThinkingDelayMs(2_000, 3_000);
    assert.ok(delayMs >= 2_000);
    assert.ok(delayMs <= 3_000);
  }
});
