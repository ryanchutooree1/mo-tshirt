import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import { getPrintPartnerRegistry } from "@/lib/partner-registry";
import { mapTanviQuote } from "@/lib/tanvi-quotes";
import { storePublicUploadBuffer } from "@/lib/public-upload-store";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const MAX_TANVI_CREATE_BYTES = 16 * 1024 * 1024;
const MAX_TANVI_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_TANVI_LOGO_COUNT = 12;
const TANVI_ALLOWED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "application/pdf",
];

type TanviAttachmentDraft = {
  label?: string;
  description?: string;
  quantity?: string | number | null;
  lineId?: string;
  product?: string;
  color?: string;
  size?: string;
  printPlacement?: string;
};

type WhatsappLineDetails = {
  id: string;
  product: string;
  color: string;
  size: string;
  quantity: number | null;
  printPlacement: string;
  logoDescription: string;
};

function safeText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getPrintPlacementLabel(value: string) {
  if (value === "back") return "Back printing only";
  if (value === "front_back") return "Front and back printing";
  return "Front printing only";
}

function getWhatsappLineItems(value: unknown): WhatsappLineDetails[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const raw = entry as Record<string, unknown>;
      const product = safeText(raw.product, 160);
      const color = safeText(raw.color, 120);
      const size = safeText(raw.size, 80);
      const quantity = safePositiveNumber(raw.quantity);
      const printPlacement = safeText(raw.printPlacement, 40);
      const normalizedPlacement =
        printPlacement === "back" || printPlacement === "front_back"
          ? printPlacement
          : "front";
      const logoDescription = safeText(raw.logoDescription, 500);

      if (!product && !color && !size && !quantity && !logoDescription) return null;

      return {
        id: safeText(raw.id, 80) || `line-${index + 1}`,
        product,
        color,
        size,
        quantity,
        printPlacement: normalizedPlacement,
        logoDescription,
      };
    })
    .filter((entry): entry is WhatsappLineDetails => Boolean(entry));
}

function getLineSummary(line: WhatsappLineDetails, index: number) {
  const rows = [
    line.quantity ? `${line.quantity} pcs` : "",
    line.product || `Item ${index + 1}`,
    line.color,
    line.size ? `Size ${line.size}` : "",
    getPrintPlacementLabel(line.printPlacement),
    line.logoDescription || `Logo ${index + 1}`,
  ].filter(Boolean);
  return rows.join(" - ");
}

function getWhatsappDetails(value: unknown) {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const lineItems = getWhatsappLineItems(raw.lineItems);
  const fallbackQuantity = safePositiveNumber(raw.quantity);
  const fallbackLine =
    lineItems.length
      ? []
      : [{
          id: "line-1",
          product: safeText(raw.product, 160),
          color: safeText(raw.color, 120),
          size: "",
          quantity: fallbackQuantity,
          printPlacement: safeText(raw.printMethod, 120).toLowerCase().includes("back") ? "back" : "front",
          logoDescription:
            safeText(raw.frontLogoDescription, 500) ||
            safeText(raw.backLogoDescription, 500),
        }].filter((line) => line.product || line.color || line.quantity || line.logoDescription);
  const normalizedLineItems = lineItems.length ? lineItems : fallbackLine;
  const totalQty = normalizedLineItems.reduce(
    (sum, line) => sum + (line.quantity || 0),
    0
  );
  const productSummary = normalizedLineItems.length
    ? normalizedLineItems.map((line, index) => getLineSummary(line, index)).join("; ")
    : safeText(raw.product, 160);
  const colorSummary = Array.from(new Set(normalizedLineItems.map((line) => line.color).filter(Boolean))).join(", ");
  const printSummary = Array.from(
    new Set(normalizedLineItems.map((line) => getPrintPlacementLabel(line.printPlacement)))
  ).join(", ");

  return {
    clientName: safeText(raw.clientName, 120),
    phone: safeText(raw.phone, 80),
    email: safeText(raw.email, 160),
    product: productSummary,
    quantity: totalQty || fallbackQuantity,
    color: colorSummary || safeText(raw.color, 120),
    printMethod: printSummary || safeText(raw.printMethod, 120),
    deadline: safeText(raw.deadline, 120),
    total: safePositiveNumber(raw.total),
    notes: safeText(raw.notes, 2_000),
    frontLogoDescription: safeText(raw.frontLogoDescription, 500),
    backLogoDescription: safeText(raw.backLogoDescription, 500),
    lineItems: normalizedLineItems,
  };
}

function parseJsonObject(value: unknown) {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseAttachmentDrafts(value: unknown): TanviAttachmentDraft[] {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === "object") : [];
  } catch {
    return [];
  }
}

async function parseTanviCreateRequest(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    const body = await req.json().catch(() => ({}));
    return {
      details: getWhatsappDetails(body?.whatsappDetails),
      files: [] as File[],
      attachmentDrafts: [] as TanviAttachmentDraft[],
    };
  }

  const formData = await req.formData();
  return {
    details: getWhatsappDetails(parseJsonObject(formData.get("whatsappDetails"))),
    files: formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0),
    attachmentDrafts: parseAttachmentDrafts(formData.get("attachments")),
  };
}

async function storeWhatsappAttachments(files: File[], drafts: TanviAttachmentDraft[]) {
  if (files.length > MAX_TANVI_LOGO_COUNT) {
    throw new Error("Upload up to 12 logo files per WhatsApp order.");
  }

  const uploadSessionId = `tanvi-whatsapp-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

  return Promise.all(
    files.map(async (file, index) => {
      if (!TANVI_ALLOWED_LOGO_TYPES.includes(file.type || "")) {
        throw new Error("Unsupported logo type. Use PNG, JPG, WEBP, SVG, HEIC, or PDF.");
      }
      if (file.size > MAX_TANVI_LOGO_BYTES) {
        throw new Error("Logo is too large. Keep each file under 5MB.");
      }

      const draft = drafts[index] || {};
      const upload = await storePublicUploadBuffer({
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name || `logo-${index + 1}`,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        sessionId: uploadSessionId,
        sessionPrefix: "tanvi-whatsapp",
        source: "tanvi-whatsapp-upload",
        maxUploadBytes: MAX_TANVI_LOGO_BYTES,
      });

      return {
        label: safeText(draft.label, 80) || `Logo ${index + 1}`,
        description: [
          safeText(draft.description, 500),
          safeText(draft.product, 120),
          safeText(draft.color, 80),
          safeText(draft.size, 40) ? `Size ${safeText(draft.size, 40)}` : "",
          safeText(draft.printPlacement, 40)
            ? getPrintPlacementLabel(safeText(draft.printPlacement, 40))
            : "",
        ].filter(Boolean).join(" - "),
        quantity: safeText(draft.quantity, 80),
        lineId: safeText(draft.lineId, 80),
        printPlacement: safeText(draft.printPlacement, 40),
        url: upload.url,
        filename: upload.filename,
        contentType: upload.contentType,
        size: upload.size,
      };
    })
  );
}

export async function GET() {
  if (!(await isAdminRequest("/api/admin/tanvi/quotes"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const [registry, snap] = await Promise.all([
      getPrintPartnerRegistry({ includeInactive: true }),
      getDocs(query(collection(db, "quotes"), orderBy("createdAt", "desc"))),
    ]);

    const quotes = snap.docs.map((docSnap) =>
      mapTanviQuote(docSnap.id, docSnap.data(), registry.partners)
    );

    return NextResponse.json({
      manager: registry.manager,
      partners: registry.partners,
      quotes,
    });
  } catch (error) {
    console.error("tanvi:quotes:get", error);
    return NextResponse.json(
      { error: "Failed to load Tanvi desk." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_TANVI_CREATE_BYTES)) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  if (!(await isAdminRequest("/api/admin/tanvi/quotes"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { details, files, attachmentDrafts } = await parseTanviCreateRequest(req);

  if (!details.clientName && !details.phone && !details.product && !details.notes) {
    return NextResponse.json(
      { error: "Add at least a client, phone, product, or note." },
      { status: 400 }
    );
  }

  try {
    const registry = await getPrintPartnerRegistry({ includeInactive: true });
    const attachments = await storeWhatsappAttachments(files, attachmentDrafts);
    const documentNumber = `WA-${String(Date.now()).slice(-6)}`;
    const garmentLines = details.lineItems.length
      ? details.lineItems.map((line) => ({
          garment: line.product || "WhatsApp order",
          color: line.color,
          size: line.size,
          quantity: line.quantity || 1,
        }))
      : [
          {
            garment: details.product || "WhatsApp order",
            color: details.color,
            size: "",
            quantity: details.quantity || 1,
          },
        ];
    const quoteLines = details.lineItems.length
      ? details.lineItems.map((line, index) => ({
          description: getLineSummary(line, index),
          quantity: line.quantity || 1,
          unitPrice: "",
        }))
      : [
          {
            description: details.product || "WhatsApp order",
            quantity: details.quantity || 1,
            unitPrice: "",
          },
        ];
    const quotePayload = {
      name: details.clientName || "WhatsApp client",
      email: details.email,
      phone: details.phone,
      message: details.notes || "Created from Tanvi WhatsApp intake",
      garments: garmentLines,
      printMethod: details.printMethod,
      quantity: details.quantity || "",
      deadline: details.deadline,
      notes: details.notes,
      source: "WhatsApp",
      delivery: "",
      attachments,
      attachment: attachments[0] || null,
      designBrief: {
        product: details.product,
        color: details.color,
        totalQty: details.quantity || "",
        printMethod: details.printMethod,
        deadline: details.deadline,
        clientNotes: details.notes,
        lineItems: details.lineItems,
        frontLogo: details.lineItems.some((line) => line.printPlacement === "front" || line.printPlacement === "front_back"),
        backLogo: details.lineItems.some((line) => line.printPlacement === "back" || line.printPlacement === "front_back"),
        frontLogoDescription: details.frontLogoDescription,
        backLogoDescription: details.backLogoDescription,
      },
      quote: {
        documentType: "quotation",
        documentNumber,
        clientCompany: "",
        currency: "Rs",
        total: details.total || 0,
        lines: quoteLines,
      },
      status: "new",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, "quotes"), quotePayload);

    return NextResponse.json({
      quote: mapTanviQuote(ref.id, {
        ...quotePayload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, registry.partners),
    });
  } catch (error) {
    console.error("tanvi:quotes:create", error);
    return NextResponse.json(
      { error: "Failed to create WhatsApp order." },
      { status: 500 }
    );
  }
}
