import {
  arrayUnion,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  activeEditLock,
  assertEditLock,
  buildProductCorrection,
  canonical,
  changedFields,
  EDIT_LEASE_MS,
  editSnapshot,
  getProductEditor,
  object,
  productVersion,
  QuoteEditError,
  recalculateDocument,
  rowsOf,
  synchronizeDocumentQuantities,
  type EditActor,
} from "./quote-product-edit";

export async function applyQuoteEdit(
  id: string,
  body: Record<string, unknown>,
  actor: EditActor,
) {
  const now = Date.now(),
    atIso = new Date(now).toISOString();
  const action = String(body.action || ""),
    operationId = String(body.operationId || "");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(operationId))
    throw new QuoteEditError("Missing edit request identifier.");
  const quoteRef = doc(db, "quotes", id),
    historyRef = doc(collection(quoteRef, "editHistory"), operationId);
  const newToken = crypto.randomUUID();
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(quoteRef);
    if (!snap.exists()) throw new QuoteEditError("Quotation not found.", 404);
    const data = snap.data();
    const duplicate = await tx.get(historyRef);
    if (duplicate.exists()) {
      if (object(duplicate.data().actor).userId !== actor.userId)
        throw new QuoteEditError("Invalid edit request.", 409);
      return {
        editor: getProductEditor(data),
        expectedQuote: canonical(data.quote),
        duplicate: true,
      };
    }
    const lock = activeEditLock(data, now);
    let patch: Record<string, unknown> = {};
    let reason = "";
    if (action === "unlock") {
      if (lock)
        throw new QuoteEditError(
          `${lock.actor.displayName} is editing these products. Try again after they save or lock the details.`,
          409,
        );
      patch.productEditLock = {
        actor,
        token: newToken,
        expiresAt: now + EDIT_LEASE_MS,
      };
    } else if (action === "lock" || action === "renew") {
      assertEditLock(data, actor, String(body.token || ""), now);
      patch.productEditLock =
        action === "lock" ? null : { ...lock, expiresAt: now + EDIT_LEASE_MS };
      if (action === "renew") {
        tx.update(quoteRef, patch);
        return { editor: getProductEditor({ ...data, ...patch }) };
      }
    } else if (action === "save-products") {
      assertEditLock(data, actor, String(body.token || ""), now);
      if (body.version !== productVersion(data))
        throw new QuoteEditError(
          "This quotation changed while you were editing. Lock and reopen the details to load the latest values.",
          409,
        );
      reason = String(body.reason || "").trim();
      if (!reason || reason.length > 2000)
        throw new QuoteEditError(
          "Add a short reason for the correction (up to 2,000 characters).",
        );
      patch = {
        ...buildProductCorrection(data, body, actor, atIso),
        productEditLock: null,
        quotationDocument: null,
      };
    } else if (action === "save-document") {
      if (lock)
        throw new QuoteEditError(
          `${lock.actor.displayName} is editing product details. Save the products and lock them before saving the quotation.`,
          409,
        );
      if (body.expectedQuote !== canonical(data.quote))
        throw new QuoteEditError(
          "The quotation changed in another editor. Reload the latest document before saving.",
          409,
        );
      const input = object(body.quote),
        lines = rowsOf(input.lines);
      if (
        !Array.isArray(input.lines) ||
        lines.length > 100 ||
        lines.some(
          (line) =>
            String(line.description || "").length > 4000 ||
            !Number.isFinite(Number(line.quantity)) ||
            Number(line.quantity) < 0 ||
            !Number.isFinite(Number(line.unitPrice)) ||
            Number(line.unitPrice) < 0,
        )
      )
        throw new QuoteEditError(
          "Check the quotation line quantities and prices.",
        );
      for (const key of ["deliveryFee", "discount", "amountReceived"]) {
        if (
          input[key] !== undefined &&
          (!Number.isFinite(Number(input[key])) ||
            Number(input[key]) < 0 ||
            Number(input[key]) > 1e12)
        )
          throw new QuoteEditError(
            "Check the delivery fee, discount and amount received.",
          );
      }
      const previousLines = rowsOf(object(data.quote).lines);
      input.lines = lines.map((line, index) => {
        const old = line.productLineId
          ? previousLines.find(
              (previous) => previous.productLineId === line.productLineId,
            )
          : previousLines[index];
        return Number(old?.unitPrice || 0) !== Number(line.unitPrice)
          ? {
              ...line,
              priceSource: "manual",
              priceSetById: actor.userId,
              priceSetByName: actor.displayName,
              priceSetAtIso: atIso,
            }
          : line;
      });
      const quote = recalculateDocument(input);
      patch = {
        ...synchronizeDocumentQuantities(data, quote),
        quotationDocument: null,
      };
      for (const key of ["name", "email", "phone"])
        if (typeof body[key] === "string")
          patch[key] = String(body[key]).trim().slice(0, 500);
      if (
        body.status &&
        ["new", "review", "approved", "sent", "rejected"].includes(
          String(body.status),
        )
      )
        patch.status = body.status;
      reason = "Quotation document edited";
    } else throw new QuoteEditError("Unsupported edit action.");
    if (action === "save-products" || action === "save-document") {
      const previousLines = rowsOf(object(data.quote).lines);
      const entries = rowsOf(object(patch.quote).lines).flatMap(
        (line, index) => {
          const previous = line.productLineId
            ? previousLines.find(
                (old) => old.productLineId === line.productLineId,
              ) || previousLines[index]
            : previousLines[index];
          const previousValue = Number(previous?.unitPrice || 0),
            value = Number(line.unitPrice || 0);
          return previousValue === value
            ? []
            : [
                {
                  lineIndex: index,
                  description: String(line.description || ""),
                  previousValue,
                  value,
                  source: "manual",
                  setById: actor.userId,
                  setByName: actor.displayName,
                  changedAtIso: atIso,
                },
              ];
        },
      );
      if (entries.length) patch.priceAuditHistory = arrayUnion(...entries);
    }
    const next = { ...data, ...patch };
    const before = {
      ...editSnapshot(data),
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
    };
    const after = {
      ...editSnapshot(next),
      name: next.name || "",
      email: next.email || "",
      phone: next.phone || "",
    };
    const changes = changedFields(before, after);
    const sequence = Number(data.editHistorySequence || 0) + 1;
    // Read linked orders before any writes so the correction is atomic.
    const orderId =
      typeof data.orderTransactionId === "string"
        ? data.orderTransactionId
        : "";
    const orderRef =
      orderId && (action === "save-products" || action === "save-document")
        ? doc(db, "transactions", orderId)
        : null;
    const orderSnap = orderRef ? await tx.get(orderRef) : null;
    if (orderRef && orderSnap?.exists()) {
      const quote = object(next.quote),
        garments = rowsOf(next.garments);
      const lines = rowsOf(quote.lines);
      const products = lines.map((line, index) => {
        const garment =
          garments.find((g) => g.id && g.id === line.productLineId) ||
          garments[index] ||
          {};
        return {
          product: String(line.description || ""),
          color: String(garment.color || ""),
          size: String(garment.size || ""),
          quantity: Number(line.quantity || 0),
          unitPrice: Number(line.unitPrice || 0),
          price:
            Math.round(
              Number(line.quantity || 0) * Number(line.unitPrice || 0) * 100,
            ) / 100,
        };
      });
      tx.update(orderRef, {
        products,
        amount: quote.total,
        documentProfile: {
          ...object(orderSnap.data().documentProfile),
          ...quote,
          lines,
        },
        updatedAt: serverTimestamp(),
      });
    }
    tx.update(quoteRef, {
      ...patch,
      editHistorySequence: sequence,
      updatedAt: serverTimestamp(),
    });
    tx.set(historyRef, {
      action,
      reason,
      actor,
      atIso,
      sequence,
      changes,
      before,
      after,
    });
    return {
      editor: getProductEditor(next),
      expectedQuote: canonical(next.quote),
    };
  });
}
