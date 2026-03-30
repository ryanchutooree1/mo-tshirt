"use client";
 

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Crosshair,
  Focus,
  ImagePlus,
  Loader2,
  Magnet,
  Palette,
  RotateCcw,
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
import { formatMoney as formatDisplayMoney } from "@/lib/money";

type ProductId = "tshirt" | "polo" | "hoodie";
type MethodId = "dtf" | "screen" | "vinyl";
type Side = "front" | "back";
type FontId = "display" | "body" | "impact" | "script";
type DesignStudioMode = "public" | "admin";

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
];

const FONTS: { id: FontId; label: string; value: string }[] = [
  { id: "display", label: "Bold Display", value: "var(--font-studio-display)" },
  { id: "body", label: "Modern Sans", value: "var(--font-studio-body)" },
  { id: "impact", label: "Impact", value: "'Impact','Arial Black',sans-serif" },
  { id: "script", label: "Signature", value: "'Brush Script MT','Segoe Script',cursive" },
];

const SIZE_FIELDS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
type SizeField = (typeof SIZE_FIELDS)[number];

const DELIVERY_OPTIONS = [
  "Surinam Pickup (Free)",
  `Post Office Postage Delivery (${formatDisplayMoney(100)})`,
  `Post Office Express Delivery (${formatDisplayMoney(150)})`,
  "Delivery (Need to arrange first)",
];
const PICKUP_OPTION = DELIVERY_OPTIONS[0];

const LOGO_ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]);
const LOGO_ALLOWED_TEXT = "PNG, JPG, WEBP, or SVG";
const LOGO_BG_CLEANUP_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

type ClientState = {
  name: string;
  email: string;
  phone: string;
  deadline: string;
  notes: string;
  deliveryName: string;
  deliveryAddress: string;
  deliveryPostCode: string;
  deliveryPhone: string;
};

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

const PRINT_ZONES: Record<ProductId, { left: number; top: number; width: number; height: number }> = {
  tshirt: { left: 28, top: 27, width: 44, height: 45 },
  polo: { left: 28, top: 26, width: 44, height: 46 },
  hoodie: { left: 27, top: 30, width: 46, height: 42 },
};

const GARMENT_PATHS: Record<ProductId, string> = {
  tshirt:
    "M118 236L204 168Q250 132 320 132Q390 132 436 168L522 236L556 332L514 356L482 302L468 700H172L158 302L126 356L84 332L118 236Z",
  polo:
    "M126 246L212 176Q262 138 320 138Q378 138 428 176L514 246L548 338L506 362L476 316L462 700H178L164 316L134 362L92 338L126 246Z",
  hoodie:
    "M140 258L218 188Q252 156 320 156Q388 156 422 188L500 258L548 334L512 360L488 326L468 700H172L152 326L128 360L92 334L140 258Z",
};

function createSideDesign(defaultText: string, textEnabled = true): SideDesign {
  return {
    text: {
      enabled: textEnabled,
      value: defaultText,
      color: "#0f172a",
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
      y: -8,
      scale: 32,
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

function snapValue(value: number, threshold: number) {
  return Math.abs(value) <= threshold ? 0 : value;
}

function estimateTextBounds(text: string, size: number) {
  const charCount = Math.max(text.trim().length, 2);
  const width = clamp(18 + (charCount * size) / 11, 26, 92);
  const height = clamp(size / 2.1 + 8, 16, 56);
  return { width, height };
}

function clampPosition(x: number, y: number, boxWidth: number, boxHeight: number) {
  const maxX = Math.max(0, (100 - boxWidth) / 2);
  const maxY = Math.max(0, (100 - boxHeight) / 2);
  return {
    x: clamp(x, -maxX, maxX),
    y: clamp(y, -maxY, maxY),
  };
}

function isValidPhoneInput(value: string) {
  return /^[0-9+()\s-]+$/.test(value);
}

function isValidPostCode(value: string) {
  return /^\d+$/.test(value);
}

function renderImageFileToCanvas(file: File, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  return new Promise<void>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(objectUrl);
      resolve();
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read logo image."));
    };
    image.src = objectUrl;
  });
}

async function removeNearWhiteBackground(file: File) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Image editor is unavailable in this browser.");
  }

  await renderImageFileToCanvas(file, canvas, ctx);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const whiteThreshold = 236;
  const softness = 20;
  const neutralTolerance = 34;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = data[i + 3];
    const brightness = (r + g + b) / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);

    if (brightness < whiteThreshold - softness || chroma > neutralTolerance) {
      continue;
    }

    const fade = clamp((brightness - (whiteThreshold - softness)) / softness, 0, 1);
    const nextAlpha = Math.round(alpha * (1 - fade));
    data[i + 3] = nextAlpha < 8 ? 0 : nextAlpha;
  }

  ctx.putImageData(imageData, 0, 0);

  const cleanedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!cleanedBlob) {
    throw new Error("Could not process logo background.");
  }

  const baseName = file.name.replace(/\.[a-z0-9]+$/i, "");
  return new File([cleanedBlob], `${baseName}-transparent.png`, { type: "image/png" });
}

type DesignStudioClientProps = {
  mode?: DesignStudioMode;
};

export default function DesignStudioClient({ mode = "public" }: DesignStudioClientProps) {
  const isAdminMode = mode === "admin";
  const backHref = isAdminMode ? "/admin" : "/";
  const backLabel = isAdminMode ? "Back to admin" : "Back to home";
  const studioName = isAdminMode ? "MO Admin Design Studio" : "MO T-SHIRT Design Studio";
  const studioBanner = isAdminMode ? "Admin Design Studio (Testing)" : "Public Design Studio";
  const sourceLabel = isAdminMode ? "Admin Design Studio" : "Design Studio";
  const submissionMessage = isAdminMode
    ? "Design Studio request submitted via mo-tshirt.mu (admin testing)"
    : "Design Studio request submitted via mo-tshirt.mu";
  const [productId, setProductId] = useState<ProductId>("tshirt");
  const [colorId, setColorId] = useState<(typeof COLORS)[number]["id"]>("jet-black");
  const [methodId, setMethodId] = useState<MethodId>("dtf");
  const [activeSide, setActiveSide] = useState<Side>("front");
  const [designBySide, setDesignBySide] = useState<Record<Side, SideDesign>>({
    front: createSideDesign("", true),
    back: createSideDesign("", false),
  });
  const [sizeQuantities, setSizeQuantities] = useState<Record<SizeField, string>>({
    XS: "",
    S: "",
    M: "",
    L: "",
    XL: "",
    "2XL": "",
    "3XL": "",
    "4XL": "",
  });
  const [client, setClient] = useState<ClientState>({
    name: "",
    email: "",
    phone: "",
    deadline: "",
    notes: "",
    deliveryName: "",
    deliveryAddress: "",
    deliveryPostCode: "",
    deliveryPhone: "",
  });
  const [delivery, setDelivery] = useState(DELIVERY_OPTIONS[0]);
  const [rush, setRush] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoOriginalFile, setLogoOriginalFile] = useState<File | null>(null);
  const [logoBgRemoved, setLogoBgRemoved] = useState(false);
  const [processingBgRemoval, setProcessingBgRemoval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<"text" | "logo">("text");
  const [snapToGuides, setSnapToGuides] = useState(true);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [deliveryPhoneError, setDeliveryPhoneError] = useState<string | null>(null);
  const [deliveryPostCodeError, setDeliveryPostCodeError] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const logoOriginalObjectUrlRef = useRef<string | null>(null);
  const logoProcessedObjectUrlRef = useRef<string | null>(null);

  const activeDesign = designBySide[activeSide];
  const product = PRODUCTS.find((entry) => entry.id === productId) ?? PRODUCTS[0];
  const method = METHODS.find((entry) => entry.id === methodId) ?? METHODS[0];
  const color = COLORS.find((entry) => entry.id === colorId) ?? COLORS[0];
  const printZone = PRINT_ZONES[productId];

  function revokeLogoUrls() {
    if (logoOriginalObjectUrlRef.current) {
      URL.revokeObjectURL(logoOriginalObjectUrlRef.current);
      logoOriginalObjectUrlRef.current = null;
    }
    if (logoProcessedObjectUrlRef.current) {
      URL.revokeObjectURL(logoProcessedObjectUrlRef.current);
      logoProcessedObjectUrlRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (logoOriginalObjectUrlRef.current) {
        URL.revokeObjectURL(logoOriginalObjectUrlRef.current);
        logoOriginalObjectUrlRef.current = null;
      }
      if (logoProcessedObjectUrlRef.current) {
        URL.revokeObjectURL(logoProcessedObjectUrlRef.current);
        logoProcessedObjectUrlRef.current = null;
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
  const selectedSizes = useMemo(
    () =>
      SIZE_FIELDS.map((size) => ({
        size,
        quantity: Number(sizeQuantities[size]) || 0,
      })).filter((entry) => entry.quantity > 0),
    [sizeQuantities]
  );
  const selectedSizesLabel = useMemo(() => {
    if (!selectedSizes.length) return "None";
    return selectedSizes.map((entry) => `${entry.size} x ${entry.quantity}`).join(" | ");
  }, [selectedSizes]);

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
  const trimmedEmail = client.email.trim();
  const trimmedPhone = client.phone.trim();
  const trimmedName = client.name.trim();
  const trimmedDeliveryPhone = client.deliveryPhone.trim();
  const trimmedDeliveryPostCode = client.deliveryPostCode.trim();
  const needsDeliveryDetails = delivery !== PICKUP_OPTION;
  const requiresEmail = trimmedPhone.length === 0;
  const requiresPhone = trimmedEmail.length === 0;
  const todayIso = useMemo(() => {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
  }, []);
  const hasValidDeliveryDetails =
    !needsDeliveryDetails || (client.deliveryName.trim().length > 0 && client.deliveryAddress.trim().length > 0);
  const canAutoCleanLogo = !!logoOriginalFile && LOGO_BG_CLEANUP_MIME_TYPES.has((logoOriginalFile.type || "").toLowerCase());
  const hasFieldErrors = Boolean(phoneError || (needsDeliveryDetails && (deliveryPhoneError || deliveryPostCodeError)));
  const canSubmitQuote =
    totalQty > 0 &&
    trimmedName.length > 0 &&
    (trimmedEmail.length > 0 || trimmedPhone.length > 0) &&
    hasValidDeliveryDetails &&
    !hasFieldErrors &&
    !submitting;

  useEffect(() => {
    if (!needsDeliveryDetails) {
      setDeliveryPhoneError(null);
      setDeliveryPostCodeError(null);
    }
  }, [needsDeliveryDetails]);

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

  function placeLayer(side: Side, layer: "text" | "logo", targetX: number, targetY: number) {
    if (layer === "text") {
      const textState = designBySide[side].text;
      const bounds = estimateTextBounds(textState.value, textState.size);
      const snappedX = snapToGuides ? snapValue(targetX, 2.8) : targetX;
      const snappedY = snapToGuides ? snapValue(targetY, 2.8) : targetY;
      const clamped = clampPosition(snappedX, snappedY, bounds.width, bounds.height);
      patchText(side, clamped);
      return;
    }

    const logoState = designBySide[side].logo;
    const width = clamp(logoState.scale, 20, 78);
    const height = width;
    const snappedX = snapToGuides ? snapValue(targetX, 2.4) : targetX;
    const snappedY = snapToGuides ? snapValue(targetY, 2.4) : targetY;
    const clamped = clampPosition(snappedX, snappedY, width, height);
    patchLogo(side, clamped);
  }

  function centerLayer(layer: "text" | "logo") {
    placeLayer(activeSide, layer, 0, 0);
    setSelectedLayer(layer);
  }

  function applyPreset(layer: "text" | "logo", preset: "leftChest" | "center" | "lower") {
    const positions: Record<"leftChest" | "center" | "lower", { x: number; y: number }> = {
      leftChest: { x: -22, y: -20 },
      center: { x: 0, y: -2 },
      lower: { x: 0, y: 22 },
    };
    const target = positions[preset];
    placeLayer(activeSide, layer, target.x, target.y);
    setSelectedLayer(layer);
  }

  function resetDesigner() {
    setDesignBySide({
      front: createSideDesign("", true),
      back: createSideDesign("", false),
    });
    setSelectedLayer("text");
  }

  function updateClient<K extends keyof ClientState>(key: K, value: ClientState[K]) {
    setClient((prev) => ({ ...prev, [key]: value }));
  }

  function updateQuantity(size: SizeField, value: string) {
    if (!/^\d*$/.test(value)) return;
    setSizeQuantities((prev) => ({ ...prev, [size]: value }));
  }

  function handlePhoneInput(value: string) {
    updateClient("phone", value);
    if (!value) {
      setPhoneError(null);
      return;
    }
    setPhoneError(isValidPhoneInput(value) ? null : "Use only numbers and + ( ) -");
  }

  function handleDeliveryPhoneInput(value: string) {
    updateClient("deliveryPhone", value);
    if (!value) {
      setDeliveryPhoneError(null);
      return;
    }
    setDeliveryPhoneError(isValidPhoneInput(value) ? null : "Use only numbers and + ( ) -");
  }

  function handleDeliveryPostCodeInput(value: string) {
    updateClient("deliveryPostCode", value);
    if (!value) {
      setDeliveryPostCodeError(null);
      return;
    }
    setDeliveryPostCodeError(isValidPostCode(value) ? null : "Numbers only");
  }

  function openLogoPicker() {
    logoInputRef.current?.click();
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const mimeType = file.type.toLowerCase();
    const extensionAllowed = /\.(png|jpe?g|webp|svg)$/i.test(file.name);
    const typeAllowed = mimeType ? LOGO_ALLOWED_MIME_TYPES.has(mimeType) : extensionAllowed;

    if (!typeAllowed) {
      setResult({ ok: false, text: `Please upload a ${LOGO_ALLOWED_TEXT} logo file.` });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setResult({ ok: false, text: "Logo is too large. Please upload a file under 5MB." });
      return;
    }

    revokeLogoUrls();

    const previewUrl = URL.createObjectURL(file);
    logoOriginalObjectUrlRef.current = previewUrl;

    setLogoPreview(previewUrl);
    setLogoFile(file);
    setLogoOriginalFile(file);
    setLogoBgRemoved(false);
    setResult(null);
    setSelectedLayer("logo");
    setDesignBySide((prev) => ({
      ...prev,
      [activeSide]: {
        ...prev[activeSide],
        text: {
          ...prev[activeSide].text,
          y: prev[activeSide].text.enabled ? 18 : prev[activeSide].text.y,
        },
        logo: {
          ...prev[activeSide].logo,
          enabled: true,
          x: 0,
          y: -8,
          scale: 32,
          opacity: 100,
        },
      },
    }));
  }

  async function cleanLogoBackground() {
    if (!logoOriginalFile) return;
    if (!canAutoCleanLogo) {
      setResult({ ok: false, text: "Background cleanup works best with PNG, JPG, or WEBP logos." });
      return;
    }

    setProcessingBgRemoval(true);
    try {
      const cleanedFile = await removeNearWhiteBackground(logoOriginalFile);
      if (logoProcessedObjectUrlRef.current) {
        URL.revokeObjectURL(logoProcessedObjectUrlRef.current);
      }
      const cleanedUrl = URL.createObjectURL(cleanedFile);
      logoProcessedObjectUrlRef.current = cleanedUrl;
      setLogoPreview(cleanedUrl);
      setLogoFile(cleanedFile);
      setLogoBgRemoved(true);
      setResult({ ok: true, text: "Logo background cleaned. You can still switch back to the original." });
    } catch {
      setResult({ ok: false, text: "Could not remove logo background from this file." });
    } finally {
      setProcessingBgRemoval(false);
    }
  }

  function useOriginalLogo() {
    if (!logoOriginalFile || !logoOriginalObjectUrlRef.current) return;
    setLogoPreview(logoOriginalObjectUrlRef.current);
    setLogoFile(logoOriginalFile);
    setLogoBgRemoved(false);
    setResult(null);
  }

  function clearLogo() {
    revokeLogoUrls();
    setLogoPreview(null);
    setLogoFile(null);
    setLogoOriginalFile(null);
    setLogoBgRemoved(false);
    setProcessingBgRemoval(false);
    setSelectedLayer("text");
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
      setSelectedLayer(layer);
      const target = layer === "text" ? activeDesign.text : activeDesign.logo;
      dragRef.current = {
        pointerId: event.pointerId,
        layer,
        startX: event.clientX,
        startY: event.clientY,
        originX: target.x,
        originY: target.y,
      };
      printAreaRef.current?.setPointerCapture(event.pointerId);
    };
  }

  function onPreviewPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = printAreaRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const deltaX = ((event.clientX - drag.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * 100;
    const x = drag.originX + deltaX;
    const y = drag.originY + deltaY;
    placeLayer(activeSide, drag.layer, x, y);
  }

  function onPreviewPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (printAreaRef.current?.hasPointerCapture(event.pointerId)) {
      printAreaRef.current.releasePointerCapture(event.pointerId);
    }
  }

  const summary = useMemo(() => {
    const front = designBySide.front;
    const back = designBySide.back;
    const sizes = selectedSizesLabel;
    const frontText = front.text.enabled ? front.text.value.trim() : "";
    const backText = back.text.enabled ? back.text.value.trim() : "";
    const frontLogo = front.logo.enabled && !!logoPreview;
    const backLogo = back.logo.enabled && !!logoPreview;
    const designSelections = [
      frontText ? `Front text: ${frontText}` : "",
      backText ? `Back text: ${backText}` : "",
      frontLogo ? "Front logo" : "",
      backLogo ? "Back logo" : "",
    ].filter(Boolean);
    return [
      `Hi MO T-SHIRT, I want a quote from ${sourceLabel}.`,
      `Product: ${product.label}`,
      `Color: ${color.label}`,
      `Print method: ${method.label}`,
      designSelections.length ? `Design selected: ${designSelections.join(" | ")}` : "",
      `Selected sizes: ${sizes}`,
      `Total qty: ${totalQty}`,
      `Estimated total: ${formatDisplayMoney(totalPrice)}`,
      `Delivery: ${delivery}`,
      client.deliveryName ? `Delivery name: ${client.deliveryName}` : "",
      client.deliveryAddress ? `Delivery address: ${client.deliveryAddress}` : "",
      client.deliveryPhone ? `Delivery phone: ${client.deliveryPhone}` : "",
      `Rush: ${rush ? "Yes" : "No"}`,
      client.deadline ? `Deadline: ${client.deadline}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [
    client.deadline,
    client.deliveryAddress,
    client.deliveryName,
    client.deliveryPhone,
    color.label,
    delivery,
    designBySide,
    logoPreview,
    method.label,
    product.label,
    rush,
    sourceLabel,
    selectedSizesLabel,
    totalPrice,
    totalQty,
  ]);

  const whatsappUrl = useMemo(() => getWhatsAppUrl(summary), [summary]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phoneOk = !trimmedPhone || isValidPhoneInput(trimmedPhone);
    const deliveryPhoneOk = !trimmedDeliveryPhone || isValidPhoneInput(trimmedDeliveryPhone);
    const deliveryPostCodeOk = !trimmedDeliveryPostCode || isValidPostCode(trimmedDeliveryPostCode);
    setPhoneError(phoneOk ? null : "Use only numbers and + ( ) -");
    setDeliveryPhoneError(deliveryPhoneOk ? null : "Use only numbers and + ( ) -");
    setDeliveryPostCodeError(deliveryPostCodeOk ? null : "Numbers only");
    if (!phoneOk || !deliveryPhoneOk || !deliveryPostCodeOk) {
      setResult({ ok: false, text: "Please fix contact or delivery field errors before sending." });
      return;
    }

    if (totalQty <= 0) {
      setResult({ ok: false, text: "Add at least one size quantity before sending." });
      return;
    }
    if (!trimmedEmail && !trimmedPhone) {
      setResult({ ok: false, text: "Add an email or phone number so we can reply to you." });
      return;
    }
    if (needsDeliveryDetails && (!client.deliveryName.trim() || !client.deliveryAddress.trim())) {
      setResult({ ok: false, text: "Please add delivery name and address for delivery orders." });
      return;
    }
    setSubmitting(true);
    setResult(null);

    const garmentLines = selectedSizes;

    const payload = new FormData();
    payload.append("name", trimmedName);
    payload.append("email", trimmedEmail);
    payload.append("message", submissionMessage);
    payload.append("phone", trimmedPhone);
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
      client.notes.trim()
    );
    payload.append(
      "designBrief",
      JSON.stringify({
        product: product.label,
        color: color.label,
        printMethod: method.label,
        frontText: designBySide.front.text.enabled ? designBySide.front.text.value.trim() : "",
        backText: designBySide.back.text.enabled ? designBySide.back.text.value.trim() : "",
        frontLogo: designBySide.front.logo.enabled && !!logoPreview,
        backLogo: designBySide.back.logo.enabled && !!logoPreview,
        selectedSizes: garmentLines,
        totalQty,
        estimatedTotal: totalPrice,
        rush,
        delivery,
        deadline: client.deadline.trim(),
        clientNotes: client.notes.trim(),
      })
    );
    payload.append("source", sourceLabel);
    payload.append("delivery", delivery);
    payload.append("deliveryName", client.deliveryName.trim());
    payload.append("deliveryAddress", client.deliveryAddress.trim());
    payload.append("deliveryPostCode", trimmedDeliveryPostCode);
    payload.append("deliveryPhone", trimmedDeliveryPhone);
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
  const pageClassName = isAdminMode
    ? "min-h-screen bg-white [font-family:var(--font-studio-body)] text-slate-900"
    : "min-h-screen bg-[linear-gradient(145deg,#fff7ea_0%,#fffdf8_45%,#ecfeff_100%)] [font-family:var(--font-studio-body)] text-slate-900";
  const studioNameClass = isAdminMode
    ? "rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm"
    : "rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 shadow-sm";
  const heroPanelClass = isAdminMode
    ? "mt-8 max-w-5xl rounded-[28px] border border-[#ebebeb] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-8"
    : "mt-8 max-w-5xl rounded-[28px] border border-white/70 bg-white/70 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-8";
  const accentTextClass = isAdminMode ? "text-slate-600" : "text-orange-600";
  const sidePanelClass = isAdminMode
    ? "rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.08)] sm:p-6"
    : "rounded-[28px] border border-[#ecdcc8] bg-white/95 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.08)] sm:p-6";
  const estimateCardClass = isAdminMode
    ? "rounded-2xl border border-slate-200 bg-white p-4"
    : "rounded-2xl border border-orange-200 bg-gradient-to-br from-[#fff7ed] to-[#fefce8] p-4";

  return (
    <div className={pageClassName}>
      <div className="relative overflow-hidden">
        {!isAdminMode ? (
          <>
            <div className="pointer-events-none absolute -top-20 left-0 h-80 w-80 rounded-full bg-[#f97316]/20 blur-3xl" />
            <div className="pointer-events-none absolute right-0 top-24 h-80 w-80 rounded-full bg-[#14b8a6]/20 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[#22c55e]/10 blur-3xl" />
          </>
        ) : null}

        <motion.section
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.08, duration: 0.4 }}
          className="relative mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8"
        >
          <motion.div variants={containerAnim} className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
            <p className={studioNameClass}>
              {studioName}
            </p>
          </motion.div>

          <motion.div variants={containerAnim} className={heroPanelClass}>
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${accentTextClass}`}>{studioBanner}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900 [font-family:var(--font-studio-display)] sm:text-6xl">
              Design your T-Shirt
            </h1>
            <p className="mt-4 max-w-4xl text-base text-slate-600 sm:text-lg">
              Create your style, place your logo, choose sizes, and send your order directly to our team.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
              <span className="rounded-full bg-white px-3 py-1 shadow-sm">Live mockup studio</span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm">Instant quote preview</span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                {isAdminMode ? "Internal testing mode" : "Ready for public orders"}
              </span>
            </div>
          </motion.div>

          <motion.div variants={containerAnim} className="mt-8 grid gap-6 xl:grid-cols-[1fr_1.45fr_1fr]">
            <article className={sidePanelClass}>
              <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${accentTextClass}`}>
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
                        From {formatDisplayMoney(option.baseUnit)} / unit
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
                <p className="text-sm font-semibold text-slate-800">3. Print method</p>
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

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSnapToGuides((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      snapToGuides ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-600 ring-1 ring-slate-200"
                    }`}
                  >
                    <Magnet className="h-3.5 w-3.5" />
                    Snap {snapToGuides ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    onClick={resetDesigner}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-slate-900"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </button>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white">
                    <Focus className="h-3.5 w-3.5" />
                    Selected: {selectedLayer}
                  </span>
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
                        min={18}
                        max={86}
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
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => centerLayer("text")}
                        className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:text-slate-900"
                      >
                        Center text
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset("text", "leftChest")}
                        className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:text-slate-900"
                      >
                        Left chest
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset("text", "lower")}
                        className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:text-slate-900"
                      >
                        Lower print
                      </button>
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
                      accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
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
                      <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={cleanLogoBackground}
                            disabled={!canAutoCleanLogo || processingBgRemoval}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition enabled:hover:border-slate-300 enabled:hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {processingBgRemoval ? "Cleaning..." : "Remove white background"}
                          </button>
                          <button
                            type="button"
                            onClick={useOriginalLogo}
                            disabled={!logoBgRemoved}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition enabled:hover:border-slate-300 enabled:hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Use original
                          </button>
                        </div>

                        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Size
                          <input
                            type="range"
                            min={20}
                            max={78}
                            value={activeDesign.logo.scale}
                            onChange={(event) => patchLogo(activeSide, { scale: Number(event.target.value) })}
                            className="mt-1 w-full"
                          />
                        </label>
                        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Opacity
                          <input
                            type="range"
                            min={20}
                            max={100}
                            value={activeDesign.logo.opacity}
                            onChange={(event) => patchLogo(activeSide, { opacity: Number(event.target.value) })}
                            className="mt-1 w-full"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Horizontal
                            <input
                              type="range"
                              min={-48}
                              max={48}
                              value={activeDesign.logo.x}
                              onChange={(event) => patchLogo(activeSide, { x: Number(event.target.value) })}
                              className="mt-1 w-full"
                            />
                          </label>
                          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Vertical
                            <input
                              type="range"
                              min={-48}
                              max={48}
                              value={activeDesign.logo.y}
                              onChange={(event) => patchLogo(activeSide, { y: Number(event.target.value) })}
                              className="mt-1 w-full"
                            />
                          </label>
                        </div>
                        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Rotation
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            value={activeDesign.logo.rotate}
                            onChange={(event) => patchLogo(activeSide, { rotate: Number(event.target.value) })}
                            className="mt-1 w-full"
                          />
                        </label>
                        <p className="text-[11px] text-slate-500">Drag logo in the canvas or use sliders for precise placement.</p>
                      </div>
                    )}
                    {logoPreview && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => centerLayer("logo")}
                          className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:text-slate-900"
                        >
                          Center logo
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset("logo", "leftChest")}
                          className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:text-slate-900"
                        >
                          Left chest
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset("logo", "center")}
                          className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:text-slate-900"
                        >
                          Center print
                        </button>
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
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  <Crosshair className="h-3.5 w-3.5" />
                  Drag • Snap • Center
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
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Zoom
                        <input
                          type="range"
                          min={85}
                          max={125}
                          value={previewZoom}
                          onChange={(event) => setPreviewZoom(Number(event.target.value))}
                        />
                      </label>
                    </div>
                  </div>

                  <div
                    ref={printAreaRef}
                    onPointerMove={onPreviewPointerMove}
                    onPointerUp={onPreviewPointerEnd}
                    onPointerCancel={onPreviewPointerEnd}
                    className="relative mx-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(120deg,#f0fdfa_0%,#f8fafc_45%,#fff7ed_100%)] p-4 sm:p-5"
                    style={{ touchAction: "none" }}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(249,115,22,0.2),transparent_36%),radial-gradient(circle_at_82%_18%,rgba(20,184,166,0.2),transparent_34%),radial-gradient(circle_at_50%_95%,rgba(59,130,246,0.14),transparent_35%)]" />

                    <div className="pointer-events-none absolute inset-5 z-10">
                      <div
                        className="h-full w-full origin-center transition duration-200"
                        style={{ transform: `scale(${previewZoom / 100})` }}
                      >
                        <Garment productId={product.id} side={activeSide} colorHex={color.hex} />
                      </div>
                    </div>

                    <div
                      className="absolute z-30 rounded-xl border border-dashed border-slate-300/70 bg-white/20 backdrop-blur-[1px]"
                      style={{
                        left: `${printZone.left}%`,
                        top: `${printZone.top}%`,
                        width: `${printZone.width}%`,
                        height: `${printZone.height}%`,
                      }}
                    >
                      <div className="pointer-events-none absolute inset-0">
                        <div className="absolute left-1/2 top-0 h-full border-l border-slate-300/50" />
                        <div className="absolute left-0 top-1/2 w-full border-t border-slate-300/50" />
                        <span className="absolute left-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Print area
                        </span>
                      </div>

                      {activeDesign.text.enabled && activeDesign.text.value.trim().length > 0 && (
                        <div
                          onPointerDown={beginDrag("text")}
                          className={`absolute left-1/2 top-1/2 cursor-grab select-none rounded-md px-1.5 py-0.5 active:cursor-grabbing ${
                            selectedLayer === "text" ? "ring-1 ring-blue-400/70" : ""
                          }`}
                          style={{
                            transform: `translate(calc(-50% + ${activeDesign.text.x}%), calc(-50% + ${activeDesign.text.y}%)) rotate(${activeDesign.text.rotate}deg)`,
                            color: activeDesign.text.color,
                            fontFamily: FONTS.find((item) => item.id === activeDesign.text.font)?.value,
                            fontSize: `${activeDesign.text.size}px`,
                            fontWeight: activeDesign.text.weight,
                            textShadow: "0 10px 22px rgba(15,23,42,0.35)",
                            lineHeight: 1.1,
                            whiteSpace: "pre-wrap",
                            textAlign: "center",
                            maxWidth: "92%",
                          }}
                        >
                          {activeDesign.text.value}
                        </div>
                      )}

                      {logoPreview ? (
                        <div
                          onPointerDown={beginDrag("logo")}
                          className={`absolute left-1/2 top-1/2 rounded-md ${
                            activeDesign.logo.enabled ? "cursor-grab active:cursor-grabbing" : "pointer-events-none opacity-40"
                          } ${selectedLayer === "logo" ? "ring-1 ring-blue-400/70" : ""}`}
                          style={{
                            transform: `translate(calc(-50% + ${activeDesign.logo.x}%), calc(-50% + ${activeDesign.logo.y}%)) rotate(${activeDesign.logo.rotate}deg)`,
                            opacity: activeDesign.logo.opacity / 100,
                          }}
                        >
                          <div
                            style={{
                              width: `${activeDesign.logo.scale}%`,
                            }}
                            className="relative aspect-square min-w-10"
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
                <PreviewStat label="Color surcharge" value={color.premium ? `+${formatDisplayMoney(color.premium)}` : "Included"} />
              </div>
            </article>

            <article className="rounded-[28px] border border-[#d9e3db] bg-white/95 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.08)] sm:p-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">
                <Sparkles className="h-4 w-4" />
                Quote
              </div>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">4. Sizes & quantity</p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Min {product.minQty}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {SIZE_FIELDS.map((size) => (
                      <label key={size} className="rounded-xl border border-slate-200 bg-white px-2 py-2" htmlFor={`size-${size}`}>
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{size}</span>
                        <input
                          id={`size-${size}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={sizeQuantities[size]}
                          onChange={(event) => updateQuantity(size, event.target.value)}
                          className="mt-1 w-full border-0 p-0 text-sm font-semibold text-slate-900 focus:outline-none"
                          placeholder="0"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-600">
                      Total pieces: <span className="font-semibold text-slate-900">{withCommas(totalQty)}</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-600">
                      Recommended: <span className="font-semibold text-slate-900">{product.minQty}+</span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600">
                    Selected sizes: <span className="font-semibold text-slate-900">{selectedSizesLabel}</span>
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

                <div className={estimateCardClass}>
                  <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${accentTextClass}`}>Live estimate</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Unit price</p>
                      <p className="text-base font-semibold text-slate-900">{formatDisplayMoney(unitPrice)}</p>
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
                      <p className="text-base font-semibold text-slate-900">{formatDisplayMoney(totalPrice)}</p>
                    </div>
                  </div>
                  {(setupFee > 0 || rushFee > 0) && (
                    <p className="mt-2 text-xs text-slate-500">
                      {setupFee > 0 ? `Setup: ${formatDisplayMoney(setupFee)}.` : ""} {rushFee > 0 ? `Rush: ${formatDisplayMoney(rushFee)}.` : ""}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-800">5. Contact details</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="client-name" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Client name *
                      </label>
                      <input
                        id="client-name"
                        required
                        value={client.name}
                        onChange={(event) => updateClient("name", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                        placeholder="Your full name"
                      />
                    </div>
                    <div>
                      <label htmlFor="client-email" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Email
                      </label>
                      <input
                        id="client-email"
                        type="email"
                        required={requiresEmail}
                        value={client.email}
                        onChange={(event) => updateClient("email", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="client-phone" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Phone / WhatsApp
                      </label>
                      <input
                        id="client-phone"
                        required={requiresPhone}
                        type="tel"
                        value={client.phone}
                        onChange={(event) => handlePhoneInput(event.target.value)}
                        className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-800 focus:outline-none ${
                          phoneError ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-slate-400"
                        }`}
                        placeholder="+230 5988 3880"
                      />
                      {phoneError && <p className="mt-1 text-xs text-rose-600">{phoneError}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="client-deadline" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Preferred deadline
                      </label>
                      <input
                        id="client-deadline"
                        type="date"
                        min={todayIso}
                        value={client.deadline}
                        onChange={(event) => updateClient("deadline", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Provide at least one contact method: email or phone/WhatsApp.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-800">6. Delivery</p>
                  <label htmlFor="delivery-option" className="sr-only">
                    Delivery option
                  </label>
                  <select
                    id="delivery-option"
                    value={delivery}
                    onChange={(event) => setDelivery(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  >
                    {DELIVERY_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>

                  {needsDeliveryDetails && (
                    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <label htmlFor="delivery-name" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Delivery name *
                        </label>
                        <input
                          id="delivery-name"
                          value={client.deliveryName}
                          onChange={(event) => updateClient("deliveryName", event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                          placeholder="Receiver full name"
                        />
                      </div>
                      <div>
                        <label htmlFor="delivery-address" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Delivery address *
                        </label>
                        <input
                          id="delivery-address"
                          value={client.deliveryAddress}
                          onChange={(event) => updateClient("deliveryAddress", event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                          placeholder="Street, area, town"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="delivery-postcode" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Post code
                          </label>
                          <input
                            id="delivery-postcode"
                            value={client.deliveryPostCode}
                            onChange={(event) => handleDeliveryPostCodeInput(event.target.value)}
                            className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none ${
                              deliveryPostCodeError ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-slate-400"
                            }`}
                            placeholder="Numbers only"
                          />
                          {deliveryPostCodeError && <p className="mt-1 text-xs text-rose-600">{deliveryPostCodeError}</p>}
                        </div>
                        <div>
                          <label htmlFor="delivery-phone" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Delivery phone
                          </label>
                          <input
                            id="delivery-phone"
                            value={client.deliveryPhone}
                            onChange={(event) => handleDeliveryPhoneInput(event.target.value)}
                            className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none ${
                              deliveryPhoneError ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-slate-400"
                            }`}
                            placeholder="+230 ..."
                          />
                          {deliveryPhoneError && <p className="mt-1 text-xs text-rose-600">{deliveryPhoneError}</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="client-notes" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Extra notes
                  </label>
                  <textarea
                    id="client-notes"
                    value={client.notes}
                    onChange={(event) => updateClient("notes", event.target.value)}
                    placeholder="Placement details, print size, color references, etc."
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSubmitQuote}
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
  const path = GARMENT_PATHS[productId];
  const id = gradientId(productId, side);
  const textureId = `${id}-texture`;
  const light = colorHex.toLowerCase() === "#f9fafb";
  const lineColor = light ? "#d6dbe4" : "rgba(255,255,255,0.2)";
  const collar = light ? "#e5e7eb" : "#0b1220";
  const deepShade = light ? "#eef2f8" : "#0b1220";

  return (
    <svg viewBox="0 0 640 760" className="pointer-events-none relative z-10 h-full w-full drop-shadow-[0_28px_30px_rgba(15,23,42,0.23)]">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={light ? "#ffffff" : colorHex} />
          <stop offset="68%" stopColor={deepShade} />
        </linearGradient>
        <pattern id={textureId} patternUnits="userSpaceOnUse" width="8" height="8">
          <path d="M0 8L8 0" stroke={light ? "rgba(148,163,184,0.15)" : "rgba(255,255,255,0.06)"} strokeWidth="1" />
        </pattern>
      </defs>

      <path d={path} fill={`url(#${id})`} stroke={light ? "#d1d5db" : "#0a1324"} strokeWidth={7} />
      <path d={path} fill={`url(#${textureId})`} opacity={0.55} />
      <path d="M198 182Q320 244 442 182" fill="none" stroke={lineColor} strokeWidth={8} strokeLinecap="round" />
      <path d="M178 694H462" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />

      {productId === "tshirt" && (
        <>
          <path d="M254 170Q320 126 386 170" fill="none" stroke={lineColor} strokeWidth={11} strokeLinecap="round" />
          <path d="M160 280L130 340" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
          <path d="M480 280L510 340" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
        </>
      )}

      {productId === "polo" && (
        <>
          <path d="M278 172L320 238L362 172" fill={collar} />
          <path d="M278 172L320 214L362 172" fill={light ? "#f5f6fa" : "#111827"} />
          <path d="M320 226V332" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
          <circle cx="320" cy="262" r="4.2" fill={light ? "#9ca3af" : "#f8fafc"} />
          <circle cx="320" cy="286" r="4.2" fill={light ? "#9ca3af" : "#f8fafc"} />
          <circle cx="320" cy="310" r="4.2" fill={light ? "#9ca3af" : "#f8fafc"} />
        </>
      )}

      {productId === "hoodie" && (
        <>
          <path d="M218 188Q250 112 320 112Q390 112 422 188L388 250H252L218 188Z" fill={collar} opacity={0.98} />
          <path d="M320 248V332" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
          <path d="M243 512H397Q414 512 414 530V602Q414 618 397 618H243Q226 618 226 602V530Q226 512 243 512Z" fill="none" stroke={lineColor} strokeWidth={5} />
          <path d="M242 530Q320 570 398 530" fill="none" stroke={lineColor} strokeWidth={4} strokeLinecap="round" />
        </>
      )}

      {side === "back" && productId !== "hoodie" && (
        <path d="M196 252Q320 286 444 252" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
      )}
    </svg>
  );
}
