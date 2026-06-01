import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import { getPrintPartnerRegistry } from "@/lib/partner-registry";
import { mapTanviQuote } from "@/lib/tanvi-quotes";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const MAX_TANVI_CREATE_BYTES = 12_288;

function safeText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getWhatsappDetails(value: unknown) {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    clientName: safeText(raw.clientName, 120),
    phone: safeText(raw.phone, 80),
    email: safeText(raw.email, 160),
    product: safeText(raw.product, 160),
    quantity: safePositiveNumber(raw.quantity),
    color: safeText(raw.color, 120),
    printMethod: safeText(raw.printMethod, 120),
    deadline: safeText(raw.deadline, 120),
    total: safePositiveNumber(raw.total),
    notes: safeText(raw.notes, 2_000),
  };
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

  const body = await req.json().catch(() => ({}));
  const details = getWhatsappDetails(body?.whatsappDetails);

  if (!details.clientName && !details.phone && !details.product && !details.notes) {
    return NextResponse.json(
      { error: "Add at least a client, phone, product, or note." },
      { status: 400 }
    );
  }

  try {
    const registry = await getPrintPartnerRegistry({ includeInactive: true });
    const documentNumber = `WA-${String(Date.now()).slice(-6)}`;
    const ref = await addDoc(collection(db, "quotes"), {
      name: details.clientName || "WhatsApp client",
      email: details.email,
      phone: details.phone,
      message: details.notes || "Created from Tanvi WhatsApp intake",
      garments: [
        {
          garment: details.product || "WhatsApp order",
          color: details.color,
          size: "",
          quantity: details.quantity || 1,
        },
      ],
      printMethod: details.printMethod,
      quantity: details.quantity || "",
      deadline: details.deadline,
      notes: details.notes,
      source: "WhatsApp",
      delivery: "",
      designBrief: {
        product: details.product,
        color: details.color,
        totalQty: details.quantity || "",
        printMethod: details.printMethod,
        deadline: details.deadline,
        clientNotes: details.notes,
      },
      quote: {
        documentType: "quotation",
        documentNumber,
        clientCompany: "",
        currency: "Rs",
        total: details.total || 0,
        lines: [
          {
            description: details.product || "WhatsApp order",
            quantity: details.quantity || 1,
            unitPrice: "",
          },
        ],
      },
      status: "new",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      quote: mapTanviQuote(ref.id, {
        name: details.clientName || "WhatsApp client",
        email: details.email,
        phone: details.phone,
        message: details.notes || "Created from Tanvi WhatsApp intake",
        garments: [
          {
            garment: details.product || "WhatsApp order",
            color: details.color,
            size: "",
            quantity: details.quantity || 1,
          },
        ],
        printMethod: details.printMethod,
        quantity: details.quantity || "",
        deadline: details.deadline,
        notes: details.notes,
        source: "WhatsApp",
        designBrief: {
          product: details.product,
          color: details.color,
          totalQty: details.quantity || "",
          printMethod: details.printMethod,
          deadline: details.deadline,
          clientNotes: details.notes,
        },
        quote: {
          documentType: "quotation",
          documentNumber,
          clientCompany: "",
          currency: "Rs",
          total: details.total || 0,
          lines: [
            {
              description: details.product || "WhatsApp order",
              quantity: details.quantity || 1,
            },
          ],
        },
        status: "new",
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
