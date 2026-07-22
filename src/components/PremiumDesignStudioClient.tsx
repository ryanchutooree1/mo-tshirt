"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Crosshair,
  Focus,
  ImagePlus,
  Layers3,
  Loader2,
  Magnet,
  Maximize2,
  MessageCircle,
  Move,
  PackageCheck,
  Palette,
  RotateCcw,
  RotateCw,
  Send,
  Shirt,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  UploadCloud,
  X,
  ZoomIn,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";
import { formatMoney } from "@/lib/money";

type ProductId = "tshirt" | "polo" | "hoodie";
type Side = "front" | "back";
type MethodId = "dtf" | "screen" | "vinyl";
type StudioStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Size = "XS" | "S" | "M" | "L" | "XL" | "2XL" | "3XL";
type Layer = "artwork" | "text";

type SideDesign = {
  artwork: { enabled: boolean; x: number; y: number; scale: number; rotate: number };
  text: { enabled: boolean; value: string; color: string; size: number; rotate: number; x: number; y: number; font: string };
};

const PRODUCTS = [
  { id: "tshirt" as const, label: "T-Shirt", base: 230, min: 10, lead: "5–7 working days", image: "/design-studio/tshirt-realistic.png" },
  { id: "polo" as const, label: "Polo Shirt", base: 310, min: 10, lead: "6–8 working days", image: "/design-studio/polo-realistic.png" },
  { id: "hoodie" as const, label: "Hoodie", base: 690, min: 8, lead: "7–10 working days", image: "/design-studio/hoodie-realistic.png" },
];

const COLORS = [
  { id: "black", label: "Jet Black", hex: "#111318", add: 0 },
  { id: "white", label: "Pure White", hex: "#fafafa", add: 0 },
  { id: "navy", label: "Navy", hex: "#1e293b", add: 15 },
  { id: "red", label: "Red", hex: "#be1e2d", add: 15 },
  { id: "blue", label: "Royal Blue", hex: "#1d4ed8", add: 15 },
  { id: "green", label: "Forest", hex: "#166534", add: 20 },
  { id: "sand", label: "Sand", hex: "#d6b58b", add: 10 },
  { id: "charcoal", label: "Charcoal", hex: "#374151", add: 10 },
];

const METHODS = [
  { id: "dtf" as const, label: "DTF full colour", add: 60, note: "Best for logos, photos and gradients." },
  { id: "screen" as const, label: "Screen printing", add: 30, note: "Crisp and cost-effective for bulk orders." },
  { id: "vinyl" as const, label: "Vinyl heat press", add: 45, note: "Ideal for names, numbers and simple shapes." },
];

const SIZES: Size[] = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const STEPS: { id: StudioStep; label: string; short: string }[] = [
  { id: 1, label: "Choose product", short: "Product" },
  { id: 2, label: "Garment details", short: "Details" },
  { id: 3, label: "Choose print area", short: "Print area" },
  { id: 4, label: "Upload artwork", short: "Artwork" },
  { id: 5, label: "Position design", short: "Position" },
  { id: 6, label: "Add custom text", short: "Text" },
  { id: 7, label: "Review order", short: "Review" },
  { id: 8, label: "Request quote", short: "Quote" },
];

const DELIVERY_OPTIONS = [
  "Surinam Pickup (Free)",
  "Post Office Postage Delivery (Rs 100)",
  "Post Office Express Delivery (Rs 150)",
  "Delivery (Need to arrange first)",
];

const PRINT_ZONES: Record<ProductId, { left: number; top: number; width: number; height: number }> = {
  tshirt: { left: 28, top: 27, width: 44, height: 45 },
  polo: { left: 28, top: 27, width: 44, height: 45 },
  hoodie: { left: 27, top: 30, width: 46, height: 42 },
};
const LAYER_X_LIMIT = 65;
const LAYER_Y_LIMIT = 80;

function createDesign(): SideDesign {
  return {
    artwork: { enabled: false, x: 0, y: -8, scale: 34, rotate: 0 },
    text: { enabled: false, value: "", color: "#ffffff", size: 34, rotate: 0, x: 0, y: 22, font: "Arial, sans-serif" },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function PremiumDesignStudioClient() {
  const [step, setStep] = useState<StudioStep>(1);
  const [productId, setProductId] = useState<ProductId>("tshirt");
  const [colorId, setColorId] = useState("black");
  const [methodId, setMethodId] = useState<MethodId>("dtf");
  const [activeSide, setActiveSide] = useState<Side>("front");
  const [designs, setDesigns] = useState<Record<Side, SideDesign>>({ front: createDesign(), back: createDesign() });
  const [sizes, setSizes] = useState<Record<Size, number>>({ XS: 0, S: 0, M: 1, L: 0, XL: 0, "2XL": 0, "3XL": 0 });
  const [rush, setRush] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [snap, setSnap] = useState(true);
  const [selectedLayer, setSelectedLayer] = useState<Layer | null>(null);
  const [artworkFiles, setArtworkFiles] = useState<Record<Side, File | null>>({ front: null, back: null });
  const [artworkUrls, setArtworkUrls] = useState<Record<Side, string | null>>({ front: null, back: null });
  const [delivery, setDelivery] = useState(DELIVERY_OPTIONS[0]);
  const [client, setClient] = useState({ name: "", email: "", phone: "", deadline: "", deliveryName: "", address: "", postCode: "", deliveryPhone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const artworkInput = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<Side>("front");
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const printZoneRef = useRef<HTMLDivElement | null>(null);
  const artworkFrameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; layer: Layer; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const artworkTransformRef = useRef<{ pointerId: number; kind: "rotate" | "scale"; startAngle: number; startDistance: number; originRotate: number; originScale: number; changed: boolean } | null>(null);
  const skipArtworkTransformClick = useRef(false);

  const product = PRODUCTS.find((item) => item.id === productId) ?? PRODUCTS[0];
  const color = COLORS.find((item) => item.id === colorId) ?? COLORS[0];
  const method = METHODS.find((item) => item.id === methodId) ?? METHODS[0];
  const activeDesign = designs[activeSide];
  const activeArtworkUrl = artworkUrls[activeSide];
  const printZone = PRINT_ZONES[productId];
  const totalQty = SIZES.reduce((sum, size) => sum + sizes[size], 0);
  const selectedSizes = SIZES.filter((size) => sizes[size] > 0).map((size) => `${size} × ${sizes[size]}`).join(", ") || "None";
  const decoratedSides = (["front", "back"] as Side[]).filter((side) => (designs[side].artwork.enabled && artworkUrls[side]) || (designs[side].text.enabled && designs[side].text.value.trim())).length;
  const artworkSides = (["front", "back"] as Side[]).filter((side) => artworkFiles[side]).map((side) => `${side[0].toUpperCase()}${side.slice(1)}`).join(" + ") || "Text only";
  const discount = totalQty >= 100 ? 0.14 : totalQty >= 50 ? 0.1 : totalQty >= 20 ? 0.06 : 0;
  const unitPrice = Math.round((product.base + color.add + method.add + Math.max(0, decoratedSides - 1) * 35) * (1 - discount));
  const setupFee = totalQty > 0 && totalQty < product.min ? 750 : 0;
  const totalPrice = unitPrice * totalQty + setupFee + (rush ? Math.round(unitPrice * totalQty * 0.12) : 0);
  const needsDelivery = delivery !== DELIVERY_OPTIONS[0];
  const canSubmit = totalQty > 0 && client.name.trim() !== "" && (client.email.trim() !== "" || client.phone.trim() !== "") && (!needsDelivery || (client.deliveryName.trim() !== "" && client.address.trim() !== ""));
  const today = useMemo(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10), []);

  useEffect(() => () => { if (artworkUrls.front) URL.revokeObjectURL(artworkUrls.front); }, [artworkUrls.front]);
  useEffect(() => () => { if (artworkUrls.back) URL.revokeObjectURL(artworkUrls.back); }, [artworkUrls.back]);

  function patchArtwork(patch: Partial<SideDesign["artwork"]>, side = activeSide) {
    setDesigns((current) => ({ ...current, [side]: { ...current[side], artwork: { ...current[side].artwork, ...patch } } }));
  }

  function patchText(patch: Partial<SideDesign["text"]>, side = activeSide) {
    setDesigns((current) => ({ ...current, [side]: { ...current[side], text: { ...current[side].text, ...patch } } }));
  }

  function changeSide(side: Side) {
    setActiveSide(side);
    setSelectedLayer(null);
  }

  function openArtworkPicker(side: Side) {
    uploadTarget.current = side;
    artworkInput.current?.click();
  }

  function chooseArtwork(file: File, side: Side) {
    const allowed = /\.(png|jpe?g|webp|svg)$/i.test(file.name);
    if (!allowed || file.size > 5 * 1024 * 1024) {
      setResult({ ok: false, text: "Upload a PNG, JPG, WEBP or SVG file under 5MB." });
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setArtworkFiles((current) => ({ ...current, [side]: file }));
    setArtworkUrls((current) => ({ ...current, [side]: nextUrl }));
    setResult(null);
    changeSide(side);
    patchArtwork({ enabled: true, x: 0, y: -8, scale: 34, rotate: 0 }, side);
  }

  function handleArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) chooseArtwork(file, uploadTarget.current);
  }

  function clearArtwork(side: Side) {
    setArtworkUrls((current) => ({ ...current, [side]: null }));
    setArtworkFiles((current) => ({ ...current, [side]: null }));
    patchArtwork({ enabled: false }, side);
    if (side === activeSide) setSelectedLayer(null);
  }

  function copyArtworkToOppositeSide() {
    const file = artworkFiles[activeSide];
    if (!file) return;
    const targetSide: Side = activeSide === "front" ? "back" : "front";
    const nextUrl = URL.createObjectURL(file);
    setArtworkFiles((current) => ({ ...current, [targetSide]: file }));
    setArtworkUrls((current) => ({ ...current, [targetSide]: nextUrl }));
    setDesigns((current) => ({ ...current, [targetSide]: { ...current[targetSide], artwork: { ...current[activeSide].artwork, enabled: true } } }));
  }

  function placeLayer(layer: Layer, x: number, y: number) {
    const nextX = snap && Math.abs(x) < 3 ? 0 : x;
    const nextY = snap && Math.abs(y) < 3 ? 0 : y;
    if (layer === "artwork") patchArtwork({ x: clamp(nextX, -LAYER_X_LIMIT, LAYER_X_LIMIT), y: clamp(nextY, -LAYER_Y_LIMIT, LAYER_Y_LIMIT) });
    else patchText({ x: clamp(nextX, -LAYER_X_LIMIT, LAYER_X_LIMIT), y: clamp(nextY, -LAYER_Y_LIMIT, LAYER_Y_LIMIT) });
  }

  function beginDrag(layer: Layer) {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const target = layer === "artwork" ? activeDesign.artwork : activeDesign.text;
      dragRef.current = { pointerId: event.pointerId, layer, startX: event.clientX, startY: event.clientY, originX: target.x, originY: target.y };
      setSelectedLayer(layer);
      canvasRef.current?.setPointerCapture(event.pointerId);
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const bounds = printZoneRef.current?.getBoundingClientRect();
    if (!drag || !bounds || drag.pointerId !== event.pointerId) return;
    placeLayer(drag.layer, drag.originX + ((event.clientX - drag.startX) / bounds.width) * 100, drag.originY + ((event.clientY - drag.startY) / bounds.height) * 100);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  }

  function beginArtworkTransform(kind: "rotate" | "scale") {
    return (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = artworkFrameRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const centreX = bounds.left + bounds.width / 2;
      const centreY = bounds.top + bounds.height / 2;
      const offsetX = event.clientX - centreX;
      const offsetY = event.clientY - centreY;
      artworkTransformRef.current = { pointerId: event.pointerId, kind, startAngle: Math.atan2(offsetY, offsetX), startDistance: Math.hypot(offsetX, offsetY), originRotate: activeDesign.artwork.rotate, originScale: activeDesign.artwork.scale, changed: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedLayer("artwork");
    };
  }

  function moveArtworkTransform(event: ReactPointerEvent<HTMLButtonElement>) {
    const transform = artworkTransformRef.current;
    const bounds = artworkFrameRef.current?.getBoundingClientRect();
    if (!transform || !bounds || transform.pointerId !== event.pointerId) return;
    const offsetX = event.clientX - (bounds.left + bounds.width / 2);
    const offsetY = event.clientY - (bounds.top + bounds.height / 2);
    if (transform.kind === "rotate") {
      const angle = Math.atan2(offsetY, offsetX);
      const delta = ((angle - transform.startAngle) * 180) / Math.PI;
      transform.changed ||= Math.abs(delta) > 1;
      patchArtwork({ rotate: clamp(Math.round(transform.originRotate + delta), -180, 180) });
    } else {
      const distance = Math.hypot(offsetX, offsetY);
      const ratio = transform.startDistance > 0 ? distance / transform.startDistance : 1;
      transform.changed ||= Math.abs(ratio - 1) > 0.02;
      patchArtwork({ scale: clamp(Math.round(transform.originScale * ratio), 20, 78) });
    }
  }

  function endArtworkTransform(event: ReactPointerEvent<HTMLButtonElement>) {
    const transform = artworkTransformRef.current;
    if (!transform || transform.pointerId !== event.pointerId) return;
    skipArtworkTransformClick.current = transform.changed;
    if (transform.changed) setTimeout(() => { skipArtworkTransformClick.current = false; }, 0);
    artworkTransformRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function activateArtworkTransform(kind: "rotate" | "scale") {
    if (skipArtworkTransformClick.current) {
      skipArtworkTransformClick.current = false;
      return;
    }
    if (kind === "rotate") patchArtwork({ rotate: activeDesign.artwork.rotate >= 165 ? -180 : activeDesign.artwork.rotate + 15 });
    else patchArtwork({ scale: activeDesign.artwork.scale >= 78 ? 20 : Math.min(78, activeDesign.artwork.scale + 8) });
  }

  const summary = `Hi MO T-SHIRT, I would like a quote.\nProduct: ${product.label}\nColour: ${color.label}\nPrint: ${method.label}\nArtwork: ${artworkSides}\nSizes: ${selectedSizes}\nQuantity: ${totalQty}\nEstimate: ${formatMoney(totalPrice)}`;
  const whatsappUrl = getWhatsAppUrl(summary);

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) { setResult({ ok: false, text: "Add a client name, contact method and valid delivery details." }); return; }
    setSubmitting(true);
    setResult(null);
    const payload = new FormData();
    payload.append("name", client.name.trim());
    payload.append("email", client.email.trim());
    payload.append("phone", client.phone.trim());
    payload.append("message", "Premium Design Studio request submitted via mo-tshirt.mu (admin)");
    payload.append("garment", product.label);
    payload.append("size", SIZES.find((size) => sizes[size] > 0) || "Mixed");
    payload.append("printMethod", method.label);
    payload.append("quantity", String(totalQty));
    payload.append("garments", JSON.stringify(SIZES.filter((size) => sizes[size] > 0).map((size) => ({ garment: product.label, size, quantity: sizes[size] }))));
    payload.append("deadline", client.deadline);
    payload.append("notes", client.notes);
    payload.append("source", "Premium Admin Design Studio");
    payload.append("delivery", delivery);
    payload.append("deliveryName", client.deliveryName);
    payload.append("deliveryAddress", client.address);
    payload.append("deliveryPostCode", client.postCode);
    payload.append("deliveryPhone", client.deliveryPhone);
    const submittedArtworks = (["front", "back"] as Side[]).flatMap((side) => {
      const file = artworkFiles[side];
      return file ? [{ side, file }] : [];
    });
    payload.append("designBrief", JSON.stringify({ product: product.label, colour: color.label, printMethod: method.label, activeSide, front: designs.front, back: designs.back, artworkFiles: { front: artworkFiles.front?.name || "", back: artworkFiles.back?.name || "" }, sizes, totalQty, estimatedTotal: totalPrice, rush }));
    payload.append("attachments", JSON.stringify(submittedArtworks.map(({ side, file }) => ({ label: `${side[0].toUpperCase()}${side.slice(1)} artwork`, description: `${product.label} ${side} print artwork`, filename: `${side}-${file.name}`, contentType: file.type, size: file.size }))));
    submittedArtworks.forEach(({ side, file }) => payload.append("files", file, `${side}-${file.name}`));
    try {
      const response = await fetch("/api/contact", { method: "POST", body: payload });
      const body = (await response.json()) as { message?: string; error?: string };
      setResult(response.ok ? { ok: true, text: body.message || "Your design has been submitted successfully." } : { ok: false, text: body.error || "Could not send the request." });
    } catch {
      setResult({ ok: false, text: "Network error. Please try again or use WhatsApp." });
    } finally {
      setSubmitting(false);
    }
  }

  const activeStep = STEPS[step - 1];
  const goTo = (value: number) => setStep(clamp(value, 1, STEPS.length) as StudioStep);

  return (
    <div className="premium-studio min-h-screen bg-[#f5f5f2] text-[#1b1b18] [font-family:var(--font-studio-body)]">
      <header className="border-b border-[#e5e4df] bg-[#fff]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold hover:bg-[#f4f3ef]"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Back to admin</span></Link>
          <div className="text-center"><p className="text-[15px] font-extrabold tracking-[-0.025em]">MO T-Shirt<span className="text-[#ff5a0a]">.mu</span></p><p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#8c8b85]">Premium Design Studio</p></div>
          <div className="flex h-11 items-center gap-2 rounded-xl border border-[#e5e4df] bg-[#fafaf8] px-3 text-xs font-semibold text-[#696862]"><BadgeCheck className="h-4 w-4 text-[#16a462]" /><span className="hidden sm:inline">Live preview</span></div>
        </div>
      </header>

      <section className="border-b border-[#e5e4df] bg-[#fff] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#fff0e8] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d94500]"><Sparkles className="h-3.5 w-3.5" />Live customiser</div><h1 className="text-3xl font-bold tracking-[-0.045em] text-[#161613] [font-family:var(--font-studio-display)] sm:text-5xl">Design it. <span className="text-[#ff5a0a]">We print it.</span></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#6e6d67] sm:text-base">Build a production-ready garment mockup, then send every detail to the MO T-Shirt team in one request.</p></div>
            <div className="w-full max-w-md"><div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-[#77766f]"><span>Step {step} of {STEPS.length}</span><span>{Math.round((step / STEPS.length) * 100)}% complete</span></div><div className="h-2 overflow-hidden rounded-full bg-[#ecebe6]"><motion.div className="h-full rounded-full bg-[#ff5a0a]" animate={{ width: `${(step / STEPS.length) * 100}%` }} /></div></div>
          </div>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1 xl:hidden">{STEPS.map((item) => <button key={item.id} type="button" onClick={() => setStep(item.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${step === item.id ? "studio-primary border-[#ff5a0a] bg-[#ff5a0a] !text-white" : step > item.id ? "border-[#ffd5c1] bg-[#fff5ef] text-[#c54306]" : "border-[#e4e3dd] bg-[#fff] text-[#73726c]"}`}><span>{step > item.id ? <Check className="h-3.5 w-3.5" /> : item.id}</span>{item.short}</button>)}</div>
        </div>
      </section>

      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-7">
        <div className="grid items-start gap-5 xl:grid-cols-[230px_minmax(0,1fr)]">
          <nav className="hidden rounded-[24px] border border-[#e1e0da] bg-[#fff] p-3 shadow-[0_14px_45px_rgba(29,27,20,0.05)] xl:block" aria-label="Design steps">
            {STEPS.map((item) => <button key={item.id} type="button" onClick={() => setStep(item.id)} aria-current={step === item.id ? "step" : undefined} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${step === item.id ? "studio-dark bg-[#171714] !text-white" : "text-[#686761] hover:bg-[#f5f4f0]"}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${step === item.id ? "studio-primary bg-[#ff5a0a] !text-white" : step > item.id ? "bg-[#fff0e8] text-[#df4d08]" : "bg-[#f1f0ec] text-[#8d8c85]"}`}>{step > item.id ? <Check className="h-4 w-4" /> : item.id}</span><span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[0.13em] opacity-55">Step {item.id}</span><span className="mt-0.5 block text-[13px] font-bold leading-tight">{item.label}</span></span><ChevronRight className="ml-auto h-4 w-4 opacity-25" /></button>)}
            <div className="mt-3 rounded-2xl bg-[#f6f5f1] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a8982]">Need help?</p><a href={`tel:${CONTACT_TEL}`} className="mt-2 flex items-center gap-2 text-xs font-bold"><MessageCircle className="h-4 w-4 text-[#ff5a0a]" />{CONTACT_PHONE_DISPLAY}</a></div>
          </nav>

          <form onSubmit={submitQuote} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,.8fr)]">
            <section className="overflow-hidden rounded-[26px] border border-[#dfded8] bg-[#fff] shadow-[0_18px_55px_rgba(32,30,24,0.07)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecebe6] px-4 py-3.5 sm:px-5"><div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#99978f]">Live preview</p><h2 className="mt-0.5 text-lg font-bold tracking-[-0.025em]">{product.label} · {activeSide}</h2></div><div className="flex items-center gap-1.5">{(["front", "back"] as Side[]).map((side) => <button key={side} type="button" onClick={() => changeSide(side)} className={`rounded-xl px-4 py-2 text-xs font-bold capitalize ${activeSide === side ? "studio-primary bg-[#ff5a0a] !text-white" : "bg-[#f4f3ef] text-[#686761]"}`}>{side}</button>)}<button type="button" onClick={() => { setDesigns({ front: createDesign(), back: createDesign() }); setSelectedLayer(null); }} className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl border border-[#e1e0da] text-[#66655f]" aria-label="Reset design"><RotateCcw className="h-4 w-4" /></button></div></div>
              <div className="bg-[radial-gradient(circle_at_50%_0%,#ffffff_0%,#f5f3ed_55%,#eeece5_100%)] p-3 sm:p-6">
                <div ref={canvasRef} onPointerDown={() => setSelectedLayer(null)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="relative mx-auto aspect-[4/5] w-full max-w-[550px] overflow-hidden rounded-[24px] border border-[#fff] bg-[#fff]/30" style={{ touchAction: "none" }}>
                  <div className="pointer-events-none absolute inset-0 z-10"><div className="relative h-full w-full origin-center transition duration-200" style={{ transform: `scale(${previewZoom / 100})` }}><Image src={product.image} alt={`Realistic ${product.label} preview`} fill priority sizes="(min-width: 1024px) 550px, 92vw" className="object-contain drop-shadow-[0_26px_28px_rgba(15,23,42,.22)]" /></div></div>
                  <div ref={printZoneRef} className="absolute z-30" style={{ left: `${printZone.left}%`, top: `${printZone.top}%`, width: `${printZone.width}%`, height: `${printZone.height}%` }}>
                    {activeDesign.text.enabled && activeDesign.text.value.trim() ? <div onPointerDown={beginDrag("text")} className={`absolute cursor-grab select-none rounded px-1 active:cursor-grabbing ${selectedLayer === "text" ? "ring-2 ring-[#2f80ed] ring-offset-1" : ""}`} style={{ left: `${50 + activeDesign.text.x}%`, top: `${50 + activeDesign.text.y}%`, transform: `translate(-50%,-50%) rotate(${activeDesign.text.rotate}deg)`, color: activeDesign.text.color, fontFamily: activeDesign.text.font, fontSize: `${activeDesign.text.size}px`, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap", textShadow: "0 2px 8px rgba(0,0,0,.24)" }}>{activeDesign.text.value}</div> : null}
                    {activeDesign.artwork.enabled && activeArtworkUrl ? <div ref={artworkFrameRef} onPointerDown={beginDrag("artwork")} className="absolute cursor-grab select-none active:cursor-grabbing" style={{ left: `${50 + activeDesign.artwork.x}%`, top: `${50 + activeDesign.artwork.y}%`, width: `${activeDesign.artwork.scale}%`, aspectRatio: "1/1", transform: "translate(-50%,-50%)" }}><div className={`relative h-full w-full ${selectedLayer === "artwork" ? "outline outline-2 outline-[#2947d3] outline-offset-1" : ""}`} style={{ transform: `rotate(${activeDesign.artwork.rotate}deg)` }}><img src={activeArtworkUrl} alt={`${activeSide} artwork on garment`} className="pointer-events-none h-full w-full object-contain" /></div>{selectedLayer === "artwork" ? <><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => clearArtwork(activeSide)} className="absolute -left-5 -top-5 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#f2d2cd] bg-white text-[#e53b2f] shadow-[0_6px_18px_rgba(22,26,35,.22)]" aria-label={`Remove ${activeSide} artwork`} title="Remove artwork"><X className="h-5 w-5" /></button><button type="button" onPointerDown={beginArtworkTransform("rotate")} onPointerMove={moveArtworkTransform} onPointerUp={endArtworkTransform} onPointerCancel={endArtworkTransform} onClick={() => activateArtworkTransform("rotate")} className="absolute -right-5 -top-5 z-20 flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)] active:cursor-grabbing" aria-label="Rotate artwork" title="Drag to rotate"><RotateCw className="h-5 w-5" /></button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={copyArtworkToOppositeSide} className="absolute -bottom-5 -left-5 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)]" aria-label={`Copy artwork to ${activeSide === "front" ? "back" : "front"}`} title={`Copy to ${activeSide === "front" ? "back" : "front"}`}><Copy className="h-4.5 w-4.5" /></button><button type="button" onPointerDown={beginArtworkTransform("scale")} onPointerMove={moveArtworkTransform} onPointerUp={endArtworkTransform} onPointerCancel={endArtworkTransform} onClick={() => activateArtworkTransform("scale")} className="absolute -bottom-5 -right-5 z-20 flex h-9 w-9 touch-none cursor-nwse-resize items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)]" aria-label="Resize artwork" title="Drag to resize"><Maximize2 className="h-5 w-5" /></button></> : null}</div> : null}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t border-[#ecebe6] bg-[#fbfbf9] sm:grid-cols-4"><PreviewStat label="Garment" value={product.label} /><PreviewStat label="Colour" value={color.label} /><PreviewStat label="Quantity" value={String(totalQty)} /><PreviewStat label="Estimate" value={formatMoney(totalPrice)} accent /></div>
            </section>

            <aside className="flex min-h-[600px] flex-col rounded-[26px] border border-[#dfded8] bg-[#fff] shadow-[0_18px_55px_rgba(32,30,24,0.07)]">
              <div className="border-b border-[#ecebe6] px-5 py-5"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff0e8] text-sm font-extrabold text-[#e44c04]">{step}</span><div><h2 className="text-xl font-bold tracking-[-0.03em]">{activeStep.label}</h2><p className="mt-1 text-xs leading-5 text-[#77766f]">{stepCopy(step)}</p></div></div></div>
              <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex-1 p-5">
                {step === 1 ? <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">{PRODUCTS.map((option) => <button key={option.id} type="button" onClick={() => setProductId(option.id)} className={`relative flex items-center gap-4 rounded-2xl border p-3 text-left transition ${productId === option.id ? "border-[#ff5a0a] bg-[#fff8f3] ring-2 ring-[#ff5a0a]/10" : "border-[#e2e1dc] hover:border-[#bbb9b1]"}`}><span className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_35%,#ffffff_0%,#ecebe7_100%)] p-1.5"><Image src={option.image} alt={`Realistic black ${option.label}`} width={200} height={200} sizes="80px" className="h-full w-full object-contain drop-shadow-[0_8px_10px_rgba(20,20,18,.18)]" /></span><span><span className="block text-sm font-extrabold">{option.label}</span><span className="mt-1 block text-xs text-[#7a7972]">From {formatMoney(option.base)}</span><span className="mt-2 block text-[9px] font-bold uppercase tracking-[0.1em] text-[#a09e96]">{option.lead}</span></span>{productId === option.id ? <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-[#ff5a0a]" /> : null}</button>)}</div> : null}

                {step === 2 ? <div className="space-y-6"><div><Label>Garment colour</Label><div className="mt-3 grid grid-cols-4 gap-2.5">{COLORS.map((swatch) => <button key={swatch.id} type="button" onClick={() => setColorId(swatch.id)} className={`relative aspect-square rounded-2xl border-2 p-1.5 ${swatch.id === colorId ? "border-[#ff5a0a]" : "border-[#e4e3de]"}`} title={swatch.label} aria-label={`Choose ${swatch.label}`}><span className="block h-full rounded-xl border border-black/10" style={{ backgroundColor: swatch.hex }} />{swatch.id === colorId ? <Check className={`absolute inset-0 m-auto h-4 w-4 ${swatch.id === "white" ? "text-[#222]" : "!text-white"}`} /> : null}</button>)}</div><p className="mt-2 text-xs font-semibold text-[#77766f]">{color.label}</p></div><div><div className="flex justify-between"><Label>Size quantities</Label><span className="studio-dark rounded-full bg-[#171714] px-2.5 py-1 text-[9px] font-bold !text-white">{totalQty} total</span></div><div className="mt-3 grid grid-cols-4 gap-2">{SIZES.map((size) => <label key={size} className={`rounded-xl border p-2 text-center ${sizes[size] ? "border-[#ff5a0a] bg-[#fff8f3]" : "border-[#e4e3de]"}`}><span className="block text-[10px] font-extrabold">{size}</span><input inputMode="numeric" value={sizes[size] || ""} onChange={(event) => { const value = event.target.value; if (/^\d*$/.test(value)) setSizes((current) => ({ ...current, [size]: Number(value) || 0 })); }} className="studio-field mt-1 h-8 w-full rounded-lg bg-[#fff] text-center text-xs font-bold outline-none" placeholder="0" aria-label={`${size} quantity`} /></label>)}</div></div><label className="flex items-center justify-between rounded-2xl border border-[#e4e3de] p-4"><span><span className="block text-sm font-bold">Rush production</span><span className="mt-1 block text-xs text-[#85847d]">Adds 12% to your estimate</span></span><input type="checkbox" checked={rush} onChange={(event) => setRush(event.target.checked)} className="h-5 w-5 accent-[#ff5a0a]" /></label></div> : null}

                {step === 3 ? <div className="space-y-6"><div><Label>Print side</Label><div className="mt-3 grid grid-cols-2 gap-3">{(["front", "back"] as Side[]).map((side) => <button key={side} type="button" onClick={() => changeSide(side)} className={`rounded-2xl border p-4 text-left ${activeSide === side ? "border-[#ff5a0a] bg-[#fff8f3]" : "border-[#e4e3de]"}`}><div className="flex justify-between"><Layers3 className="h-5 w-5 text-[#ff5a0a]" />{activeSide === side ? <CheckCircle2 className="h-5 w-5 text-[#ff5a0a]" /> : null}</div><p className="mt-5 text-sm font-extrabold capitalize">{side}</p><p className="mt-1 text-xs text-[#85847d]">Design the {side} side.</p></button>)}</div></div><div><Label>Print method</Label><div className="mt-3 space-y-2.5">{METHODS.map((option) => <label key={option.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-3.5 ${methodId === option.id ? "border-[#ff5a0a] bg-[#fff8f3]" : "border-[#e4e3de]"}`}><input type="radio" name="method" checked={methodId === option.id} onChange={() => setMethodId(option.id)} className="mt-1 accent-[#ff5a0a]" /><span><span className="block text-sm font-bold">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[#85847d]">{option.note}</span></span></label>)}</div></div></div> : null}

                {step === 4 ? <div className="space-y-4"><div className="rounded-2xl border border-[#ffd8c4] bg-[linear-gradient(135deg,#fff8f3_0%,#fff_100%)] p-4"><div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff5a0a] text-white"><Layers3 className="h-5 w-5" /></span><div><p className="text-sm font-extrabold">One file for each print side</p><p className="mt-1 text-xs leading-5 text-[#7d6b62]">Upload separate artwork for the front and back. You can add either side or both.</p></div></div></div><input ref={artworkInput} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onClick={(event) => { event.currentTarget.value = ""; }} onChange={handleArtwork} className="hidden" />{(["front", "back"] as Side[]).map((side) => <ArtworkUploadSlot key={side} side={side} file={artworkFiles[side]} url={artworkUrls[side]} active={activeSide === side} onChoose={() => openArtworkPicker(side)} onDrop={(file) => chooseArtwork(file, side)} onRemove={() => clearArtwork(side)} onPosition={() => { changeSide(side); setStep(5); }} />)}<div className="flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8d8b84]"><BadgeCheck className="h-4 w-4 text-[#16a462]" />PNG, JPG, WEBP or SVG · 5MB per file</div>{result && !result.ok ? <p className="rounded-xl bg-[#fff1f1] p-3 text-xs text-[#b91c1c]">{result.text}</p> : null}</div> : null}

                {step === 5 ? <div className="space-y-4"><div><Label>Artwork side</Label><div className="mt-2 grid grid-cols-2 gap-2">{(["front", "back"] as Side[]).map((side) => <button key={side} type="button" onClick={() => changeSide(side)} className={`rounded-2xl border p-3 text-left transition ${activeSide === side ? "border-[#ff5a0a] bg-[#fff8f3] ring-2 ring-[#ff5a0a]/10" : "border-[#e2e1dc] bg-white"}`}><span className="flex items-center justify-between"><span className="text-xs font-extrabold capitalize">{side}</span>{artworkUrls[side] ? <CheckCircle2 className="h-4 w-4 text-[#16a462]" /> : <span className="h-2 w-2 rounded-full bg-[#d5d3cc]" />}</span><span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.08em] text-[#96948c]">{artworkUrls[side] ? "Artwork ready" : "No artwork"}</span></button>)}</div></div>{activeArtworkUrl ? <><div className="flex items-center gap-3 rounded-2xl border border-[#c9ead8] bg-[#f4fbf7] p-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 shadow-sm"><img src={activeArtworkUrl} alt={`${activeSide} artwork preview`} className="h-full w-full object-contain" /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-[#168455]">Editing {activeSide}</span><span className="mt-1 block truncate text-xs font-bold">{artworkFiles[activeSide]?.name}</span></span></div><div className="grid grid-cols-3 gap-2"><PresetButton icon={<Crosshair />} label="Left chest" onClick={() => patchArtwork({ x: -28, y: -38 })} /><PresetButton icon={<Focus />} label="Centre" onClick={() => patchArtwork({ x: 0, y: 0 })} /><PresetButton icon={<Move />} label="Lower" onClick={() => patchArtwork({ x: 0, y: 52 })} /></div><RangeControl icon={<ZoomIn />} label="Artwork size" value={activeDesign.artwork.scale} min={20} max={78} suffix="%" onChange={(value) => patchArtwork({ scale: value })} /><RangeControl icon={<Move />} label="Horizontal" value={activeDesign.artwork.x} min={-LAYER_X_LIMIT} max={LAYER_X_LIMIT} onChange={(value) => patchArtwork({ x: value })} /><RangeControl icon={<Move className="rotate-90" />} label="Vertical" value={activeDesign.artwork.y} min={-LAYER_Y_LIMIT} max={LAYER_Y_LIMIT} onChange={(value) => patchArtwork({ y: value })} /><RangeControl icon={<RotateCcw />} label="Rotation" value={activeDesign.artwork.rotate} min={-180} max={180} suffix="°" onChange={(value) => patchArtwork({ rotate: value })} /><button type="button" onClick={() => setSnap((current) => !current)} className={`flex w-full items-center justify-between rounded-2xl border p-4 ${snap ? "border-[#bfe9d4] bg-[#f1fbf6]" : "border-[#e2e1dc]"}`}><span className="flex items-center gap-2 text-sm font-bold"><Magnet className="h-4 w-4 text-[#16a462]" />Snap to centre</span><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${snap ? "studio-success bg-[#16a462] !text-white" : "bg-[#efeee9]"}`}>{snap ? "ON" : "OFF"}</span></button></> : <div className="flex min-h-64 flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-[#ddd9d1] bg-[#fafaf7] p-6 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#ff5a0a] shadow-[0_8px_25px_rgba(35,32,24,.08)]"><ImagePlus className="h-6 w-6" /></span><p className="mt-4 text-sm font-extrabold">No {activeSide} artwork yet</p><p className="mt-1 max-w-[250px] text-xs leading-5 text-[#85847d]">Upload an image for this side before positioning it, or continue to add text only.</p><button type="button" onClick={() => setStep(4)} className="studio-primary mt-4 inline-flex items-center gap-2 rounded-xl bg-[#ff5a0a] px-4 py-2.5 text-xs font-bold !text-white"><UploadCloud className="h-4 w-4" />Go to uploads</button></div>}</div> : null}

                {step === 6 ? <div className="space-y-5"><label className="flex items-center justify-between rounded-2xl border border-[#e2e1dc] p-4"><span className="flex items-center gap-2 text-sm font-bold"><TypeIcon className="h-4 w-4 text-[#ff5a0a]" />Custom text</span><input type="checkbox" checked={activeDesign.text.enabled} onChange={(event) => patchText({ enabled: event.target.checked })} className="h-5 w-5 accent-[#ff5a0a]" /></label><Field label="Your text"><input value={activeDesign.text.value} onChange={(event) => patchText({ value: event.target.value, enabled: true })} className="studio-field" placeholder="e.g. Team Mauritius" /></Field><div className="grid grid-cols-[1fr_72px] gap-3"><Field label="Font"><select value={activeDesign.text.font} onChange={(event) => patchText({ font: event.target.value })} className="studio-field"><option value="Arial, sans-serif">Modern sans</option><option value="Impact, sans-serif">Impact</option><option value="Georgia, serif">Classic serif</option><option value="cursive">Signature</option></select></Field><Field label="Colour"><input type="color" value={activeDesign.text.color} onChange={(event) => patchText({ color: event.target.value })} className="studio-field p-1.5" /></Field></div><RangeControl icon={<TypeIcon />} label="Text size" value={activeDesign.text.size} min={18} max={72} onChange={(value) => patchText({ size: value })} /><RangeControl icon={<RotateCcw />} label="Rotation" value={activeDesign.text.rotate} min={-180} max={180} suffix="°" onChange={(value) => patchText({ rotate: value })} /><div className="grid grid-cols-3 gap-2"><PresetButton icon={<Crosshair />} label="Left chest" onClick={() => patchText({ x: -20, y: -18 })} /><PresetButton icon={<Focus />} label="Centre" onClick={() => patchText({ x: 0, y: 0 })} /><PresetButton icon={<Move />} label="Lower" onClick={() => patchText({ x: 0, y: 24 })} /></div></div> : null}

                {step === 7 ? <div className="space-y-4"><div className="rounded-2xl border border-[#e2e1dc] p-4"><Label>Order summary</Label><dl className="mt-3 space-y-3"><SummaryRow label="Product" value={product.label} /><SummaryRow label="Colour" value={color.label} /><SummaryRow label="Artwork files" value={artworkSides} /><SummaryRow label="Print method" value={method.label} /><SummaryRow label="Sizes" value={selectedSizes} /><SummaryRow label="Lead time" value={product.lead} /></dl></div><div className="studio-dark rounded-2xl bg-[#171714] p-5 !text-white"><div className="flex justify-between text-xs text-[#aaa9a2]"><span>Total quantity</span><span>{totalQty}</span></div><div className="mt-3 flex items-end justify-between"><span className="text-xs text-[#aaa9a2]">Estimated total</span><span className="text-2xl font-extrabold">{formatMoney(totalPrice)}</span></div><p className="mt-3 border-t border-white/10 pt-3 text-[9px] leading-4 text-[#888780]">Final pricing is confirmed after our team reviews artwork size and production requirements.</p></div><Field label="Order notes"><textarea value={client.notes} onChange={(event) => setClient((current) => ({ ...current, notes: event.target.value }))} className="studio-field min-h-24 resize-none py-3" placeholder="Special instructions, placement details..." /></Field></div> : null}

                {step === 8 ? result?.ok ? <Success message={result.text} onReset={() => { setResult(null); setStep(1); }} /> : <div className="space-y-4"><Field label="Client name *"><input required value={client.name} onChange={(event) => setClient((current) => ({ ...current, name: event.target.value }))} className="studio-field" placeholder="Full name" /></Field><div className="grid gap-3 2xl:grid-cols-2"><Field label="Email"><input type="email" value={client.email} onChange={(event) => setClient((current) => ({ ...current, email: event.target.value }))} className="studio-field" placeholder="you@example.com" /></Field><Field label="Phone / WhatsApp"><input type="tel" value={client.phone} onChange={(event) => setClient((current) => ({ ...current, phone: event.target.value }))} className="studio-field" placeholder="+230 5..." /></Field></div><Field label="Preferred deadline"><input type="date" min={today} value={client.deadline} onChange={(event) => setClient((current) => ({ ...current, deadline: event.target.value }))} className="studio-field" /></Field><Field label="Delivery"><select value={delivery} onChange={(event) => setDelivery(event.target.value)} className="studio-field">{DELIVERY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>{needsDelivery ? <div className="space-y-3 rounded-2xl bg-[#f5f4f0] p-4"><Field label="Delivery name *"><input value={client.deliveryName} onChange={(event) => setClient((current) => ({ ...current, deliveryName: event.target.value }))} className="studio-field" /></Field><Field label="Address *"><input value={client.address} onChange={(event) => setClient((current) => ({ ...current, address: event.target.value }))} className="studio-field" /></Field><div className="grid grid-cols-2 gap-2"><input value={client.postCode} onChange={(event) => setClient((current) => ({ ...current, postCode: event.target.value }))} className="studio-field" placeholder="Post code" /><input value={client.deliveryPhone} onChange={(event) => setClient((current) => ({ ...current, deliveryPhone: event.target.value }))} className="studio-field" placeholder="Phone" /></div></div> : null}<div className="rounded-2xl border border-[#ffd2bd] bg-[#fff7f1] p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#8b5d47]">Estimated total</span><span className="text-xl font-extrabold text-[#dd4904]">{formatMoney(totalPrice)}</span></div></div>{result && !result.ok ? <p className="rounded-xl bg-[#fff1f1] p-3 text-xs text-[#b91c1c]">{result.text}</p> : null}<a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#bce8d1] bg-[#f0fbf5] px-4 py-3 text-sm font-bold text-[#087b45]"><MessageCircle className="h-4 w-4" />Send details on WhatsApp</a></div> : null}
              </motion.div>
              {!result?.ok ? <div className="sticky bottom-0 mt-auto border-t border-[#ecebe6] bg-[#fff]/95 p-4 backdrop-blur"><div className="flex gap-2.5">{step > 1 ? <button type="button" onClick={() => goTo(step - 1)} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#deddd7] px-4 text-sm font-bold"><ChevronLeft className="h-4 w-4" />Back</button> : null}{step < STEPS.length ? <button type="button" onClick={() => goTo(step + 1)} className="studio-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff5a0a] px-4 text-sm font-bold !text-white shadow-[0_10px_24px_rgba(255,90,10,.22)]">Next step<ArrowRight className="h-4 w-4" /></button> : <button type="submit" disabled={!canSubmit || submitting} className="studio-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff5a0a] px-4 text-sm font-bold !text-white shadow-[0_10px_24px_rgba(255,90,10,.22)] disabled:cursor-not-allowed disabled:opacity-45">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? "Sending..." : "Request final price"}</button>}</div></div> : null}
            </aside>
          </form>
        </div>
      </main>

      <footer className="border-t border-[#e3e2dc] bg-[#fff] px-4 py-7 sm:px-6"><div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-5 sm:grid-cols-4"><Benefit icon={<Shirt />} title="Premium garments" /><Benefit icon={<Palette />} title="High-quality printing" /><Benefit icon={<PackageCheck />} title="Reliable service" /><Benefit icon={<CircleDollarSign />} title="Local pricing" /></div><div className="mx-auto mt-6 flex max-w-[1200px] flex-wrap justify-center gap-x-5 gap-y-2 border-t border-[#efeee9] pt-5 text-[10px] text-[#77766f]"><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><span>•</span><a href={`tel:${CONTACT_TEL}`}>{CONTACT_PHONE_DISPLAY}</a></div></footer>
    </div>
  );
}

function stepCopy(step: StudioStep) {
  return ["Start with the garment that fits your idea.", "Select colour, sizes and the quantity you need.", "Choose the side and best production method.", "Upload a high-quality logo or illustration.", "Resize, move and fine-tune the artwork.", "Add an optional name, message or team line.", "Check every detail before sending it.", "Tell us where to send the final price."][step - 1];
}

function Label({ children }: { children: ReactNode }) { return <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#77766f]">{children}</p>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><Label>{label}</Label><div className="mt-1.5">{children}</div></label>; }
function PreviewStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="border-r border-[#ecebe6] px-4 py-3 last:border-r-0"><p className="text-[8px] font-bold uppercase tracking-[0.13em] text-[#99978f]">{label}</p><p className={`mt-1 truncate text-xs font-extrabold ${accent ? "text-[#e74d05]" : "text-[#34332f]"}`}>{value}</p></div>; }
function SummaryRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-[#efeee9] pb-3 last:border-0 last:pb-0"><dt className="text-xs text-[#85847d]">{label}</dt><dd className="max-w-[65%] text-right text-xs font-bold capitalize">{value}</dd></div>; }
function RangeControl({ icon, label, value, min, max, suffix = "", onChange }: { icon: ReactNode; label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) { return <label className="block rounded-2xl border border-[#e2e1dc] p-4"><span className="flex justify-between text-xs font-bold"><span className="flex items-center gap-2 text-[#575650] [&_svg]:h-4 [&_svg]:w-4">{icon}{label}</span><span className="rounded-md bg-[#f1f0ec] px-2 py-1 text-[9px] text-[#77766f]">{value}{suffix}</span></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-4 w-full accent-[#ff5a0a]" /></label>; }
function PresetButton({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled?: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="rounded-2xl border border-[#e2e1dc] p-3 text-center disabled:opacity-35"><span className="flex justify-center text-[#ff5a0a] [&_svg]:h-5 [&_svg]:w-5">{icon}</span><span className="mt-2 block text-[10px] font-bold">{label}</span></button>; }
function Benefit({ icon, title }: { icon: ReactNode; title: string }) { return <div className="flex items-center justify-center gap-3 sm:justify-start"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff0e8] text-[#ff5a0a] [&_svg]:h-5 [&_svg]:w-5">{icon}</span><span className="text-xs font-bold text-[#4a4944]">{title}</span></div>; }
function Success({ message, onReset }: { message: string; onReset: () => void }) { return <div className="flex min-h-[430px] flex-col items-center justify-center text-center"><span className="studio-success flex h-20 w-20 items-center justify-center rounded-full bg-[#1faf68] !text-white"><Check className="h-10 w-10" /></span><h3 className="mt-6 text-3xl font-extrabold">Thank you!</h3><p className="mt-2 max-w-xs text-sm leading-6 text-[#77766f]">{message}</p><div className="mt-6 rounded-2xl bg-[#f5f4f0] p-4 text-sm"><Label>What happens next</Label><p className="mt-2 font-semibold">We will review your design and confirm the final price within 24 hours.</p></div><button type="button" onClick={onReset} className="studio-primary mt-5 w-full rounded-xl bg-[#ff5a0a] px-4 py-3 text-sm font-bold !text-white">Create another design</button></div>; }

function ArtworkUploadSlot({ side, file, url, active, onChoose, onDrop, onRemove, onPosition }: { side: Side; file: File | null; url: string | null; active: boolean; onChoose: () => void; onDrop: (file: File) => void; onRemove: () => void; onPosition: () => void }) {
  const title = `${side[0].toUpperCase()}${side.slice(1)}`;

  return (
    <section className={`overflow-hidden rounded-[22px] border transition ${file ? "border-[#cbded3] bg-[#fbfefc]" : active ? "border-[#ffb48f] bg-[#fffaf7]" : "border-[#dfded8] bg-white"}`} aria-label={`${title} artwork upload`}>
      <div className="flex items-center justify-between border-b border-[#ecebe6] px-4 py-3">
        <div className="flex items-center gap-2.5"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${side === "front" ? "bg-[#fff0e8] text-[#e94f08]" : "bg-[#efefff] text-[#5551c8]"}`}><Shirt className="h-4 w-4" /></span><div><h3 className="text-sm font-extrabold">{title} artwork</h3><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#97958e]">Printed on the {side}</p></div></div>
        {file ? <span className="flex items-center gap-1 rounded-full bg-[#eaf8f0] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#13814f]"><CheckCircle2 className="h-3.5 w-3.5" />Ready</span> : <span className="rounded-full bg-[#f2f1ed] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#8b8982]">Optional</span>}
      </div>
      {file && url ? <div className="p-3.5"><div className="flex items-center gap-3"><span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#e6e5df] bg-[radial-gradient(circle_at_50%_35%,#fff_0%,#f0efeb_100%)] p-2"><img src={url} alt={`${title} artwork preview`} className="h-full w-full object-contain" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{file.name}</p><p className="mt-1 text-[10px] text-[#86847d]">{(file.size / 1024 / 1024).toFixed(2)} MB · Uploaded separately</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onChoose} className="rounded-lg border border-[#dcdbd5] bg-white px-3 py-2 text-[10px] font-bold hover:border-[#ff9c6c]">Replace</button><button type="button" onClick={onRemove} className="flex items-center gap-1 rounded-lg border border-[#f0d5d5] bg-[#fffafa] px-3 py-2 text-[10px] font-bold text-[#b94343]"><Trash2 className="h-3.5 w-3.5" />Remove</button></div></div></div><button type="button" onClick={onPosition} className="mt-3 flex w-full items-center justify-between rounded-xl bg-[#181815] px-4 py-3 text-xs font-bold text-white"><span>Position {title.toLowerCase()} artwork</span><ArrowRight className="h-4 w-4" /></button></div> : <button type="button" onClick={onChoose} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const droppedFile = event.dataTransfer.files?.[0]; if (droppedFile) onDrop(droppedFile); }} className="group flex min-h-36 w-full flex-col items-center justify-center p-5 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a0a] focus-visible:ring-inset"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f5f4f0] text-[#ff5a0a] transition group-hover:bg-[#fff0e8]"><UploadCloud className="h-5 w-5" /></span><span className="mt-3 text-xs font-extrabold">Choose {title.toLowerCase()} artwork</span><span className="mt-1 text-[10px] text-[#8a8982]">Browse or drag and drop here</span></button>}
    </section>
  );
}
