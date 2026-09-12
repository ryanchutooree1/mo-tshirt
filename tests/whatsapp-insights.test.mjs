import assert from "node:assert/strict";
import test from "node:test";
import { buildWhatsAppInsights } from "../src/lib/whatsapp-insights.ts";

const template = "Welcome. We offer T-shirts, polo shirts, caps, hoodies and mugs. Please provide your garment, quantity, printing area, sizes and delivery date for a quotation.";
const msg = (id, chatId, sentAt, text, direction = "incoming", extra = {}) => ({ id, chatId, sentAt, text, direction, ...extra });
const source = {
  manifest: { exportedAt: "2026-09-12T08:00:00Z", source: "Synthetic fixture", quality: {}, limitations: [] },
  contacts: [], files: [],
  analysisReview: { excludedConversations: [{ id: "personal", reason: "Reviewed personal" }] },
  chats: ["a", "b", "c", "d", "personal", "bot", "supplier"].map(id => ({ id, name: id === "bot" ? "WhatsApp" : id, jid: `${id}@test` })),
  messages: [
    msg("1", "a", "2026-09-10T08:00:00Z", "Need T-shirts. What is the price?"),
    msg("2", "a", "2026-09-10T08:01:00Z", template, "outgoing"),
    msg("3", "a", "2026-09-10T09:00:00Z", "Also T-shirts and polo sizes please"),
    msg("4", "a", "2026-09-11T08:00:00Z", "We can prepare your quote now", "outgoing"),
    msg("5", "b", "2026-09-10T09:00:00Z", "Need polo shirts price"),
    msg("6", "b", "2026-09-10T09:01:00Z", template, "outgoing"),
    msg("7", "c", "2026-09-12T07:00:00Z", "Need caps please"),
    msg("8", "c", "2026-09-12T07:01:00Z", template, "outgoing"),
    msg("9", "c", "2026-09-12T07:30:00Z", "", "outgoing", { mediaMime: "image/jpeg" }),
    // 23:00 UTC belongs to the following day in Mauritius.
    msg("10", "d", "2026-09-10T23:00:00Z", "Need T-shirts"),
    msg("11", "personal", "2026-09-10T08:00:00Z", "Need T-shirts"),
    msg("12", "bot", "2026-09-10T08:00:00Z", "Need T-shirts"),
    msg("13", "supplier", "2026-09-10T08:00:00Z", "We are a manufacturer of T-shirts. Please call us"),
  ],
};

test("incoming mentions count distinct conversations and exclude repeated outgoing offers", () => {
  const result = buildWhatsAppInsights(source);
  assert.equal(result.kpis.enquiries, 4);
  assert.deepEqual(Object.fromEntries(result.products.map(row => [row.id, row.count])), { tshirts: 2, polos: 2, caps: 1, hoodies: 0, mugs: 0, bags: 0 });
  assert.equal(result.topics.find(row => row.id === "price").count, 2);
  assert.equal(result.source.exclusions.personalOrInternal, 1);
  assert.equal(result.source.exclusions.automatedOrBroadcast, 1);
  assert.equal(result.source.exclusions.supplierOrRecruitment, 1);
  assert.equal(result.responseBuckets.reduce((n, row) => n + row.count, 0), 4);
  assert.equal(result.hourBuckets.reduce((n, row) => n + row.count, 0), 4);
});

test("reply timing skips templates, includes media, and gives new enquiries a full observation window", () => {
  const result = buildWhatsAppInsights(source);
  assert.equal(result.kpis.replied, 2);
  assert.equal(result.kpis.medianReplyHours, 12.25);
  assert.equal(result.kpis.matureEnquiries, 3);
  assert.equal(result.kpis.repliedWithin24h, 1);
  assert.equal(result.kpis.replyWithin24hRate, 1 / 3);
  assert.equal(result.kpis.noNonTemplateReply, 2);
  assert.equal(result.cohorts.find(row => row.conversationId === "b").responseBucket, "Template only");
  assert.equal(result.cohorts.find(row => row.conversationId === "d").responseBucket, "No reply recorded");
  assert.equal(result.latency.reduce((n, row) => n + row.count, 0), 2);
});

test("product and date filters update the same cohort and follow replies beyond the selected end", () => {
  const result = buildWhatsAppInsights(source, { start: "2026-09-10", end: "2026-09-10", product: "tshirts" });
  assert.equal(result.kpis.enquiries, 1);
  assert.equal(result.kpis.medianReplyHours, 24);
  assert.equal(result.cohorts[0].conversationId, "a");
  assert.equal(result.kpis.repliedWithin24h, 1);
  const empty = buildWhatsAppInsights(source, { product: "hoodies" });
  assert.equal(empty.kpis.enquiries, 0);
  assert.equal(empty.kpis.replyWithin24hRate, null);
  assert.equal(empty.kpis.medianReplyHours, null);
  assert.deepEqual(empty.insights, []);
  const localDay = buildWhatsAppInsights(source, { start: "2026-09-11", end: "2026-09-11" });
  assert.deepEqual(localDay.cohorts.map(row => row.conversationId), ["d"]);
});
