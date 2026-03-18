import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAssistantTrainingState,
  createEmptyAssistantLead,
  extractLeadUpdates,
  runAssistantTurn,
} from "../src/lib/ai-assistant.ts";

test("extracts core sales lead details from a realistic request", () => {
  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message:
      "I need 20 black polo shirts with logo on front left chest and a big print at the back",
  });

  assert.equal(result.lead.productType, "polo");
  assert.equal(result.lead.quantity, 20);
  assert.equal(result.lead.color, "black");
  assert.deepEqual(result.lead.printPositions, ["back", "front left chest"]);
  assert.deepEqual(result.lead.printSizes, ["large 22x22"]);
  assert.equal(result.readyToSubmit, false);
  assert.match(result.reply, /Please send the full size breakdown/i);
});

test("phone capture does not get mistaken for quantity", () => {
  const updates = extractLeadUpdates("My name is Ryan and my phone is +230 59883880");

  assert.equal(updates.clientName, "Ryan");
  assert.equal(updates.phone, "59883880");
  assert.equal(updates.quantity, undefined);
});

test("date replies are captured as deadlines instead of quantities", () => {
  const updates = extractLeadUpdates("09/12/2026");

  assert.equal(updates.deadline, "09/12/2026");
  assert.equal(updates.quantity, undefined);
});

test("plural tshirts are recognized as t-shirt products", () => {
  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "hi i need 3 tshirts",
  });

  assert.equal(result.lead.productType, "t-shirt");
  assert.equal(result.lead.quantity, 3);
  assert.match(result.reply, /Where do you want the print/);
});

test("spoken quantities are recognized from natural customer requests", () => {
  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "I need three tshirts",
  });

  assert.equal(result.lead.productType, "t-shirt");
  assert.equal(result.lead.quantity, 3);
  assert.match(result.reply, /Where do you want the print/);
});

test("front and back combo choices are parsed into positions and print sizes", () => {
  const result = runAssistantTurn({
    lead: {
      ...createEmptyAssistantLead(),
      productType: "t-shirt",
      quantity: 12,
    },
    message: "small front and large back",
  });

  assert.deepEqual(result.lead.printPositions, ["back", "front center"]);
  assert.deepEqual(result.lead.printSizes, ["large 22x22", "small 9x9"]);
  assert.match(result.reply, /Please send the full size breakdown/i);
  assert.match(result.reply, /2 XL and 1 M/i);
});

test("plain name replies are accepted even if logo upload is still the next prompt", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 2,
      color: null,
      sizes: ["S"],
      sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "S", quantity: 2 }],
      printPositions: ["back"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "Sam Legoy",
  });

  assert.equal(result.lead.clientName, "Sam Legoy");
  assert.match(result.reply, /upload it as png, jpg, pdf, or ai/i);
});

test("size breakdown template lines are parsed into structured order lines", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: [],
      sizeBreakdown: [],
      printPositions: ["back"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message:
      "Product: T-Shirt Colour: Black Size: S Quantity: 2\nProduct: T-Shirt Colour: Black Size: M Quantity: 1",
  });

  assert.deepEqual(result.lead.sizes, ["M", "S"]);
  assert.equal(result.lead.sizeBreakdown.length, 2);
  assert.equal(result.lead.sizeBreakdown[0].quantity + result.lead.sizeBreakdown[1].quantity, 3);
  assert.match(result.reply, /upload it as png, jpg, pdf, or ai/i);
  assert.match(result.reply, /name, email address, whatsapp number, and deadline/i);
});

test("a size breakdown reply overrides a stale requested quantity and advances to the upload step", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: [],
      sizeBreakdown: [],
      printPositions: ["front center"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "Product: T-Shirt Colour: Black Size: L Quantity: 4",
  });

  assert.equal(result.lead.quantity, 4);
  assert.equal(result.lead.sizeBreakdown.length, 1);
  assert.match(result.reply, /upload it as png, jpg, pdf, or ai/i);
  assert.equal(result.readyToSubmit, false);
});

test("a new size breakdown reply replaces the previous breakdown instead of accumulating it", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: ["XL"],
      sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "XL", quantity: 4 }],
      printPositions: ["front center"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "Product: T-Shirt Colour: Black Size: M Quantity: 2",
  });

  assert.equal(result.lead.quantity, 2);
  assert.deepEqual(result.lead.sizeBreakdown, [
    { color: "black", productType: "t-shirt", size: "M", quantity: 2 },
  ]);
  assert.deepEqual(result.lead.sizes, ["M"]);
  assert.match(result.reply, /upload it as png, jpg, pdf, or ai/i);
});

test("a single kept size line is treated as the full breakdown when unused sizes were deleted", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: [],
      sizeBreakdown: [],
      printPositions: ["front center"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "Product: T-Shirt Colour: Black Size: XL Quantity: 1",
  });

  assert.equal(result.lead.quantity, 1);
  assert.deepEqual(result.lead.sizeBreakdown, [
    { color: "black", productType: "t-shirt", size: "XL", quantity: 1 },
  ]);
  assert.match(result.reply, /upload it as png, jpg, pdf, or ai/i);
});

test("freeform size replies are parsed without the strict template syntax", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: [],
      sizeBreakdown: [],
      printPositions: ["back"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "2 XL and 1 M",
  });

  assert.equal(result.lead.quantity, 3);
  assert.deepEqual(result.lead.sizeBreakdown, [
    { color: "black", productType: "t-shirt", size: "M", quantity: 1 },
    { color: "black", productType: "t-shirt", size: "XL", quantity: 2 },
  ]);
  assert.match(result.reply, /upload it as png, jpg, pdf, or ai/i);
});

test("size aliases like xxl are normalized in freeform replies", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: [],
      sizeBreakdown: [],
      printPositions: ["back"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "1 xxl and 2 xxxl",
  });

  assert.deepEqual(result.lead.sizeBreakdown, [
    { color: "black", productType: "t-shirt", size: "2XL", quantity: 1 },
    { color: "black", productType: "t-shirt", size: "3XL", quantity: 2 },
  ]);
});

test("logo upload asks for email when the file is received", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: "Ryan",
      phone: "59883880",
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: ["S", "M"],
      sizeBreakdown: [
        { color: "black", productType: "t-shirt", size: "S", quantity: 2 },
        { color: "black", productType: "t-shirt", size: "M", quantity: 1 },
      ],
      printPositions: ["front left chest"],
      printSizes: ["small 9x9"],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "Uploaded logo file: brand.ai",
    attachment: {
      name: "brand.ai",
      url: "https://example.com/brand.ai",
      contentType: "application/postscript",
      size: 1024,
      uploadedAt: "2026-03-16T10:00:00.000Z",
    },
  });

  assert.equal(result.lead.logoReady, true);
  assert.equal(result.lead.logoAttachment?.name, "brand.ai");
  assert.match(result.reply, /Logo received and attached to your request\./);
  assert.match(result.reply, /What is your email address so we can reply to you later\?/);
});

test("logo upload is acknowledged before asking for contact details", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: ["XL"],
      sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "XL", quantity: 3 }],
      printPositions: ["back"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "Uploaded logo file: IMG_3618.PNG",
    attachment: {
      name: "IMG_3618.PNG",
      url: "https://example.com/IMG_3618.PNG",
      contentType: "image/png",
      size: 2500000,
      uploadedAt: "2026-03-16T10:00:00.000Z",
    },
  });

  assert.equal(result.lead.logoReady, true);
  assert.equal(result.lead.logoAttachment?.name, "IMG_3618.PNG");
  assert.match(result.reply, /Logo received and attached to your request\./);
  assert.match(result.reply, /What is your name\?/);
});

test("after email is captured with a logo on file, the assistant asks for WhatsApp", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: "Ryan",
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: ["M"],
      sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "M", quantity: 3 }],
      printPositions: ["back"],
      printSizes: [],
      logoReady: true,
      logoAttachment: {
        name: "logo.png",
        url: "https://example.com/logo.png",
        contentType: "image/png",
        size: 2048,
        uploadedAt: "2026-03-16T10:00:00.000Z",
      },
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "ryan@example.com",
  });

  assert.equal(result.lead.email, "ryan@example.com");
  assert.match(result.reply, /What is your WhatsApp number so we can reply to you later\?/);
});

test("after WhatsApp is captured with a logo on file, the assistant asks for the deadline", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: "Ryan",
      phone: null,
      email: "ryan@example.com",
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: ["M"],
      sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "M", quantity: 3 }],
      printPositions: ["back"],
      printSizes: [],
      logoReady: true,
      logoAttachment: {
        name: "logo.png",
        url: "https://example.com/logo.png",
        contentType: "image/png",
        size: 2048,
        uploadedAt: "2026-03-16T10:00:00.000Z",
      },
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "+230 59883880",
  });

  assert.equal(result.lead.phone, "59883880");
  assert.match(result.reply, /What is your deadline\?/);
});

test("deadline date replies do not overwrite the original quantity", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: "Sam Game",
      phone: "59184399",
      email: "sam@gmail.com",
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: ["L"],
      sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "L", quantity: 3 }],
      printPositions: ["front center"],
      printSizes: [],
      logoReady: true,
      logoAttachment: {
        name: "IMG_3618.PNG",
        url: "https://example.com/IMG_3618.PNG",
        contentType: "image/png",
        size: 2500000,
        uploadedAt: "2026-03-16T10:00:00.000Z",
      },
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "09/12/2026",
  });

  assert.equal(result.lead.deadline, "09/12/2026");
  assert.equal(result.lead.quantity, 3);
  assert.equal(result.readyToSubmit, true);
  assert.match(result.reply, /Perfect\. I have the main order details and the logo file\./);
});

test("summary command returns the stored lead snapshot when all key fields are present", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: "Ryan",
      phone: "59883880",
      email: "ryan@example.com",
      productType: "t-shirt",
      quantity: 24,
      color: "navy",
      sizes: ["M", "L", "XL"],
      sizeBreakdown: [
        { color: "navy", productType: "t-shirt", size: "M", quantity: 8 },
        { color: "navy", productType: "t-shirt", size: "L", quantity: 8 },
        { color: "navy", productType: "t-shirt", size: "XL", quantity: 8 },
      ],
      printPositions: ["front left chest"],
      printSizes: ["small 9x9"],
      logoReady: true,
      deliveryMethod: "pickup",
      deadline: "next week",
      notes: "Restaurant staff refresh",
    },
    message: "summary",
  });

  assert.equal(result.readyToSubmit, true);
  assert.match(result.reply, /Lead summary:/);
  assert.match(result.reply, /Name: Ryan/);
  assert.match(result.reply, /Product: t-shirt/);
  assert.match(result.reply, /Print positions: front left chest/);
  assert.match(result.reply, /Size breakdown:/);
});

test("training state learns from approved leads and saved knowledge", () => {
  const training = buildAssistantTrainingState(
    [
      {
        status: "approved",
        lead: {
          clientName: "Ryan",
          phone: "59883880",
          email: null,
          productType: "t-shirt",
          quantity: 12,
          color: "black",
          sizes: ["M", "L"],
          sizeBreakdown: [
            { color: "black", productType: "t-shirt", size: "M", quantity: 6 },
            { color: "black", productType: "t-shirt", size: "L", quantity: 6 },
          ],
          printPositions: ["front left chest", "back"],
          printSizes: ["small 9x9", "large 22x22"],
          logoReady: true,
          deliveryMethod: "delivery",
          deadline: "next week",
          notes: "Uniform order",
        },
        sessionMessages: ["Need 12 crewtees with front left chest logo and back print"],
      },
    ],
    [
      {
        title: "Printing options",
        content:
          "Front left chest logo is usually 9x9 cm. Large back print is usually 22x22 cm.",
      },
    ]
  );

  assert.equal(training.approvedLeadCount, 1);
  assert.equal(training.knowledgeCount, 1);
  assert.ok(training.positiveKeywordCount > 0);
  assert.ok(training.topKeywords.length > 0);
  assert.ok(training.learnedProductAliases["t-shirt"].includes("crewtees"));
  assert.ok(training.learnedProductAliasCount > 0);
  assert.equal(training.learnedProductPlaybooks["t-shirt"].topColor, "black");
  assert.equal(training.learnedProductPlaybooks["t-shirt"].topDeliveryMethod, "delivery");
  assert.deepEqual(training.learnedProductPlaybooks["t-shirt"].topPrintPattern?.positions, ["back", "front left chest"]);
  assert.deepEqual(training.learnedProductPlaybooks["t-shirt"].topPrintPattern?.printSizes, ["large 22x22", "small 9x9"]);
});

test("runAssistantTurn uses learned aliases from approved sessions", () => {
  const training = buildAssistantTrainingState(
    [
      {
        status: "approved",
        lead: {
          clientName: "Ryan",
          phone: "59883880",
          email: null,
          productType: "t-shirt",
          quantity: 8,
          color: "black",
          sizes: ["M"],
          sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "M", quantity: 8 }],
          printPositions: ["front left chest"],
          printSizes: ["small 9x9"],
          logoReady: true,
          deliveryMethod: "pickup",
          deadline: null,
          notes: null,
        },
        sessionMessages: ["Hi I need 8 crewtees for staff"],
      },
    ],
    []
  );

  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "I need 3 crewtees",
    trainingState: training,
  });

  assert.equal(result.lead.productType, "t-shirt");
  assert.equal(result.lead.quantity, 3);
});

test("runAssistantTurn applies learned print playbook hints to the next question", () => {
  const training = buildAssistantTrainingState(
    [
      {
        status: "approved",
        lead: {
          clientName: "Ryan",
          phone: "59883880",
          email: null,
          productType: "t-shirt",
          quantity: 20,
          color: "black",
          sizes: ["M"],
          sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "M", quantity: 20 }],
          printPositions: ["back", "front left chest"],
          printSizes: ["large 22x22", "small 9x9"],
          logoReady: true,
          deliveryMethod: "pickup",
          deadline: null,
          notes: "staff uniforms",
        },
      },
    ],
    []
  );

  const result = runAssistantTurn({
    lead: {
      ...createEmptyAssistantLead(),
      productType: "t-shirt",
      quantity: 3,
    },
    message: "t-shirt confirmed",
    trainingState: training,
  });

  assert.match(result.reply, /Most approved T-Shirt jobs use Back and Front Left Chest with Large 22x22 and Small 9x9\./);
});

test("runAssistantTurn applies learned print-size suggestions for matching layouts", () => {
  const training = buildAssistantTrainingState(
    [
      {
        status: "approved",
        lead: {
          clientName: "Ryan",
          phone: "59883880",
          email: null,
          productType: "t-shirt",
          quantity: 20,
          color: "black",
          sizes: ["M"],
          sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "M", quantity: 20 }],
          printPositions: ["back", "front left chest"],
          printSizes: ["large 22x22", "small 9x9"],
          logoReady: true,
          deliveryMethod: "pickup",
          deadline: null,
          notes: "staff uniforms",
        },
      },
    ],
    []
  );

  const result = runAssistantTurn({
    lead: {
      ...createEmptyAssistantLead(),
      productType: "t-shirt",
      quantity: 6,
      printPositions: ["back", "front left chest"],
    },
    message: "front left chest and back",
    trainingState: training,
  });

  assert.ok(
    result.suggestions.some((item) =>
      /approved T-Shirt jobs usually use Large 22x22 and Small 9x9/i.test(item)
    )
  );
});
