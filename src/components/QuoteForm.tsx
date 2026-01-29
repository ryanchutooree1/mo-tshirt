"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";

type QuoteFormProps = {
  source?: string;
  className?: string;
};

type FormState = {
  name: string;
  email: string;
  phone: string;
  quantity: string;
  garment: string;
  deadline: string;
  notes: string;
  delivery: string;
  deliveryName: string;
  deliveryAddress: string;
  deliveryPhone: string;
};

const garmentOptions = ["T-Shirt", "Polo Shirt", "Hoodie", "Cap", "Other"];
const printMethods = ["Screen Print", "DTF", "Vinyl Heat Press", "Not sure"];
const deliveryOptions = [
  "Surinam pickup (Free)",
  "Post Office Delivery (Rs 100)",
  "Delivery (Need to arrange first)",
];

export default function QuoteForm({ source = "Website", className }: QuoteFormProps) {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    quantity: "50",
    garment: garmentOptions[0],
    deadline: "",
    notes: "",
    delivery: deliveryOptions[0],
    deliveryName: "",
    deliveryAddress: "",
    deliveryPhone: "",
  });
  const [printMethod, setPrintMethod] = useState<string>(printMethods[3]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [deliveryPhoneError, setDeliveryPhoneError] = useState<string | null>(null);

  const isValidPhone = (value: string) => /^[0-9+()\s-]+$/.test(value);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const phoneOk = !form.phone || isValidPhone(form.phone);
    const deliveryPhoneOk = !form.deliveryPhone || isValidPhone(form.deliveryPhone);
    setPhoneError(phoneOk ? null : "Use only numbers and + ( ) -");
    setDeliveryPhoneError(deliveryPhoneOk ? null : "Use only numbers and + ( ) -");
    if (!phoneOk || !deliveryPhoneOk) return;
    setLoading(true);
    setResult(null);

    const summaryMessage = form.notes.trim()
      ? "Notes are included in the details above."
      : "Quote request submitted via the website.";

    const payload = new FormData();
    payload.append("name", form.name);
    payload.append("email", form.email);
    payload.append("message", summaryMessage);
    payload.append("phone", form.phone);
    payload.append("garment", form.garment);
    payload.append("printMethod", printMethod);
    payload.append("quantity", form.quantity);
    payload.append("deadline", form.deadline);
    payload.append("notes", form.notes);
    payload.append("source", source);
    payload.append("delivery", form.delivery);
    payload.append("deliveryName", form.deliveryName);
    payload.append("deliveryAddress", form.deliveryAddress);
    payload.append("deliveryPhone", form.deliveryPhone);
    if (file) payload.append("file", file);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        body: payload,
      });
      const body = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: body?.message || "Got it! We’ll reply soon." });
        setForm({
          name: "",
          email: "",
          phone: "",
          quantity: "50",
          garment: garmentOptions[0],
          deadline: "",
          notes: "",
          delivery: deliveryOptions[0],
          deliveryName: "",
          deliveryAddress: "",
          deliveryPhone: "",
        });
        setPrintMethod(printMethods[3]);
        setFile(null);
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Garment</label>
            <select
              value={form.garment}
              onChange={(e) => update("garment", e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
            >
              {garmentOptions.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Quantity *</label>
            <input
              required
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => update("quantity", e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Upload logo (PNG, JPG, JPEG, PDF)</label>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              onChange={handleFileChange}
              className="mt-1 w-full cursor-pointer rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </div>
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

        {(form.delivery === "Post Office Delivery (Rs 100)" ||
          form.delivery === "Delivery (Need to arrange first)") && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-800">Delivery Info</p>
            <div className="mt-3 grid gap-3">
              <input
                value={form.deliveryName}
                onChange={(e) => update("deliveryName", e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                placeholder="Your Name"
              />
              <input
                value={form.deliveryAddress}
                onChange={(e) => update("deliveryAddress", e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                placeholder="Your Address"
              />
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
            className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Get my quote"}
          </button>
          <a
            href={getWhatsAppUrl("Hi! Can you quote me for custom shirts?")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-black transition hover:border-black"
          >
            Or WhatsApp {CONTACT_PHONE_DISPLAY}
          </a>
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
