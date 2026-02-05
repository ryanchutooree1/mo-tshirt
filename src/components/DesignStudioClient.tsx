"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ImagePlus,
  Loader2,
  Palette,
  Send,
  Sparkles,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";

type ProductId = "tshirt" | "polo" | "hoodie";
type MethodId = "dtf" | "screen" | "vinyl" | "embroidery";
type Side = "front" | "back";
type FontId = "display" | "body" | "impact" | "script";

const PRODUCTS: {
  id: ProductId;
  label: string;
  baseUnit: number;
  minQty: number;
  leadTime: string;
}[] = [
  { id: "tshirt", label: "T-Shirt", baseUnit: 230, minQty: 10, leadTime: "5-7 working days" },
  { id: "polo", label: "Polo", baseUnit: 310, minQty: 10, leadTime: "6-8 working days" },
  { id: "hoodie", label: "Hoodie", baseUnit: 690, minQty: 8, leadTime: "7-10 working days" },
];

const COLORS = [
  { id: "jet-black", label: "Jet Black", hex: "#111318", premium: 0 },
  { id: "snow", label: "Snow White", hex: "#f9fafb", premium: 0 },
  { id: "sunset", label: "Sunset Orange", hex: "#fb923c", premium: 15 },
  { id: "royal", label: "Royal Blue", hex: "#1d4ed8", premium: 15 },
  { id: "forest", label: "Forest Green", hex: "#166534", premium: 20 },
  { id: "wine", label: "Wine Red", hex: "#9f1239", premium: 20 },
  { id: "sand", label: "Sand Beige", hex: "#d4b28a", premium: 10 },
  { id: "charcoal", label: "Charcoal", hex: "#374151", premium: 10 },
] as const;

const METHODS: { id: MethodId; label: string; add: number; note: string }[] = [
  { id: "dtf", label: "DTF Full Color", add: 60, note: "Best for complex logos and gradients." },
  { id: "screen", label: "Screen Printing", add: 30, note: "Sharp for simple designs and bulk." },
  { id: "vinyl", label: "Vinyl Heat Press", add: 45, note: "Great for names and numbers." },
  { id: "embroidery", label: "Embroidery", add: 95, note: "Premium stitch finish." },
];

const FONTS: { id: FontId; label: string; value: string }[] = [
  { id: "display", label: "Bold Display", value: "var(--font-studio-display)" },
  { id: "body", label: "Modern Sans", value: "var(--font-studio-body)" },
  { id: "impact", label: "Impact", value: "'Impact','Arial Black',sans-serif" },
  { id: "script", label: "Signature", value: "'Brush Script MT','Segoe Script',cursive" },
];

const SIZE_FIELDS = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
type SizeField = (typeof SIZE_FIELDS)[number];

const DELIVERY_OPTIONS = [
  "Surinam Pickup (Free)",
  "Post Office Postage Delivery (Rs 100)",
  "Post Office Express Delivery (Rs 150)",
  "Delivery (Need to arrange first)",
];

type SideDesign = {
  text: {
    enabled: boolean;
    value: string;
    color: string;
    font: FontId;
    size: number;
    weight: number;
    x: number;
    y: number;
    rotate: number;
  };
  logo: {
    enabled: boolean;
    x: number;
    y: number;
    scale: number;
    rotate: number;
    opacity: number;
  };
};

type DragState = {
  pointerId: number;
  layer: "text" | "logo";
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const GARMENT_PATHS: Record<ProductId, string> = {
  tshirt:
    "M126 226L210 145H430L514 226L560 226L516 350L500 694H140L124 350L80 226H126Z",
  polo: "M126 228L212 145H428L514 228L560 228L516 352L500 696H140L124 352L80 228H126Z",
  hoodie:
    "M134 238L220 154H420L506 238L548 296L514 698H126L92 296L134 238Z",
};

const HIGHLIGHT_PATHS: Record<ProductId, string> = {
  tshirt: "M172 210C220 176 420 176 468 210",
  polo: "M174 211C220 177 420 177 466 211",
  hoodie: "M220 154C278 108 362 108 420 154",
};

function createSideDesign(defaultText: string): SideDesign {
  return {
    text: {
      enabled: true,
      value: defaultText,
      color: "#ffffff",
      font: "display",
      size: 52,
      weight: 700,
      x: 0,
      y: 0,
      rotate: 0,
    },
    logo: {
      enabled: false,
      x: 0,
      y: -18,
      scale: 90,
      rotate: 0,
      opacity: 100,
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function withCommas(value: number) {
  return value.toLocaleString("en-US");
}

function gradientId(productId: ProductId, side: Side) {
  return `garment-gradient-${productId}-${side}`;
}

export default function DesignStudioClient() {
  const [productId, setProductId] = useState<ProductId>("tshirt");
  const [colorId, setColorId] = useState<(typeof COLORS)[number]["id"]>("jet-black");
  const [methodId, setMethodId] = useState<MethodId>("dtf");
  const [activeSide, setActiveSide] = useState<Side>("front");
  const [designBySide, setDesignBySide] = useState<Record<Side, SideDesign>>({
    front: createSideDesign("MO TEAM"),
    back: createSideDesign("EST. 2026"),
  });
  const [sizeQuantities, setSizeQuantities] = useState<Record<SizeField, string>>({
    XS: "",
    S: "",
    M: "",
    L: "",
    XL: "",
    "2XL": "",
    "3XL": "",
  });
  const [client, setClient] = useState({
    name: "",
    email: "",
    phone: "",
    deadline: "",
    notes: "",
  });
  const [delivery, setDelivery] = useState(DELIVERY_OPTIONS[0]);
  const [rush, setRush] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const logoObjectUrlRef = useRef<string | null>(null);

  const activeDesign = designBySide[activeSide];
  const product = PRODUCTS.find((entry) => entry.id === productId) ?? PRODUCTS[0];
  const method = METHODS.find((entry) => entry.id === methodId) ?? METHODS[0];
  const color = COLORS.find((entry) => entry.id === colorId) ?? COLORS[0];

  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
      }
    };
  }, []);

  const totalQty = useMemo(
    () =>
      SIZE_FIELDS.reduce((sum, size) => {
        const qty = Number(sizeQuantities[size]) || 0;
        return sum + (qty > 0 ? qty : 0);
      }, 0),
    [sizeQuantities]
  );

  const decoratedSides = useMemo(() => {
    const sides: Side[] = ["front", "back"];
    return sides.reduce((count, side) => {
      const details = designBySide[side];
      const hasText = details.text.enabled && details.text.value.trim().length > 0;
      const hasLogo = details.logo.enabled && !!logoPreview;
      return hasText || hasLogo ? count + 1 : count;
    }, 0);
  }, [designBySide, logoPreview]);

  const discountRate = totalQty >= 300 ? 0.2 : totalQty >= 100 ? 0.14 : totalQty >= 50 ? 0.1 : totalQty >= 20 ? 0.06 : 0;
  const rushRate = rush ? 0.12 : 0;
  const sideExtra = Math.max(0, decoratedSides - 1) * 35;
  const unitBeforeDiscount = product.baseUnit + method.add + color.premium + sideExtra;
  const unitPrice = Math.max(0, Math.round(unitBeforeDiscount * (1 - discountRate)));
  const setupFee = totalQty > 0 && totalQty < product.minQty ? 750 : 0;
  const rushFee = Math.round(unitPrice * totalQty * rushRate);
  const totalPrice = unitPrice * totalQty + setupFee + rushFee;

  function patchText(side: Side, patch: Partial<SideDesign["text"]>) {
    setDesignBySide((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        text: {
          ...prev[side].text,
          ...patch,
        },
      },
    }));
  }

  function patchLogo(side: Side, patch: Partial<SideDesign["logo"]>) {
    setDesignBySide((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        logo: {
          ...prev[side].logo,
          ...patch,
        },
      },
    }));
  }

  function updateQuantity(size: SizeField, value: string) {
    if (!/^\d*$/.test(value)) return;
    setSizeQuantities((prev) => ({ ...prev, [size]: value }));
  }

  function openLogoPicker() {
    logoInputRef.current?.click();
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setResult({ ok: false, text: "Please upload an image file (PNG, JPG, SVG)." });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setResult({ ok: false, text: "Logo is too large. Please upload a file under 5MB." });
      return;
    }

    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = previewUrl;

    setLogoPreview(previewUrl);
    setLogoFile(file);
    setResult(null);
    setDesignBySide((prev) => ({
      ...prev,
      [activeSide]: {
        ...prev[activeSide],
        logo: {
          ...prev[activeSide].logo,
          enabled: true,
        },
      },
    }));
  }

  function clearLogo() {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
    setLogoPreview(null);
    setLogoFile(null);
    setDesignBySide((prev) => ({
      front: {
        ...prev.front,
        logo: {
          ...prev.front.logo,
          enabled: false,
        },
      },
      back: {
        ...prev.back,
        logo: {
          ...prev.back.logo,
          enabled: false,
        },
      },
    }));
  }

  function beginDrag(layer: "text" | "logo") {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      if (layer === "text" && !activeDesign.text.enabled) return;
      if (layer === "logo" && (!activeDesign.logo.enabled || !logoPreview)) return;
      const target = layer === "text" ? activeDesign.text : activeDesign.logo;
      dragRef.current = {
        pointerId: event.pointerId,
        layer,
        startX: event.clientX,
        startY: event.clientY,
        originX: target.x,
        originY: target.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    };
  }

  function onPreviewPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = printAreaRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const deltaX = ((event.clientX - drag.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * 100;
    const x = clamp(drag.originX + deltaX, -44, 44);
    const y = clamp(drag.originY + deltaY, -44, 44);
    if (drag.layer === "text") {
      patchText(activeSide, { x, y });
    } else {
      patchLogo(activeSide, { x, y });
    }
  }

  function onPreviewPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const summary = useMemo(() => {
    const front = designBySide.front;
    const back = designBySide.back;
    const sizes = SIZE_FIELDS.map((size) => `${size}:${Number(sizeQuantities[size]) || 0}`).join(" | ");
    const frontText = front.text.enabled ? front.text.value || "none" : "off";
    const backText = back.text.enabled ? back.text.value || "none" : "off";
    const frontLogo = front.logo.enabled && logoPreview ? "on" : "off";
    const backLogo = back.logo.enabled && logoPreview ? "on" : "off";
    return [
      `Hi MO T-SHIRT, I want a quote from Design Studio.`,
      `Product: ${product.label}`,
      `Color: ${color.label}`,
      `Print method: ${method.label}`,
      `Front text: ${frontText}`,
      `Back text: ${backText}`,
      `Front logo: ${frontLogo}`,
      `Back logo: ${backLogo}`,
      `Sizes: ${sizes}`,
      `Total qty: ${totalQty}`,
      `Estimated total: Rs ${withCommas(totalPrice)}`,
      client.deadline ? `Deadline: ${client.deadline}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [client.deadline, color.label, designBySide, logoPreview, method.label, product.label, sizeQuantities, totalPrice, totalQty]);

  const whatsappUrl = useMemo(() => getWhatsAppUrl(summary), [summary]);

  async function handleCopySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (totalQty <= 0) {
      setResult({ ok: false, text: "Add at least one size quantity before sending." });
      return;
    }
    setSubmitting(true);
    setResult(null);

    const garmentLines = SIZE_FIELDS.map((size) => ({
      size,
      quantity: Number(sizeQuantities[size]) || 0,
    })).filter((entry) => entry.quantity > 0);

    const payload = new FormData();
    payload.append("name", client.name.trim());
    payload.append("email", client.email.trim());
    payload.append("message", "Design Studio request submitted via mo-tshirt.mu");
    payload.append("phone", client.phone.trim());
    payload.append("garment", product.label);
    payload.append("size", garmentLines[0]?.size || "Mixed");
    payload.append("printMethod", method.label);
    payload.append("quantity", String(totalQty));
    payload.append(
      "garments",
      JSON.stringify(
        garmentLines.map((line) => ({
          garment: product.label,
          size: line.size,
          quantity: line.quantity,
        }))
      )
    );
    payload.append("deadline", client.deadline.trim());
    payload.append(
      "notes",
      [summary, client.notes ? `Client notes:\n${client.notes.trim()}` : "", rush ? "Rush requested: Yes" : "Rush requested: No"].filter(Boolean).join("\n\n")
    );
    payload.append("source", "Design Studio");
    payload.append("delivery", delivery);
    if (logoFile) {
      payload.append("file", logoFile);
    }

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        body: payload,
      });
      const body = (await response.json()) as { message?: string; error?: string };
      if (response.ok) {
        setResult({ ok: true, text: body.message || "Request sent. We’ll confirm by WhatsApp/email shortly." });
      } else {
        setResult({ ok: false, text: body.error || "Could not send now. Please try WhatsApp." });
      }
    } catch {
      setResult({ ok: false, text: "Network error while sending request." });
    } finally {
      setSubmitting(false);
    }
  }

  const containerAnim = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(145deg,#fff7ea_0%,#fffdf8_45%,#ecfeff_100%)] [font-family:var(--font-studio-body)] text-slate-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 left-0 h-80 w-80 rounded-full bg-[#f97316]/20 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-24 h-80 w-80 rounded-full bg-[#14b8a6]/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[#22c55e]/10 blur-3xl" />

        <motion.section
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.08, duration: 0.4 }}
          className="relative mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8"
        >
          <motion.div variants={containerAnim} className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
            <p className="rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 shadow-sm">
              MO T-SHIRT Design Studio
            </p>
          </motion.div>

          <motion.div variants={containerAnim} className="mt-8 max-w-5xl rounded-[28px] border border-white/70 bg-white/70 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Public Design Studio</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900 [font-family:var(--font-studio-display)] sm:text-6xl">
              Design your T-Shirt
            </h1>
            <p className="mt-4 max-w-4xl text-base text-slate-600 sm:text-lg">
              Create your style, place your logo, choose sizes, and send your order directly to our team.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
              <span className="rounded-full bg-white px-3 py-1 shadow-sm">Live mockup studio</span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm">Instant quote preview</span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm">Ready for public orders</span>
            </div>
          </motion.div>

          <motion.div variants={containerAnim} className="mt-8 grid gap-6 xl:grid-cols-[1fr_1.45fr_1fr]">
            <article className="rounded-[28px] border border-[#ecdcc8] bg-white/95 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.08)] sm:p-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                <WandSparkles className="h-4 w-4" />
                Setup
              </div>

              <div className="mt-5">
                <p className="text-sm font-semibold text-slate-800">1. Choose product</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  {PRODUCTS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setProductId(option.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        productId === option.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-semibold">{option.label}</p>
                      <p className={`mt-1 text-xs ${productId === option.id ? "text-slate-300" : "text-slate-500"}`}>
                        From Rs {withCommas(option.baseUnit)} / unit
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm font-semibold text-slate-800">2. Pick fabric color</p>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {COLORS.map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      onClick={() => setColorId(swatch.id)}
                      className={`relative rounded-xl border p-1 ${swatch.id === colorId ? "border-slate-900" : "border-slate-200 hover:border-slate-300"}`}
                      aria-label={swatch.label}
                      title={swatch.label}
                    >
                      <span className="block h-8 rounded-lg border border-black/10" style={{ backgroundColor: swatch.hex }} />
                      {swatch.id === colorId && (
                        <CheckCircle2 className={`absolute right-1 top-1 h-4 w-4 ${swatch.hex === "#f9fafb" ? "text-slate-700" : "text-white"}`} />
                      )}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Selected: <span className="font-semibold text-slate-700">{color.label}</span>
                </p>
              </div>

              <div className="mt-6">
                <p className="text-sm font-semibold text-slate-800">3. Decoration method</p>
                <div className="mt-3 space-y-2">
                  {METHODS.map((option) => (
                    <label
                      key={option.id}
                      className={`block rounded-2xl border p-3 transition ${
                        methodId === option.id ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="method"
                          checked={methodId === option.id}
                          onChange={() => setMethodId(option.id)}
                          className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                        />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{option.label}</p>
                          <p className="text-xs text-slate-500">{option.note}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <Palette className="h-4 w-4" />
                  Designer controls
                </div>

                <div className="mt-3 flex gap-2">
                  {(["front", "back"] as Side[]).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setActiveSide(side)}
                      className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                        activeSide === side
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900"
                      }`}
                    >
                      {side}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Text</label>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={activeDesign.text.enabled}
                          onChange={(event) => patchText(activeSide, { enabled: event.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                        />
                        Enabled
                      </label>
                    </div>
                    <input
                      value={activeDesign.text.value}
                      onChange={(event) => patchText(activeSide, { value: event.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      placeholder="Type text"
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <select
                        value={activeDesign.text.font}
                        onChange={(event) => patchText(activeSide, { font: event.target.value as FontId })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                      >
                        {FONTS.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="color"
                        value={activeDesign.text.color}
                        onChange={(event) => patchText(activeSide, { color: event.target.value })}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1"
                        aria-label="Text color"
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="range"
                        min={22}
                        max={92}
                        value={activeDesign.text.size}
                        onChange={(event) => patchText(activeSide, { size: Number(event.target.value) })}
                      />
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={activeDesign.text.rotate}
                        onChange={(event) => patchText(activeSide, { rotate: Number(event.target.value) })}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Logo</label>
                      {logoPreview && (
                        <button
                          type="button"
                          onClick={clearLogo}
                          className="text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(["front", "back"] as Side[]).map((side) => (
                        <label key={side} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={designBySide[side].logo.enabled}
                            onChange={(event) => patchLogo(side, { enabled: event.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                          {side}
                        </label>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={openLogoPicker}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
                    >
                      <UploadCloud className="h-4 w-4" />
                      Upload logo
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onClick={(event) => {
                        event.currentTarget.value = "";
                      }}
                      onChange={handleLogoUpload}
                      className="hidden"
                    />

                    {logoPreview ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2">
                        <div className="relative h-16 overflow-hidden rounded-lg">
                          <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">Tip: transparent PNG gives the cleanest result.</p>
                      </div>
                    ) : null}

                    {logoPreview && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          type="range"
                          min={30}
                          max={180}
                          value={activeDesign.logo.scale}
                          onChange={(event) => patchLogo(activeSide, { scale: Number(event.target.value) })}
                        />
                        <input
                          type="range"
                          min={20}
                          max={100}
                          value={activeDesign.logo.opacity}
                          onChange={(event) => patchLogo(activeSide, { opacity: Number(event.target.value) })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-[30px] border border-[#d8dde6] bg-[#f7fafc] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Studio preview</p>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 [font-family:var(--font-studio-display)]">
                    {product.label} • {activeSide}
                  </h2>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  Drag text/logo to reposition
                </div>
              </div>

              <div className="mt-5">
                <div className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-inner sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                        {activeSide} side
                      </span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        Live canvas
                      </span>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Drag text and logo directly on the shirt
                    </p>
                  </div>

                  <div
                    ref={printAreaRef}
                    onPointerMove={onPreviewPointerMove}
                    onPointerUp={onPreviewPointerEnd}
                    onPointerCancel={onPreviewPointerEnd}
                    className="relative mx-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(120deg,#f0fdfa_0%,#f8fafc_45%,#fff7ed_100%)] p-4 sm:p-5"
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(249,115,22,0.2),transparent_36%),radial-gradient(circle_at_82%_18%,rgba(20,184,166,0.2),transparent_34%),radial-gradient(circle_at_50%_95%,rgba(59,130,246,0.14),transparent_35%)]" />

                    <Garment
                      productId={product.id}
                      side={activeSide}
                      colorHex={color.hex}
                    />

                    <div className="absolute left-[30%] top-[24%] h-[47%] w-[40%] rounded-xl border border-dashed border-slate-300/70 bg-white/20 backdrop-blur-[1px]">
                      {activeDesign.text.enabled && activeDesign.text.value.trim().length > 0 && (
                        <div
                          onPointerDown={beginDrag("text")}
                          className="absolute left-1/2 top-1/2 cursor-grab select-none active:cursor-grabbing"
                          style={{
                            transform: `translate(calc(-50% + ${activeDesign.text.x}%), calc(-50% + ${activeDesign.text.y}%)) rotate(${activeDesign.text.rotate}deg)`,
                            color: activeDesign.text.color,
                            fontFamily: FONTS.find((item) => item.id === activeDesign.text.font)?.value,
                            fontSize: `${activeDesign.text.size}px`,
                            fontWeight: activeDesign.text.weight,
                            textShadow: "0 10px 22px rgba(15,23,42,0.35)",
                            lineHeight: 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {activeDesign.text.value}
                        </div>
                      )}

                      {logoPreview ? (
                        <div
                          onPointerDown={beginDrag("logo")}
                          className={`absolute left-1/2 top-1/2 ${activeDesign.logo.enabled ? "cursor-grab active:cursor-grabbing" : "pointer-events-none opacity-40"}`}
                          style={{
                            transform: `translate(calc(-50% + ${activeDesign.logo.x}%), calc(-50% + ${activeDesign.logo.y}%)) rotate(${activeDesign.logo.rotate}deg)`,
                            opacity: activeDesign.logo.opacity / 100,
                          }}
                        >
                          <div
                            style={{
                              width: `${activeDesign.logo.scale}%`,
                              maxWidth: "200px",
                            }}
                            className="relative aspect-square max-h-36"
                          >
                            <img
                              src={logoPreview}
                              alt="Logo layer"
                              className="h-full w-full object-contain drop-shadow-[0_10px_20px_rgba(15,23,42,0.25)]"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-slate-400">
                          <div className="text-center">
                            <ImagePlus className="mx-auto h-8 w-8" />
                            <p className="mt-1 text-xs font-medium">Upload logo</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <PreviewStat label="Lead time" value={product.leadTime} />
                <PreviewStat label="Min order" value={`${product.minQty} pcs`} />
                <PreviewStat label="Color surcharge" value={color.premium ? `+Rs ${color.premium}` : "Included"} />
              </div>
            </article>

            <article className="rounded-[28px] border border-[#d9e3db] bg-white/95 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.08)] sm:p-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">
                <Sparkles className="h-4 w-4" />
                Quote
              </div>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">4. Quantities by size</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {SIZE_FIELDS.map((size) => (
                      <label key={size} className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                        <span className="text-xs font-semibold text-slate-500">{size}</span>
                        <input
                          inputMode="numeric"
                          value={sizeQuantities[size]}
                          onChange={(event) => updateQuantity(size, event.target.value)}
                          className="mt-1 w-full border-0 p-0 text-sm font-semibold text-slate-900 focus:outline-none"
                          placeholder="0"
                        />
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={rush}
                      onChange={(event) => setRush(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                    Rush production (+12%)
                  </label>
                </div>

                <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-[#fff7ed] to-[#fefce8] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Live estimate</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Unit price</p>
                      <p className="text-base font-semibold text-slate-900">Rs {withCommas(unitPrice)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Total qty</p>
                      <p className="text-base font-semibold text-slate-900">{withCommas(totalQty)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Discount</p>
                      <p className="text-base font-semibold text-slate-900">{Math.round(discountRate * 100)}%</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Estimated total</p>
                      <p className="text-base font-semibold text-slate-900">Rs {withCommas(totalPrice)}</p>
                    </div>
                  </div>
                  {(setupFee > 0 || rushFee > 0) && (
                    <p className="mt-2 text-xs text-slate-500">
                      {setupFee > 0 ? `Setup: Rs ${withCommas(setupFee)}.` : ""} {rushFee > 0 ? `Rush: Rs ${withCommas(rushFee)}.` : ""}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <input
                    required
                    value={client.name}
                    onChange={(event) => setClient((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Client name *"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                  <input
                    required
                    type="email"
                    value={client.email}
                    onChange={(event) => setClient((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="Client email *"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                  <input
                    value={client.phone}
                    onChange={(event) => setClient((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="Phone / WhatsApp"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                  <input
                    value={client.deadline}
                    onChange={(event) => setClient((prev) => ({ ...prev, deadline: event.target.value }))}
                    placeholder="Deadline (optional)"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                  <select
                    value={delivery}
                    onChange={(event) => setDelivery(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  >
                    {DELIVERY_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                  <textarea
                    value={client.notes}
                    onChange={(event) => setClient((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Extra notes (placement details, pantone, embroidery size...)"
                    rows={3}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? "Sending..." : "Send quote request"}
                </button>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100"
                >
                  <Send className="h-4 w-4" />
                  Continue on WhatsApp
                </a>

                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Copied summary" : "Copy order summary"}
                </button>

                {result && (
                  <p
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      result.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {result.text}
                  </p>
                )}
              </form>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                <p className="font-semibold uppercase tracking-[0.14em] text-slate-500">Need help now?</p>
                <p className="mt-2">
                  Email:{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4">
                    {CONTACT_EMAIL}
                  </a>
                </p>
                <p className="mt-1">
                  Call/WhatsApp:{" "}
                  <a href={`tel:${CONTACT_TEL}`} className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4">
                    {CONTACT_PHONE_DISPLAY}
                  </a>
                </p>
              </div>
            </article>
          </motion.div>

          <motion.div variants={containerAnim} className="mt-8 rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm">
            <div className="grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Owner control</p>
                <p className="mt-2 font-semibold text-slate-800">Clients submit cleaner requests with fewer back-and-forth messages.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Production-ready</p>
                <p className="mt-2 font-semibold text-slate-800">Every quote includes size matrix, method, and print-side instructions.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sales boost</p>
                <p className="mt-2 font-semibold text-slate-800">Live estimate + WhatsApp CTA improves conversion for faster closing.</p>
              </div>
            </div>
          </motion.div>
        </motion.section>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Garment({ productId, colorHex, side }: { productId: ProductId; colorHex: string; side: Side }) {
  const collar = colorHex.toLowerCase() === "#f9fafb" ? "#d4d4d8" : "#0f172a";
  const path = GARMENT_PATHS[productId];
  const highlight = HIGHLIGHT_PATHS[productId];
  const id = gradientId(productId, side);
  const light = colorHex.toLowerCase() === "#f9fafb";

  return (
    <svg viewBox="0 0 640 760" className="relative z-10 h-full w-full drop-shadow-[0_26px_28px_rgba(15,23,42,0.22)]">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={light ? "#f8fafc" : colorHex} />
          <stop offset="68%" stopColor={light ? "#eef2f7" : "#0f172a"} />
        </linearGradient>
      </defs>

      <path d={path} fill={`url(#${id})`} stroke={light ? "#d1d5db" : "#0b1220"} strokeWidth={8} />
      <path d={highlight} fill="none" stroke={light ? "#d4d4d8" : "rgba(255,255,255,0.25)"} strokeWidth={10} strokeLinecap="round" />

      {productId === "polo" && (
        <>
          <path d="M286 145L320 214L354 145" fill={collar} />
          <path d="M286 145L320 194L354 145" fill="#111827" />
        </>
      )}
      {productId === "hoodie" && (
        <>
          <path d="M222 164C254 116 386 116 418 164L376 240H264L222 164Z" fill={collar} opacity={0.94} />
          <path d="M320 242L320 328" stroke={light ? "#9ca3af" : "rgba(255,255,255,0.35)"} strokeWidth={7} strokeLinecap="round" />
        </>
      )}

      {side === "back" && (
        <path d="M184 246C234 224 406 224 456 246" fill="none" stroke={light ? "#9ca3af" : "rgba(255,255,255,0.2)"} strokeWidth={6} />
      )}
    </svg>
  );
}
