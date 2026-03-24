"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { trackQuoteSubmit } from "@/lib/analytics";
import { storage } from "@/lib/firebase";

type QuoteFormProps = {
  source?: string;
  className?: string;
};

type FormState = {
  name: string;
  email: string;
  phone: string;
  deadline: string;
  notes: string;
  delivery: string;
  deliveryName: string;
  deliveryAddress: string;
  deliveryPostCode: string;
  deliveryPhone: string;
};

type GarmentLine = {
  garment: string;
  size: string;
  quantity: string;
};

type ArtworkItem = {
  id: number;
  label: string;
  quantity: string;
  file: File | null;
};

type PrintMethodInfo = {
  title: string;
  description: string;
  note?: string;
};

const garmentOptions = ["T-Shirt", "Polo Shirt", "Hoodie", "Cap", "Other"];
const sizeOptions = [
  "1 Yr",
  "2 Yrs",
  "4 Yrs",
  "6 Yrs",
  "8 Yrs",
  "10 Yrs",
  "12 Yrs",
  "14 Yrs",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
];
const printMethods = [
  "Screen Printing ($)",
  "Vinyl Heat Press Printing ($$)",
  "Direct-to-Film (DTF) Printing ($$$)",
  "Not sure",
];
const SCREEN_PRINTING_METHOD = printMethods[0];
const VINYL_METHOD = printMethods[1];
const DTF_METHOD = printMethods[2];
const deliveryOptions = [
  "Surinam Pickup (Free)",
  "Post Office Postage Delivery (Rs 100)",
  "Post Office Express Delivery (Rs 150)",
  "Delivery (Need to arrange first)",
];
const artworkAccept =
  ".png,.jpg,.jpeg,.webp,.svg,.heic,.heif,.pdf,image/png,image/jpeg,image/webp,image/svg+xml,image/heic,image/heif,application/pdf";
const printMethodInfoByMethod: Partial<Record<string, PrintMethodInfo>> = {
  [SCREEN_PRINTING_METHOD]: {
    title: "Screen printing rule",
    description:
      "Minimum order is 10 pcs per design. That means 10 identical prints for one logo or artwork, not 10 pcs with 10 different designs.",
    note: "If you have several logos or design versions, add each one separately below and tell us its quantity.",
  },
  [VINYL_METHOD]: {
    title: "Vinyl heat press guide",
    description:
      "Best for simple logos, names, numbers, and clean shapes. It works well for smaller quantities and personalized pieces.",
    note: "If the artwork has gradients, photos, or a lot of detail, DTF is usually the better option.",
  },
  [DTF_METHOD]: {
    title: "DTF printing guide",
    description:
      "Best for full-color artwork, gradients, and detailed logos. It is a strong choice for smaller runs that are too complex for vinyl or not ideal for screen printing.",
    note: "Send the clearest artwork file you have so we can confirm the print size and placement properly.",
  },
};

function createArtworkItem(id: number): ArtworkItem {
  return {
    id,
    label: "",
    quantity: "",
    file: null,
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

export default function QuoteForm({ source = "Website", className }: QuoteFormProps) {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    deadline: "",
    notes: "",
    delivery: deliveryOptions[0],
    deliveryName: "",
    deliveryAddress: "",
    deliveryPostCode: "",
    deliveryPhone: "",
  });
  const [garmentLines, setGarmentLines] = useState<GarmentLine[]>([
    { garment: garmentOptions[0], size: sizeOptions[0], quantity: "1" },
  ]);
  const [printMethod, setPrintMethod] = useState<string>(printMethods[3]);
  const [artworkItems, setArtworkItems] = useState<ArtworkItem[]>([createArtworkItem(1)]);
  const [nextArtworkId, setNextArtworkId] = useState(2);
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [deliveryPhoneError, setDeliveryPhoneError] = useState<string | null>(null);
  const [deliveryPostCodeError, setDeliveryPostCodeError] = useState<string | null>(null);

  const isValidPhone = (value: string) => /^[0-9+()\s-]+$/.test(value);
  const isValidPostCode = (value: string) => /^\d+$/.test(value);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateGarmentLine(index: number, patch: Partial<GarmentLine>) {
    setGarmentLines((prev) => {
      const next = prev.slice();
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addGarmentLine() {
    setGarmentLines((prev) => [
      ...prev,
      { garment: garmentOptions[0], size: sizeOptions[0], quantity: "1" },
    ]);
  }

  function removeGarmentLine(index: number) {
    setGarmentLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateArtworkItem(index: number, patch: Partial<ArtworkItem>) {
    setArtworkItems((prev) => {
      const next = prev.slice();
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addArtworkItem() {
    setArtworkItems((prev) => [...prev, createArtworkItem(nextArtworkId)]);
    setNextArtworkId((prev) => prev + 1);
  }

  function removeArtworkItem(index: number) {
    setArtworkItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function handleEmailChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setForm((prev) => ({ ...prev, email: next }));
    if (!next) {
      setEmailError("Email is required.");
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      setEmailError("Enter a valid email.");
    } else {
      setEmailError(null);
    }
  }

  function handleFileChange(index: number, e: ChangeEvent<HTMLInputElement>) {
    const nextFile = e.target.files?.[0] || null;
    updateArtworkItem(index, { file: nextFile });
  }

  function handlePhoneChange(value: string) {
    update("phone", value);
    if (!value) {
      setPhoneError(null);
      return;
    }
    setPhoneError(isValidPhone(value) ? null : "Use only numbers and + ( ) -");
  }

  function handleDeliveryPhoneChange(value: string) {
    update("deliveryPhone", value);
    if (!value) {
      setDeliveryPhoneError(null);
      return;
    }
    setDeliveryPhoneError(isValidPhone(value) ? null : "Use only numbers and + ( ) -");
  }

  function handleDeliveryPostCodeChange(value: string) {
    update("deliveryPostCode", value);
    if (!value) {
      setDeliveryPostCodeError(null);
      return;
    }
    setDeliveryPostCodeError(isValidPostCode(value) ? null : "Numbers only");
  }

  const totalQuantity = garmentLines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0);
  const screenPrintingSelected = printMethod === SCREEN_PRINTING_METHOD;
  const selectedPrintMethodInfo = printMethodInfoByMethod[printMethod];

  function getScreenPrintingValidationMessage() {
    const filledArtworkItems = artworkItems.filter(
      (item) => item.file || item.label.trim() || item.quantity.trim()
    );
    const incompleteArtwork = filledArtworkItems.find((item) => !item.file);
    if (incompleteArtwork) {
      return "Upload a file or clear the extra logo row before sending the quote.";
    }

    if (!screenPrintingSelected) return null;
    if (totalQuantity < 10) {
      return "Screen printing requires at least 10 pieces for the same design.";
    }

    const uploadedArtworkItems = filledArtworkItems.filter((item) => item.file);
    if (uploadedArtworkItems.length > 1) {
      const missingQty = uploadedArtworkItems.find((item) => !item.quantity.trim() || Number(item.quantity) <= 0);
      if (missingQty) {
        return "Add the quantity for each uploaded design so we can confirm the 10-piece minimum per design.";
      }
    }

    const tooSmall = uploadedArtworkItems.find(
      (item) => item.quantity.trim() && Number(item.quantity) > 0 && Number(item.quantity) < 10
    );
    if (tooSmall) {
      return `${tooSmall.label.trim() || tooSmall.file?.name || "This design"} needs at least 10 pieces for screen printing.`;
    }

    const declaredArtworkQty = uploadedArtworkItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    if (declaredArtworkQty > totalQuantity) {
      return "Artwork quantities cannot be higher than the total garment quantity.";
    }

    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const phoneOk = !form.phone || isValidPhone(form.phone);
    const deliveryPhoneOk = !form.deliveryPhone || isValidPhone(form.deliveryPhone);
    const deliveryPostCodeOk = !form.deliveryPostCode || isValidPostCode(form.deliveryPostCode);
    setPhoneError(phoneOk ? null : "Use only numbers and + ( ) -");
    setDeliveryPhoneError(deliveryPhoneOk ? null : "Use only numbers and + ( ) -");
    setDeliveryPostCodeError(deliveryPostCodeOk ? null : "Numbers only");
    if (!phoneOk || !deliveryPhoneOk || !deliveryPostCodeOk) return;

    const screenPrintingError = getScreenPrintingValidationMessage();
    if (screenPrintingError) {
      setResult({ ok: false, msg: screenPrintingError });
      return;
    }

    setLoading(true);
    setResult(null);

    const summaryMessage = form.notes.trim()
      ? "Notes are included in the details above."
      : "Quote request submitted via the website.";

    const payload = new FormData();
    const primaryLine = garmentLines[0] || { garment: "", size: "", quantity: "" };
    payload.append("name", form.name);
    payload.append("email", form.email);
    payload.append("message", summaryMessage);
    payload.append("website", website);
    payload.append("phone", form.phone);
    payload.append("garment", primaryLine.garment);
    payload.append("size", primaryLine.size);
    payload.append("printMethod", printMethod);
    payload.append("quantity", primaryLine.quantity);
    payload.append("garments", JSON.stringify(garmentLines));
    payload.append("deadline", form.deadline);
    payload.append("notes", form.notes);
    payload.append("source", source);
    payload.append("delivery", form.delivery);
    payload.append("deliveryName", form.deliveryName);
    payload.append("deliveryAddress", form.deliveryAddress);
    payload.append("deliveryPostCode", form.deliveryPostCode);
    payload.append("deliveryPhone", form.deliveryPhone);

    const uploadedArtworkItems = artworkItems.filter((item) => item.file);
    if (uploadedArtworkItems.length) {
      try {
        const uploadBatch = Date.now();
        const uploadedAttachments = await Promise.all(
          uploadedArtworkItems.map(async (item, index) => {
            const currentFile = item.file as File;
            const safeName = currentFile.name.replace(/[^a-z0-9._-]/gi, "_");
            const uploadRef = ref(storage, `quotes/${uploadBatch}-${index + 1}-${safeName}`);
            const snap = await uploadBytes(uploadRef, currentFile);
            const url = await getDownloadURL(snap.ref);
            return {
              label: item.label.trim() || `Logo ${index + 1}`,
              quantity: item.quantity.trim() || null,
              url,
              filename: currentFile.name,
              contentType: currentFile.type || "application/octet-stream",
              size: currentFile.size || null,
            };
          })
        );

        payload.append("attachments", JSON.stringify(uploadedAttachments));
        uploadedArtworkItems.forEach((item) => {
          if (item.file) payload.append("files", item.file);
        });
      } catch (err) {
        console.error("quote:upload", err);
        setResult({ ok: false, msg: "Failed to upload one of the artwork files. Please try again." });
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        body: payload,
      });
      const body = await res.json();
      if (res.ok) {
        trackQuoteSubmit({
          form_source: source,
          print_method: printMethod,
          garment_lines: garmentLines.length,
          total_quantity: totalQuantity,
          artwork_count: uploadedArtworkItems.length,
          delivery_method: form.delivery,
        });
        setResult({ ok: true, msg: body?.message || "Got it! We’ll reply soon." });
        setForm({
          name: "",
          email: "",
          phone: "",
          deadline: "",
          notes: "",
          delivery: deliveryOptions[0],
          deliveryName: "",
          deliveryAddress: "",
          deliveryPostCode: "",
          deliveryPhone: "",
        });
        setGarmentLines([{ garment: garmentOptions[0], size: sizeOptions[0], quantity: "1" }]);
        setPrintMethod(printMethods[3]);
        setArtworkItems([createArtworkItem(1)]);
        setNextArtworkId(2);
        setWebsite("");
        setEmailError(null);
      } else {
        setResult({ ok: false, msg: body?.error || "Something went wrong." });
      }
    } catch {
      setResult({ ok: false, msg: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="quote-website">Website</label>
          <input
            id="quote-website"
            name="website"
            tabIndex={-1}
            autoComplete="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="Your Name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Email *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={handleEmailChange}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                emailError ? "border-red-400 focus:border-red-500" : "border-neutral-200 focus:border-black"
              }`}
              placeholder="you@example.com"
            />
            {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Phone / WhatsApp</label>
            <input
              value={form.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                phoneError ? "border-red-400 focus:border-red-500" : "border-neutral-200 focus:border-black"
              }`}
              placeholder="e.g.,+230 5988 3880"
            />
            {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Deadline</label>
            <input
              value={form.deadline}
              onChange={(e) => update("deadline", e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="e.g., Next Friday, Dec 20"
            />
          </div>
        </div>

        <div className="space-y-3">
          {garmentLines.map((line, index) => (
            <div key={`${index}-${line.garment}`} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Garment</label>
                <select
                  value={line.garment}
                  onChange={(e) => updateGarmentLine(index, { garment: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                >
                  {garmentOptions.map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Size</label>
                <select
                  value={line.size}
                  onChange={(e) => updateGarmentLine(index, { size: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                >
                  {sizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Quantity *</label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    required
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateGarmentLine(index, { quantity: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    placeholder="50"
                  />
                  {garmentLines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeGarmentLine(index)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 aspect-square"
                      aria-label="Remove garment"
                      title="Remove garment"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addGarmentLine}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
          >
            Add garment
          </button>
        </div>

        <div className={`grid grid-cols-1 gap-4 ${selectedPrintMethodInfo ? "sm:grid-cols-2" : ""}`}>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Print method</label>
            <select
              value={printMethod}
              onChange={(e) => setPrintMethod(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
            >
              {printMethods.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
          {selectedPrintMethodInfo ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              <p className="font-semibold text-neutral-900">{selectedPrintMethodInfo.title}</p>
              <p className="mt-2">{selectedPrintMethodInfo.description}</p>
              {selectedPrintMethodInfo.note ? (
                <p className="mt-2 text-xs text-neutral-500">{selectedPrintMethodInfo.note}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {screenPrintingSelected && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Screen printing selected</p>
            <p className="mt-1">
              Total quantity in this quote: <span className="font-semibold">{totalQuantity || 0} pcs</span>.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              For multiple logos, each uploaded design should normally cover at least 10 pcs.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Artwork / logos</label>
              <p className="mt-1 text-xs text-neutral-500">
                Upload one or more logo or design files. Use a separate row for each different design.
              </p>
            </div>
            <button
              type="button"
              onClick={addArtworkItem}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:border-black hover:text-black"
            >
              + Add another logo
            </button>
          </div>

          {artworkItems.map((item, index) => (
            <div key={item.id} className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-neutral-900">Design {index + 1}</p>
                {artworkItems.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeArtworkItem(index)}
                    className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Label</label>
                  <input
                    value={item.label}
                    onChange={(e) => updateArtworkItem(index, { label: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                    placeholder={`Logo ${index + 1}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Qty for this design</label>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateArtworkItem(index, { quantity: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-sm font-medium text-neutral-700">File</label>
                <input
                  type="file"
                  accept={artworkAccept}
                  onChange={(e) => handleFileChange(index, e)}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                />
                <p className="mt-1 text-xs text-neutral-500">Accepted: PNG, JPG, WEBP, SVG, HEIC, HEIF, PDF.</p>
                {item.file && (
                  <p className="mt-2 text-xs font-medium text-neutral-600">
                    {item.file.name}
                    {item.file.size ? ` · ${formatBytes(item.file.size)}` : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            className="mt-1 h-[86px] w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
            placeholder="Describe the print: front chest 1-color, back 2-color, sleeve logo, sizes, deadlines…"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Delivery</label>
          <select
            value={form.delivery}
            onChange={(e) => update("delivery", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
          >
            {deliveryOptions.map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {form.delivery !== "Surinam Pickup (Free)" && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-800">Delivery Info</p>
            <div className="mt-3 grid gap-3">
              <input
                value={form.deliveryName}
                onChange={(e) => update("deliveryName", e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                placeholder="Your Full Name"
              />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                <div>
                  <input
                    value={form.deliveryAddress}
                    onChange={(e) => update("deliveryAddress", e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                    placeholder="Your Delivery Address"
                  />
                </div>
                <div>
                  <input
                    value={form.deliveryPostCode}
                    onChange={(e) => handleDeliveryPostCodeChange(e.target.value)}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none ${
                      deliveryPostCodeError ? "border-red-400 focus:border-red-500" : "border-neutral-200 focus:border-black"
                    }`}
                    placeholder="Post Code (optional)"
                  />
                  {deliveryPostCodeError && <p className="mt-1 text-xs text-red-600">{deliveryPostCodeError}</p>}
                </div>
              </div>
              <input
                value={form.deliveryPhone}
                onChange={(e) => handleDeliveryPhoneChange(e.target.value)}
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none ${
                  deliveryPhoneError ? "border-red-400 focus:border-red-500" : "border-neutral-200 focus:border-black"
                }`}
                placeholder="Your Phone Number"
              />
              {deliveryPhoneError && <p className="text-xs text-red-600">{deliveryPhoneError}</p>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || Boolean(emailError)}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Get my quote"}
          </button>
          <TrackedWhatsAppLink
            href={getWhatsAppUrl("Hi! Can you quote me for custom shirts?")}
            trackingLocation="quote_form"
            trackingSource={source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-black transition hover:border-black"
          >
            Or WhatsApp {CONTACT_PHONE_DISPLAY}
          </TrackedWhatsAppLink>
        </div>

        {result && (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}
          >
            {result.msg}
          </div>
        )}
      </form>

      <p className="mt-4 text-xs text-neutral-500">
        By submitting, you agree we may reach you at {CONTACT_TEL} / email to confirm details and pricing.
      </p>
    </div>
  );
}
