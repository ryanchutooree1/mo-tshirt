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
import { removeBackgroundAutomatically } from "@/lib/automatic-background-removal";
import { formatMoney } from "@/lib/money";
import { uploadPublicArtwork } from "@/lib/public-artwork-upload";
import {
  getMinSizePrice,
  getShopDesignProductId,
  getSizePrice,
  getSizes,
  type ShopDesignProductId,
  type ShopItem,
} from "@/lib/shops";

type ProductId = ShopDesignProductId;
type Side = "front" | "back";
type MethodId = "dtf" | "screen" | "vinyl";
type StudioStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Layer = "artwork" | "text";
type ArtworkPlacement = { enabled: boolean; x: number; y: number; scale: number; rotate: number };
type ArtworkCopy = ArtworkPlacement & { id: number };
type TextPlacement = { enabled: boolean; value: string; color: string; size: number; rotate: number; x: number; y: number; font: string };
type TextCopy = TextPlacement & { id: number };

type SideDesign = {
  artwork: ArtworkPlacement;
  artworkCopies: ArtworkCopy[];
  text: TextPlacement;
  textCopies: TextCopy[];
};

const PRODUCTS = [
  { id: "tshirt" as const, label: "Plain T-Shirt", base: 150, min: 10, lead: "5–7 working days", image: "/design-studio/tshirt-realistic.png", backImage: "/design-studio/tshirt-realistic-back.png" },
  { id: "polo" as const, label: "Plain Poloshirt", base: 450, min: 10, lead: "6–8 working days", image: "/design-studio/polo-realistic.png", backImage: "/design-studio/polo-realistic-back.png" },
];

const METHODS = [
  { id: "dtf" as const, label: "DTF full colour", add: 60, note: "Best for logos, photos and gradients." },
  { id: "screen" as const, label: "Screen printing", add: 30, note: "Crisp and cost-effective for bulk orders." },
  { id: "vinyl" as const, label: "Vinyl heat press", add: 45, note: "Ideal for names, numbers and simple shapes." },
];

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
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
};
const LAYER_X_LIMIT = 65;
const LAYER_Y_LIMIT = 80;
const ARTWORK_SCALE_MIN = 20;
const ARTWORK_SCALE_MAX = 160;
const ARTWORK_SCALE_STEP = 12;
const TEXT_SIZE_MIN = 12;
const TEXT_SIZE_MAX = 160;
const TEXT_SIZE_STEP = 5;

type PremiumDesignStudioClientProps = {
  backHref?: string;
  backLabel?: string;
  embedded?: boolean;
  initialShopItemId?: string;
  requestSource?: string;
};

function createSizeQuantities(item?: ShopItem | null) {
  const available = item ? getSizes(item) : DEFAULT_SIZES;
  const defaultSize = available.includes("M") ? "M" : available[0];
  return available.reduce<Record<string, number>>((quantities, size) => {
    quantities[size] = size === defaultSize ? 1 : 0;
    return quantities;
  }, {});
}

function getPreferredShopItem(items: ShopItem[], productId: ProductId) {
  const variants = items.filter((item) => getShopDesignProductId(item.title) === productId);
  return variants.find((item) => item.colors.some((color) => color.toLowerCase() === "black")) ?? variants[0] ?? null;
}

function createDesign(): SideDesign {
  return {
    artwork: { enabled: false, x: 0, y: -8, scale: 34, rotate: 0 },
    artworkCopies: [],
    text: { enabled: false, value: "", color: "#ffffff", size: 34, rotate: 0, x: 0, y: 22, font: "Arial, sans-serif" },
    textCopies: [],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function PremiumDesignStudioClient({
  backHref = "/admin",
  backLabel = "Back to admin",
  embedded = false,
  initialShopItemId,
  requestSource = "Premium Admin Design Studio",
}: PremiumDesignStudioClientProps) {
  const [step, setStep] = useState<StudioStep>(1);
  const [productId, setProductId] = useState<ProductId>("tshirt");
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [selectedShopItemId, setSelectedShopItemId] = useState<string | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<MethodId>("dtf");
  const [activeSide, setActiveSide] = useState<Side>("front");
  const [designs, setDesigns] = useState<Record<Side, SideDesign>>({ front: createDesign(), back: createDesign() });
  const [sizes, setSizes] = useState<Record<string, number>>(() => createSizeQuantities());
  const [rush, setRush] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [snap, setSnap] = useState(true);
  const [selectedLayer, setSelectedLayer] = useState<Layer | null>(null);
  const [selectedArtworkCopyId, setSelectedArtworkCopyId] = useState<number | null>(null);
  const [selectedTextCopyId, setSelectedTextCopyId] = useState<number | null>(null);
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
  const textFrameRef = useRef<HTMLDivElement | null>(null);
  const artworkCopySequence = useRef(0);
  const textCopySequence = useRef(0);
  const dragRef = useRef<{ pointerId: number; layer: Layer; copyId: number | null; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const artworkTransformRef = useRef<{ pointerId: number; kind: "rotate" | "scale"; startAngle: number; startDistance: number; originRotate: number; originScale: number; changed: boolean } | null>(null);
  const textTransformRef = useRef<{ pointerId: number; kind: "rotate" | "scale"; startAngle: number; startDistance: number; originRotate: number; originSize: number; changed: boolean } | null>(null);
  const skipArtworkTransformClick = useRef(false);
  const skipTextTransformClick = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadShopProducts() {
      try {
        const response = await fetch("/api/shops", { signal: controller.signal });
        const body = (await response.json()) as { items?: ShopItem[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load shop products.");

        const catalog = (Array.isArray(body.items) ? body.items : []).filter(
          (item) => Boolean(getShopDesignProductId(item.title) && item.photoUrl && item.inStock)
        );
        setShopItems(catalog);

        const requestedItem = initialShopItemId
          ? catalog.find((item) => item.id === initialShopItemId) ?? null
          : null;
        const initialItem = requestedItem ?? getPreferredShopItem(catalog, "tshirt") ?? catalog[0] ?? null;
        if (initialItem) {
          const initialProductId = getShopDesignProductId(initialItem.title);
          if (initialProductId) setProductId(initialProductId);
          setSelectedShopItemId(initialItem.id);
          setSizes(createSizeQuantities(initialItem));
          setShopError(null);
        } else {
          setShopError("No active plain T-shirts or poloshirts are available in Shops yet.");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setShopError(error instanceof Error ? error.message : "Could not load shop products.");
      } finally {
        if (!controller.signal.aborted) setShopLoading(false);
      }
    }

    void loadShopProducts();
    return () => controller.abort();
  }, [initialShopItemId]);

  const catalogByProduct = useMemo<Record<ProductId, ShopItem[]>>(
    () => ({
      tshirt: shopItems.filter((item) => getShopDesignProductId(item.title) === "tshirt"),
      polo: shopItems.filter((item) => getShopDesignProductId(item.title) === "polo"),
    }),
    [shopItems]
  );
  const product = PRODUCTS.find((item) => item.id === productId) ?? PRODUCTS[0];
  const productVariants = catalogByProduct[productId];
  const selectedShopItem = shopItems.find((item) => item.id === selectedShopItemId) ?? null;
  const selectedColor = selectedShopItem?.colors[0] || "Black";
  const availableSizes = selectedShopItem ? getSizes(selectedShopItem) : DEFAULT_SIZES;
  const productPreviewImage = activeSide === "back"
    ? selectedShopItem?.studioBackPhotoUrl || selectedShopItem?.backPhotoUrl || product.backImage
    : selectedShopItem?.studioPhotoUrl || selectedShopItem?.photoUrl || product.image;
  const method = METHODS.find((item) => item.id === methodId) ?? METHODS[0];
  const activeDesign = designs[activeSide];
  const activeArtwork = selectedArtworkCopyId === null ? activeDesign.artwork : activeDesign.artworkCopies.find((copy) => copy.id === selectedArtworkCopyId) ?? activeDesign.artwork;
  const activeText = selectedTextCopyId === null ? activeDesign.text : activeDesign.textCopies.find((copy) => copy.id === selectedTextCopyId) ?? activeDesign.text;
  const activeArtworkLayers: Array<ArtworkPlacement & { copyId: number | null }> = [
    ...(activeDesign.artwork.enabled ? [{ ...activeDesign.artwork, copyId: null }] : []),
    ...activeDesign.artworkCopies.map((copy) => ({ ...copy, copyId: copy.id })),
  ];
  const activeArtworkUrl = artworkUrls[activeSide];
  const activeTextLayers: Array<TextPlacement & { copyId: number | null }> = [
    ...(activeDesign.text.enabled && activeDesign.text.value.trim() ? [{ ...activeDesign.text, copyId: null }] : []),
    ...activeDesign.textCopies.filter((copy) => copy.enabled && copy.value.trim()).map((copy) => ({ ...copy, copyId: copy.id })),
  ];
  const printZone = PRINT_ZONES[productId];
  const totalQty = availableSizes.reduce((sum, size) => sum + (sizes[size] || 0), 0);
  const selectedSizes = availableSizes.filter((size) => sizes[size] > 0).map((size) => `${size} × ${sizes[size]}`).join(", ") || "None";
  const decoratedSides = (["front", "back"] as Side[]).filter((side) => (designs[side].artwork.enabled && artworkUrls[side]) || (designs[side].text.enabled && designs[side].text.value.trim()) || designs[side].textCopies.some((copy) => copy.enabled && copy.value.trim())).length;
  const hasCustomization = decoratedSides > 0;
  const artworkSides = (["front", "back"] as Side[]).filter((side) => artworkFiles[side]).map((side) => `${side[0].toUpperCase()}${side.slice(1)}`).join(" + ") || (hasCustomization ? "Text only" : "None");
  const discount = totalQty >= 100 ? 0.14 : totalQty >= 50 ? 0.1 : totalQty >= 20 ? 0.06 : 0;
  const garmentSubtotal = availableSizes.reduce((sum, size) => {
    const garmentPrice = selectedShopItem ? getSizePrice(selectedShopItem, size) : product.base;
    return sum + garmentPrice * (sizes[size] || 0);
  }, 0);
  const printUnitPrice = hasCustomization ? method.add + Math.max(0, decoratedSides - 1) * 35 : 0;
  const productionSubtotal = Math.round((garmentSubtotal + printUnitPrice * totalQty) * (1 - discount));
  const setupFee = hasCustomization && totalQty > 0 && totalQty < product.min ? 750 : 0;
  const rushFee = hasCustomization && rush ? Math.round(productionSubtotal * 0.12) : 0;
  const totalPrice = productionSubtotal + setupFee + rushFee;
  const printMethodLabel = hasCustomization ? method.label : "No customization";
  const needsDelivery = delivery !== DELIVERY_OPTIONS[0];
  const canSubmit = totalQty > 0 && client.name.trim() !== "" && (client.email.trim() !== "" || client.phone.trim() !== "") && (!needsDelivery || (client.deliveryName.trim() !== "" && client.address.trim() !== ""));
  const today = useMemo(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10), []);

  useEffect(() => () => { if (artworkUrls.front) URL.revokeObjectURL(artworkUrls.front); }, [artworkUrls.front]);
  useEffect(() => () => { if (artworkUrls.back) URL.revokeObjectURL(artworkUrls.back); }, [artworkUrls.back]);

  function patchArtwork(patch: Partial<ArtworkPlacement>, copyId = selectedArtworkCopyId) {
    setDesigns((current) => {
      const currentDesign = current[activeSide];
      if (copyId === null) return { ...current, [activeSide]: { ...currentDesign, artwork: { ...currentDesign.artwork, ...patch } } };
      return { ...current, [activeSide]: { ...currentDesign, artworkCopies: currentDesign.artworkCopies.map((copy) => copy.id === copyId ? { ...copy, ...patch } : copy) } };
    });
  }

  function patchText(patch: Partial<TextPlacement>, side = activeSide, copyId = selectedTextCopyId) {
    setDesigns((current) => {
      const currentDesign = current[side];
      if (copyId === null) return { ...current, [side]: { ...currentDesign, text: { ...currentDesign.text, ...patch } } };
      return { ...current, [side]: { ...currentDesign, textCopies: currentDesign.textCopies.map((copy) => copy.id === copyId ? { ...copy, ...patch } : copy) } };
    });
  }

  function changeSide(side: Side) {
    setActiveSide(side);
    setSelectedLayer(null);
    setSelectedArtworkCopyId(null);
    setSelectedTextCopyId(null);
  }

  function selectProduct(nextProductId: ProductId) {
    const nextItem = getPreferredShopItem(shopItems, nextProductId);
    setProductId(nextProductId);
    if (nextItem) {
      setSelectedShopItemId(nextItem.id);
      setSizes(createSizeQuantities(nextItem));
    } else {
      setSelectedShopItemId(null);
      setSizes(createSizeQuantities());
    }
  }

  function selectShopItem(item: ShopItem) {
    const nextProductId = getShopDesignProductId(item.title);
    if (!nextProductId) return;
    setProductId(nextProductId);
    setSelectedShopItemId(item.id);
    setSizes(createSizeQuantities(item));
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
    setDesigns((current) => ({ ...current, [side]: { ...current[side], artwork: { enabled: true, x: 0, y: -8, scale: 34, rotate: 0 }, artworkCopies: [] } }));
    setResult(null);
    changeSide(side);
  }

  function handleArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) chooseArtwork(file, uploadTarget.current);
  }

  function replaceArtworkFile(file: File, side: Side) {
    const nextUrl = URL.createObjectURL(file);
    setArtworkFiles((current) => ({ ...current, [side]: file }));
    setArtworkUrls((current) => ({ ...current, [side]: nextUrl }));
    setResult(null);
    changeSide(side);
  }

  function clearArtwork(side: Side) {
    setArtworkUrls((current) => ({ ...current, [side]: null }));
    setArtworkFiles((current) => ({ ...current, [side]: null }));
    setDesigns((current) => ({ ...current, [side]: { ...current[side], artwork: { ...current[side].artwork, enabled: false }, artworkCopies: [] } }));
    if (side === activeSide) {
      setSelectedLayer(null);
      setSelectedArtworkCopyId(null);
    }
  }

  function duplicateArtwork() {
    const id = ++artworkCopySequence.current;
    const duplicate: ArtworkCopy = {
      ...activeArtwork,
      id,
      enabled: true,
      x: clamp(activeArtwork.x + 18, -LAYER_X_LIMIT, LAYER_X_LIMIT),
      y: clamp(activeArtwork.y - 12, -LAYER_Y_LIMIT, LAYER_Y_LIMIT),
    };
    setDesigns((current) => ({ ...current, [activeSide]: { ...current[activeSide], artworkCopies: [...current[activeSide].artworkCopies, duplicate] } }));
    setSelectedArtworkCopyId(id);
    setSelectedLayer("artwork");
  }

  function removeSelectedArtwork() {
    if (selectedArtworkCopyId === null) {
      clearArtwork(activeSide);
      return;
    }
    setDesigns((current) => ({ ...current, [activeSide]: { ...current[activeSide], artworkCopies: current[activeSide].artworkCopies.filter((copy) => copy.id !== selectedArtworkCopyId) } }));
    setSelectedArtworkCopyId(null);
    setSelectedLayer(activeDesign.artwork.enabled ? "artwork" : null);
  }

  function duplicateText() {
    const id = ++textCopySequence.current;
    const duplicate: TextCopy = {
      ...activeText,
      id,
      enabled: true,
      x: clamp(activeText.x + 18, -LAYER_X_LIMIT, LAYER_X_LIMIT),
      y: clamp(activeText.y - 12, -LAYER_Y_LIMIT, LAYER_Y_LIMIT),
    };
    setDesigns((current) => ({ ...current, [activeSide]: { ...current[activeSide], textCopies: [...current[activeSide].textCopies, duplicate] } }));
    setSelectedTextCopyId(id);
    setSelectedLayer("text");
  }

  function removeSelectedText() {
    if (selectedTextCopyId === null) {
      patchText({ enabled: false }, activeSide, null);
      setSelectedLayer(null);
      return;
    }
    setDesigns((current) => ({ ...current, [activeSide]: { ...current[activeSide], textCopies: current[activeSide].textCopies.filter((copy) => copy.id !== selectedTextCopyId) } }));
    setSelectedTextCopyId(null);
    setSelectedLayer(activeDesign.text.enabled && Boolean(activeDesign.text.value.trim()) ? "text" : null);
  }

  function placeText(x: number, y: number, copyId: number | null) {
    const nextX = snap && Math.abs(x) < 3 ? 0 : x;
    const nextY = snap && Math.abs(y) < 3 ? 0 : y;
    patchText({ x: clamp(nextX, -LAYER_X_LIMIT, LAYER_X_LIMIT), y: clamp(nextY, -LAYER_Y_LIMIT, LAYER_Y_LIMIT) }, activeSide, copyId);
  }

  function beginDrag(layer: Layer, copyId: number | null = layer === "artwork" ? selectedArtworkCopyId : selectedTextCopyId) {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const target = layer === "artwork"
        ? (copyId === null ? activeDesign.artwork : activeDesign.artworkCopies.find((copy) => copy.id === copyId) ?? activeDesign.artwork)
        : (copyId === null ? activeDesign.text : activeDesign.textCopies.find((copy) => copy.id === copyId) ?? activeDesign.text);
      dragRef.current = { pointerId: event.pointerId, layer, copyId, startX: event.clientX, startY: event.clientY, originX: target.x, originY: target.y };
      if (layer === "artwork") setSelectedArtworkCopyId(copyId);
      else setSelectedTextCopyId(copyId);
      setSelectedLayer(layer);
      canvasRef.current?.setPointerCapture(event.pointerId);
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const bounds = printZoneRef.current?.getBoundingClientRect();
    if (!drag || !bounds || drag.pointerId !== event.pointerId) return;
    const nextX = drag.originX + ((event.clientX - drag.startX) / bounds.width) * 100;
    const nextY = drag.originY + ((event.clientY - drag.startY) / bounds.height) * 100;
    if (drag.layer === "artwork") {
      const snappedX = snap && Math.abs(nextX) < 3 ? 0 : nextX;
      const snappedY = snap && Math.abs(nextY) < 3 ? 0 : nextY;
      patchArtwork({ x: clamp(snappedX, -LAYER_X_LIMIT, LAYER_X_LIMIT), y: clamp(snappedY, -LAYER_Y_LIMIT, LAYER_Y_LIMIT) }, drag.copyId);
    } else placeText(nextX, nextY, drag.copyId);
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
      artworkTransformRef.current = { pointerId: event.pointerId, kind, startAngle: Math.atan2(offsetY, offsetX), startDistance: Math.hypot(offsetX, offsetY), originRotate: activeArtwork.rotate, originScale: activeArtwork.scale, changed: false };
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
      patchArtwork({ scale: clamp(Math.round(transform.originScale * ratio), ARTWORK_SCALE_MIN, ARTWORK_SCALE_MAX) });
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
    if (kind === "rotate") patchArtwork({ rotate: activeArtwork.rotate >= 165 ? -180 : activeArtwork.rotate + 15 });
    else patchArtwork({ scale: Math.min(ARTWORK_SCALE_MAX, activeArtwork.scale + ARTWORK_SCALE_STEP) });
  }

  function beginTextTransform(kind: "rotate" | "scale") {
    return (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = textFrameRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const offsetX = event.clientX - (bounds.left + bounds.width / 2);
      const offsetY = event.clientY - (bounds.top + bounds.height / 2);
      textTransformRef.current = { pointerId: event.pointerId, kind, startAngle: Math.atan2(offsetY, offsetX), startDistance: Math.hypot(offsetX, offsetY), originRotate: activeText.rotate, originSize: activeText.size, changed: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedLayer("text");
    };
  }

  function moveTextTransform(event: ReactPointerEvent<HTMLButtonElement>) {
    const transform = textTransformRef.current;
    const bounds = textFrameRef.current?.getBoundingClientRect();
    if (!transform || !bounds || transform.pointerId !== event.pointerId) return;
    const offsetX = event.clientX - (bounds.left + bounds.width / 2);
    const offsetY = event.clientY - (bounds.top + bounds.height / 2);
    if (transform.kind === "rotate") {
      const delta = ((Math.atan2(offsetY, offsetX) - transform.startAngle) * 180) / Math.PI;
      transform.changed ||= Math.abs(delta) > 1;
      patchText({ rotate: clamp(Math.round(transform.originRotate + delta), -180, 180) });
    } else {
      const distance = Math.hypot(offsetX, offsetY);
      const ratio = transform.startDistance > 0 ? distance / transform.startDistance : 1;
      transform.changed ||= Math.abs(ratio - 1) > 0.02;
      patchText({ size: clamp(Math.round(transform.originSize * ratio), TEXT_SIZE_MIN, TEXT_SIZE_MAX) });
    }
  }

  function endTextTransform(event: ReactPointerEvent<HTMLButtonElement>) {
    const transform = textTransformRef.current;
    if (!transform || transform.pointerId !== event.pointerId) return;
    skipTextTransformClick.current = transform.changed;
    if (transform.changed) setTimeout(() => { skipTextTransformClick.current = false; }, 0);
    textTransformRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function activateTextTransform(kind: "rotate" | "scale") {
    if (skipTextTransformClick.current) {
      skipTextTransformClick.current = false;
      return;
    }
    if (kind === "rotate") patchText({ rotate: activeText.rotate >= 165 ? -180 : activeText.rotate + 15 });
    else patchText({ size: Math.min(TEXT_SIZE_MAX, activeText.size + TEXT_SIZE_STEP) });
  }

  const summary = `Hi MO T-SHIRT, I would like a quote.\nProduct: ${product.label}\nColour: ${selectedColor}\nPrint: ${printMethodLabel}\nArtwork: ${artworkSides}\nSizes: ${selectedSizes}\nQuantity: ${totalQty}\nEstimate: ${formatMoney(totalPrice)}`;
  const whatsappUrl = getWhatsAppUrl(summary);

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) { setResult({ ok: false, text: "Add a client name, contact method and valid delivery details." }); return; }
    setSubmitting(true);
    setResult(null);
    const submittedArtworks = (["front", "back"] as Side[]).flatMap((side) => {
      const file = artworkFiles[side];
      return file ? [{ side, file }] : [];
    });
    try {
      let uploadSessionId = `design-studio-${crypto.randomUUID().slice(0, 12)}`;
      const uploadedArtworks = [];
      for (const { side, file } of submittedArtworks) {
        const upload = await uploadPublicArtwork({
          file,
          filename: `${side}-${file.name}`,
          sessionId: uploadSessionId,
        });
        uploadSessionId = upload.sessionId;
        uploadedArtworks.push({ side, file, attachment: upload.attachment });
      }

      const payload = new FormData();
      payload.append("name", client.name.trim());
      payload.append("email", client.email.trim());
      payload.append("phone", client.phone.trim());
      payload.append("message", "Premium Design Studio request submitted via mo-tshirt.mu");
      payload.append("garment", product.label);
      payload.append("size", availableSizes.find((size) => sizes[size] > 0) || "Mixed");
      payload.append("printMethod", printMethodLabel);
      payload.append("quantity", String(totalQty));
      payload.append("garments", JSON.stringify(availableSizes.filter((size) => sizes[size] > 0).map((size) => ({ garment: product.label, color: selectedColor, size, quantity: sizes[size] }))));
      payload.append("deadline", client.deadline);
      payload.append("notes", client.notes);
      payload.append("source", requestSource);
      payload.append("delivery", delivery);
      payload.append("deliveryName", client.deliveryName);
      payload.append("deliveryAddress", client.address);
      payload.append("deliveryPostCode", client.postCode);
      payload.append("deliveryPhone", client.deliveryPhone);
      payload.append("designBrief", JSON.stringify({ product: product.label, shopItemId: selectedShopItem?.id || "", colour: selectedColor, productImages: { front: selectedShopItem?.studioPhotoUrl || selectedShopItem?.photoUrl || product.image, back: selectedShopItem?.studioBackPhotoUrl || selectedShopItem?.backPhotoUrl || product.backImage }, printMethod: printMethodLabel, activeSide, front: designs.front, back: designs.back, artworkFiles: { front: artworkFiles.front?.name || "", back: artworkFiles.back?.name || "" }, sizes, totalQty, estimatedTotal: totalPrice, rush: hasCustomization && rush }));
      payload.append("attachments", JSON.stringify(uploadedArtworks.map(({ side, file, attachment }) => ({ label: `${side[0].toUpperCase()}${side.slice(1)} artwork`, description: `${product.label} ${side} print artwork`, url: attachment.url, filename: attachment.name, contentType: attachment.contentType || file.type, size: attachment.size ?? file.size }))));
      const response = await fetch("/api/contact", { method: "POST", body: payload });
      const body = (await response.json()) as { message?: string; error?: string };
      setResult(response.ok ? { ok: true, text: body.message || "Your design has been submitted successfully." } : { ok: false, text: body.error || "Could not send the request." });
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Network error. Please try again or use WhatsApp." });
    } finally {
      setSubmitting(false);
    }
  }

  const activeStep = STEPS[step - 1];
  const goTo = (value: number) => setStep(clamp(value, 1, STEPS.length) as StudioStep);
  const HeadingTag = embedded ? "h2" : "h1";

  return (
    <div
      className={`premium-studio bg-[#f5f5f2] text-left text-[#1b1b18] [font-family:var(--font-studio-body)] ${
        embedded
          ? "overflow-hidden rounded-[32px] border border-[#e5e4df] shadow-sm"
          : "min-h-screen"
      }`}
    >
      {!embedded ? <header className="border-b border-[#e5e4df] bg-[#fff]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold hover:bg-[#f4f3ef]"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">{backLabel}</span></Link>
          <div className="text-center"><p className="text-[15px] font-extrabold tracking-[-0.025em]">MO T-Shirt<span className="text-[#ff5a0a]">.mu</span></p><p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#8c8b85]">Premium Design Studio</p></div>
          <div className="flex h-11 items-center gap-2 rounded-xl border border-[#e5e4df] bg-[#fafaf8] px-3 text-xs font-semibold text-[#696862]"><BadgeCheck className="h-4 w-4 text-[#16a462]" /><span className="hidden sm:inline">Live preview</span></div>
        </div>
      </header> : null}

      <section className="border-b border-[#e5e4df] bg-[#fff] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#fff0e8] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d94500]"><Sparkles className="h-3.5 w-3.5" />Live customiser</div><HeadingTag className="text-3xl font-bold tracking-[-0.045em] text-[#161613] [font-family:var(--font-studio-display)] sm:text-5xl">Design it. <span className="text-[#ff5a0a]">We print it.</span></HeadingTag><p className="mt-3 max-w-2xl text-sm leading-6 text-[#6e6d67] sm:text-base">Build a production-ready garment mockup, then send every detail to the MO T-Shirt team in one request.</p></div>
            <div className="w-full max-w-md"><div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-[#77766f]"><span>Step {step} of {STEPS.length}</span><span>{Math.round((step / STEPS.length) * 100)}% complete</span></div><div className="h-2 overflow-hidden rounded-full bg-[#ecebe6]"><motion.div className="h-full rounded-full bg-[#ff5a0a]" animate={{ width: `${(step / STEPS.length) * 100}%` }} /></div></div>
          </div>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1 xl:hidden">{STEPS.map((item) => <button key={item.id} type="button" onClick={() => setStep(item.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${step === item.id ? "studio-primary border-[#ff5a0a] bg-[#ff5a0a] !text-white" : step > item.id ? "border-[#ffd5c1] bg-[#fff5ef] text-[#c54306]" : "border-[#e4e3dd] bg-[#fff] text-[#73726c]"}`}><span>{step > item.id ? <Check className="h-3.5 w-3.5" /> : item.id}</span>{item.short}</button>)}</div>
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-7">
        <div className="grid items-start gap-5 xl:grid-cols-[230px_minmax(0,1fr)]">
          <nav className="hidden rounded-[24px] border border-[#e1e0da] bg-[#fff] p-3 shadow-[0_14px_45px_rgba(29,27,20,0.05)] xl:block" aria-label="Design steps">
            {STEPS.map((item) => <button key={item.id} type="button" onClick={() => setStep(item.id)} aria-current={step === item.id ? "step" : undefined} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${step === item.id ? "studio-dark bg-[#171714] !text-white" : "text-[#686761] hover:bg-[#f5f4f0]"}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${step === item.id ? "studio-primary bg-[#ff5a0a] !text-white" : step > item.id ? "bg-[#fff0e8] text-[#df4d08]" : "bg-[#f1f0ec] text-[#8d8c85]"}`}>{step > item.id ? <Check className="h-4 w-4" /> : item.id}</span><span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[0.13em] opacity-55">Step {item.id}</span><span className="mt-0.5 block text-[13px] font-bold leading-tight">{item.label}</span></span><ChevronRight className="ml-auto h-4 w-4 opacity-25" /></button>)}
            <div className="mt-3 rounded-2xl bg-[#f6f5f1] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a8982]">Need help?</p><a href={`tel:${CONTACT_TEL}`} className="mt-2 flex items-center gap-2 text-xs font-bold"><MessageCircle className="h-4 w-4 text-[#ff5a0a]" />{CONTACT_PHONE_DISPLAY}</a></div>
          </nav>

          <form onSubmit={submitQuote} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,.8fr)]">
            <section className="overflow-hidden rounded-[26px] border border-[#dfded8] bg-[#fff] shadow-[0_18px_55px_rgba(32,30,24,0.07)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecebe6] px-4 py-3.5 sm:px-5"><div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#99978f]">Live preview</p><h2 className="mt-0.5 text-lg font-bold tracking-[-0.025em]">{product.label} · {activeSide}</h2></div><div className="flex items-center gap-1.5">{(["front", "back"] as Side[]).map((side) => <button key={side} type="button" onClick={() => changeSide(side)} className={`rounded-xl px-4 py-2 text-xs font-bold capitalize ${activeSide === side ? "studio-primary bg-[#ff5a0a] !text-white" : "bg-[#f4f3ef] text-[#686761]"}`}>{side}</button>)}<button type="button" onClick={() => { setDesigns({ front: createDesign(), back: createDesign() }); setSelectedLayer(null); setSelectedArtworkCopyId(null); setSelectedTextCopyId(null); }} className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl border border-[#e1e0da] text-[#66655f]" aria-label="Reset design"><RotateCcw className="h-4 w-4" /></button></div></div>
              <div className="bg-[radial-gradient(circle_at_50%_0%,#ffffff_0%,#f5f3ed_55%,#eeece5_100%)] p-3 sm:p-6">
                <div ref={canvasRef} onPointerDown={() => setSelectedLayer(null)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="relative mx-auto aspect-[4/5] w-full max-w-[550px] overflow-hidden rounded-[24px] border border-[#fff] bg-[#fff]/30" style={{ touchAction: "none" }}>
                  <div className="pointer-events-none absolute inset-0 z-10"><div className="relative h-full w-full origin-center transition duration-200" style={{ transform: `scale(${previewZoom / 100})` }}><Image src={productPreviewImage} alt={`Realistic ${product.label} ${activeSide} preview`} fill priority sizes="(min-width: 1024px) 550px, 92vw" className="object-contain drop-shadow-[0_26px_28px_rgba(15,23,42,.22)]" /></div></div>
                  <div ref={printZoneRef} className="absolute z-30" style={{ left: `${printZone.left}%`, top: `${printZone.top}%`, width: `${printZone.width}%`, height: `${printZone.height}%` }}>
                    {activeTextLayers.map((textLayer) => {
                      const isSelected = selectedLayer === "text" && selectedTextCopyId === textLayer.copyId;
                      return <div key={textLayer.copyId ?? "primary-text"} ref={isSelected ? textFrameRef : undefined} onPointerDown={beginDrag("text", textLayer.copyId)} className="absolute cursor-grab select-none active:cursor-grabbing" style={{ left: `${50 + textLayer.x}%`, top: `${50 + textLayer.y}%`, transform: `translate(-50%,-50%) rotate(${textLayer.rotate}deg)` }}><div className={`relative rounded px-1 ${isSelected ? "outline outline-2 outline-white outline-offset-1" : ""}`} style={{ color: textLayer.color, fontFamily: textLayer.font, fontSize: `${textLayer.size}px`, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap", textShadow: "0 2px 8px rgba(0,0,0,.24)" }}>{textLayer.value}</div>{isSelected ? <><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={removeSelectedText} className="absolute -left-5 -top-5 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#f2d2cd] bg-white text-[#e53b2f] shadow-[0_6px_18px_rgba(22,26,35,.22)]" style={{ transform: `rotate(${-textLayer.rotate}deg)` }} aria-label={textLayer.copyId === null ? `Remove ${activeSide} text` : "Remove duplicated text"} title="Remove text"><X className="h-5 w-5" /></button><button type="button" onPointerDown={beginTextTransform("rotate")} onPointerMove={moveTextTransform} onPointerUp={endTextTransform} onPointerCancel={endTextTransform} onClick={() => activateTextTransform("rotate")} className="absolute -right-5 -top-5 z-20 flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)] active:cursor-grabbing" style={{ transform: `rotate(${-textLayer.rotate}deg)` }} aria-label="Rotate text" title="Drag to rotate"><RotateCw className="h-5 w-5" /></button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={duplicateText} className="absolute -bottom-5 -left-5 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)]" style={{ transform: `rotate(${-textLayer.rotate}deg)` }} aria-label="Duplicate text above and to the right" title="Duplicate text"><Copy className="h-4.5 w-4.5" /></button><button type="button" onPointerDown={beginTextTransform("scale")} onPointerMove={moveTextTransform} onPointerUp={endTextTransform} onPointerCancel={endTextTransform} onClick={() => activateTextTransform("scale")} className="absolute -bottom-5 -right-5 z-20 flex h-9 w-9 touch-none cursor-nwse-resize items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)]" style={{ transform: `rotate(${-textLayer.rotate}deg)` }} aria-label="Resize text" title="Drag to resize"><Maximize2 className="h-5 w-5" /></button></> : null}</div>;
                    })}
                    {activeArtworkUrl ? activeArtworkLayers.map((artwork) => {
                      const isSelected = selectedLayer === "artwork" && selectedArtworkCopyId === artwork.copyId;
                      return <div key={artwork.copyId ?? "primary"} ref={isSelected ? artworkFrameRef : undefined} onPointerDown={beginDrag("artwork", artwork.copyId)} className="absolute cursor-grab select-none active:cursor-grabbing" style={{ left: `${50 + artwork.x}%`, top: `${50 + artwork.y}%`, width: `${artwork.scale}%`, aspectRatio: "1/1", transform: `translate(-50%,-50%) rotate(${artwork.rotate}deg)` }}><div className={`relative h-full w-full ${isSelected ? "outline outline-2 outline-[#2947d3] outline-offset-1" : ""}`}><img src={activeArtworkUrl} alt={`${activeSide} artwork on garment`} className="pointer-events-none h-full w-full object-contain" /></div>{isSelected ? <><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={removeSelectedArtwork} className="absolute -left-5 -top-5 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#f2d2cd] bg-white text-[#e53b2f] shadow-[0_6px_18px_rgba(22,26,35,.22)]" style={{ transform: `rotate(${-artwork.rotate}deg)` }} aria-label={artwork.copyId === null ? `Remove ${activeSide} artwork` : "Remove duplicated artwork"} title="Remove artwork"><X className="h-5 w-5" /></button><button type="button" onPointerDown={beginArtworkTransform("rotate")} onPointerMove={moveArtworkTransform} onPointerUp={endArtworkTransform} onPointerCancel={endArtworkTransform} onClick={() => activateArtworkTransform("rotate")} className="absolute -right-5 -top-5 z-20 flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)] active:cursor-grabbing" style={{ transform: `rotate(${-artwork.rotate}deg)` }} aria-label="Rotate artwork" title="Drag to rotate"><RotateCw className="h-5 w-5" /></button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={duplicateArtwork} className="absolute -bottom-5 -left-5 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)]" style={{ transform: `rotate(${-artwork.rotate}deg)` }} aria-label="Duplicate artwork above and to the right" title="Duplicate artwork"><Copy className="h-4.5 w-4.5" /></button><button type="button" onPointerDown={beginArtworkTransform("scale")} onPointerMove={moveArtworkTransform} onPointerUp={endArtworkTransform} onPointerCancel={endArtworkTransform} onClick={() => activateArtworkTransform("scale")} className="absolute -bottom-5 -right-5 z-20 flex h-9 w-9 touch-none cursor-nwse-resize items-center justify-center rounded-full border border-[#dce1fb] bg-white text-[#2947d3] shadow-[0_6px_18px_rgba(22,26,35,.22)]" style={{ transform: `rotate(${-artwork.rotate}deg)` }} aria-label="Resize artwork" title="Drag to resize"><Maximize2 className="h-5 w-5" /></button></> : null}</div>;
                    }) : null}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t border-[#ecebe6] bg-[#fbfbf9] sm:grid-cols-4"><PreviewStat label="Garment" value={product.label} /><PreviewStat label="Colour" value={selectedColor} /><PreviewStat label="Quantity" value={String(totalQty)} /><PreviewStat label="Estimate" value={formatMoney(totalPrice)} accent /></div>
            </section>

            <aside className="flex min-h-[600px] flex-col rounded-[26px] border border-[#dfded8] bg-[#fff] shadow-[0_18px_55px_rgba(32,30,24,0.07)]">
              <div className="border-b border-[#ecebe6] px-5 py-5"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff0e8] text-sm font-extrabold text-[#e44c04]">{step}</span><div><h2 className="text-xl font-bold tracking-[-0.03em]">{activeStep.label}</h2><p className="mt-1 text-xs leading-5 text-[#77766f]">{stepCopy(step)}</p></div></div></div>
              <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex-1 p-5">
                {step === 1 ? <div className="space-y-3"><div className="flex items-center gap-2 rounded-xl bg-[#f2f8f4] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#168455]"><BadgeCheck className="h-4 w-4" />Live products from Shops</div>{shopLoading ? <div className="flex min-h-48 items-center justify-center gap-2 text-xs font-semibold text-[#77766f]"><Loader2 className="h-4 w-4 animate-spin text-[#ff5a0a]" />Loading real garments…</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{PRODUCTS.map((option) => {
                  const variants = catalogByProduct[option.id];
                  const preferredItem = productId === option.id && selectedShopItem ? selectedShopItem : getPreferredShopItem(shopItems, option.id);
                  const minimumPrice = variants.length ? Math.min(...variants.map((item) => getMinSizePrice(item))) : option.base;
                  return <button key={option.id} type="button" onClick={() => selectProduct(option.id)} disabled={shopLoading} className={`relative flex items-center gap-4 rounded-2xl border p-3 text-left transition disabled:cursor-wait disabled:opacity-45 ${productId === option.id ? "border-[#ff5a0a] bg-[#fff8f3] ring-2 ring-[#ff5a0a]/10" : "border-[#e2e1dc] hover:border-[#bbb9b1]"}`}><span className="relative flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white"><Image src={preferredItem?.photoUrl || option.image} alt={`${option.label} from Shops`} fill sizes="80px" className="object-contain" /></span><span className="min-w-0"><span className="block text-sm font-extrabold">{option.label}</span><span className="mt-1 block text-xs text-[#7a7972]">From {formatMoney(minimumPrice)}</span><span className="mt-2 block text-[9px] font-bold uppercase tracking-[0.1em] text-[#a09e96]">{variants.length ? `${variants.length} shop colour${variants.length === 1 ? "" : "s"}` : "Standard fallback"}</span></span>{productId === option.id ? <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-[#ff5a0a]" /> : null}</button>;
                })}</div>}{shopError ? <p className="rounded-xl border border-[#f0d5d5] bg-[#fffafa] p-3 text-xs leading-5 text-[#a43e3e]">{shopError} The studio fallback products remain available.</p> : null}</div> : null}

                {step === 2 ? <div className="space-y-6"><div><div className="flex items-center justify-between"><Label>Choose the real shop colour</Label><span className="rounded-full bg-[#f2f8f4] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#168455]">{productVariants.length} available</span></div>{productVariants.length ? <div className="mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">{productVariants.map((item) => {
                  const itemColor = item.colors.join(", ") || "Default";
                  const isSelected = selectedShopItemId === item.id;
                  return <button key={item.id} type="button" onClick={() => selectShopItem(item)} className={`relative overflow-hidden rounded-2xl border p-2 text-left transition ${isSelected ? "border-[#ff5a0a] bg-[#fff8f3] ring-2 ring-[#ff5a0a]/10" : "border-[#e4e3de] bg-white hover:border-[#bbb9b1]"}`}><span className="relative block aspect-square overflow-hidden rounded-xl bg-white"><Image src={item.photoUrl || product.image} alt={`${itemColor} ${item.title}`} fill sizes="160px" className="object-contain" /></span><span className="mt-2 block truncate text-[10px] font-extrabold">{itemColor}</span><span className="mt-0.5 block text-[9px] text-[#85847d]">From {formatMoney(getMinSizePrice(item))}</span>{item.backPhotoUrl ? <span className="mt-1 inline-flex rounded-full bg-[#edf4ff] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[#345da7]">Real back photo</span> : null}{isSelected ? <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 rounded-full bg-white text-[#ff5a0a]" /> : null}</button>;
                })}</div> : <p className="mt-3 rounded-xl bg-[#f5f4f0] p-3 text-xs leading-5 text-[#77766f]">No live {product.label.toLowerCase()} colours are currently available. The standard preview is being used.</p>}</div><div><div className="flex justify-between"><Label>Available size quantities</Label><span className="studio-dark rounded-full bg-[#171714] px-2.5 py-1 text-[9px] font-bold !text-white">{totalQty} total</span></div><div className="mt-3 grid grid-cols-4 gap-2">{availableSizes.map((size) => <label key={size} className={`rounded-xl border p-2 text-center ${sizes[size] ? "border-[#ff5a0a] bg-[#fff8f3]" : "border-[#e4e3de]"}`}><span className="block text-[10px] font-extrabold">{size}</span><input inputMode="numeric" value={sizes[size] || ""} onChange={(event) => { const value = event.target.value; if (/^\d*$/.test(value)) setSizes((current) => ({ ...current, [size]: Number(value) || 0 })); }} className="studio-field mt-1 h-8 w-full rounded-lg bg-[#fff] text-center text-xs font-bold outline-none" placeholder="0" aria-label={`${size} quantity`} /></label>)}</div></div><label className="flex items-center justify-between rounded-2xl border border-[#e4e3de] p-4"><span><span className="block text-sm font-bold">Rush production</span><span className="mt-1 block text-xs text-[#85847d]">Adds 12% to your estimate</span></span><input type="checkbox" checked={rush} onChange={(event) => setRush(event.target.checked)} className="h-5 w-5 accent-[#ff5a0a]" /></label></div> : null}

                {step === 3 ? <div className="space-y-6"><div><Label>Print side</Label><div className="mt-3 grid grid-cols-2 gap-3">{(["front", "back"] as Side[]).map((side) => <button key={side} type="button" onClick={() => changeSide(side)} className={`rounded-2xl border p-4 text-left ${activeSide === side ? "border-[#ff5a0a] bg-[#fff8f3]" : "border-[#e4e3de]"}`}><div className="flex justify-between"><Layers3 className="h-5 w-5 text-[#ff5a0a]" />{activeSide === side ? <CheckCircle2 className="h-5 w-5 text-[#ff5a0a]" /> : null}</div><p className="mt-5 text-sm font-extrabold capitalize">{side}</p><p className="mt-1 text-xs text-[#85847d]">Design the {side} side.</p></button>)}</div></div><div><Label>Print method</Label><div className="mt-3 space-y-2.5">{METHODS.map((option) => <label key={option.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-3.5 ${methodId === option.id ? "border-[#ff5a0a] bg-[#fff8f3]" : "border-[#e4e3de]"}`}><input type="radio" name="method" checked={methodId === option.id} onChange={() => setMethodId(option.id)} className="mt-1 accent-[#ff5a0a]" /><span><span className="block text-sm font-bold">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[#85847d]">{option.note}</span></span></label>)}</div></div></div> : null}

                {step === 4 ? <div className="space-y-4"><div className="rounded-2xl border border-[#ffd8c4] bg-[linear-gradient(135deg,#fff8f3_0%,#fff_100%)] p-4"><div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff5a0a] text-white"><Layers3 className="h-5 w-5" /></span><div><p className="text-sm font-extrabold">One file for each print side</p><p className="mt-1 text-xs leading-5 text-[#7d6b62]">Upload separate artwork for the front and back. You can add either side or both.</p></div></div></div><input ref={artworkInput} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onClick={(event) => { event.currentTarget.value = ""; }} onChange={handleArtwork} className="hidden" />{(["front", "back"] as Side[]).map((side) => <ArtworkUploadSlot key={side} side={side} file={artworkFiles[side]} url={artworkUrls[side]} active={activeSide === side} onChoose={() => openArtworkPicker(side)} onDrop={(file) => chooseArtwork(file, side)} onRemove={() => clearArtwork(side)} onBackgroundRemoved={(file) => replaceArtworkFile(file, side)} onPosition={() => { changeSide(side); setStep(5); }} />)}<div className="flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8d8b84]"><BadgeCheck className="h-4 w-4 text-[#16a462]" />PNG, JPG, WEBP or SVG · 5MB per file</div>{result && !result.ok ? <p className="rounded-xl bg-[#fff1f1] p-3 text-xs text-[#b91c1c]">{result.text}</p> : null}</div> : null}

                {step === 5 ? <div className="space-y-4"><div><Label>Artwork side</Label><div className="mt-2 grid grid-cols-2 gap-2">{(["front", "back"] as Side[]).map((side) => <button key={side} type="button" onClick={() => changeSide(side)} className={`rounded-2xl border p-3 text-left transition ${activeSide === side ? "border-[#ff5a0a] bg-[#fff8f3] ring-2 ring-[#ff5a0a]/10" : "border-[#e2e1dc] bg-white"}`}><span className="flex items-center justify-between"><span className="text-xs font-extrabold capitalize">{side}</span>{artworkUrls[side] ? <CheckCircle2 className="h-4 w-4 text-[#16a462]" /> : <span className="h-2 w-2 rounded-full bg-[#d5d3cc]" />}</span><span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.08em] text-[#96948c]">{artworkUrls[side] ? "Artwork ready" : "No artwork"}</span></button>)}</div></div>{activeArtworkUrl ? <><div className="flex items-center gap-3 rounded-2xl border border-[#c9ead8] bg-[#f4fbf7] p-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 shadow-sm"><img src={activeArtworkUrl} alt={`${activeSide} artwork preview`} className="h-full w-full object-contain" /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-[#168455]">Editing {selectedArtworkCopyId === null ? activeSide : `duplicated ${activeSide}`}</span><span className="mt-1 block truncate text-xs font-bold">{artworkFiles[activeSide]?.name}</span></span></div><div className="grid grid-cols-3 gap-2"><PresetButton icon={<Crosshair />} label="Left chest" onClick={() => patchArtwork({ x: -28, y: -38 })} /><PresetButton icon={<Focus />} label="Centre" onClick={() => patchArtwork({ x: 0, y: 0 })} /><PresetButton icon={<Move />} label="Lower" onClick={() => patchArtwork({ x: 0, y: 52 })} /></div><RangeControl icon={<ZoomIn />} label="Artwork size" value={activeArtwork.scale} min={ARTWORK_SCALE_MIN} max={ARTWORK_SCALE_MAX} suffix="%" onChange={(value) => patchArtwork({ scale: value })} /><RangeControl icon={<Move />} label="Horizontal" value={activeArtwork.x} min={-LAYER_X_LIMIT} max={LAYER_X_LIMIT} onChange={(value) => patchArtwork({ x: value })} /><RangeControl icon={<Move className="rotate-90" />} label="Vertical" value={activeArtwork.y} min={-LAYER_Y_LIMIT} max={LAYER_Y_LIMIT} onChange={(value) => patchArtwork({ y: value })} /><RangeControl icon={<RotateCcw />} label="Rotation" value={activeArtwork.rotate} min={-180} max={180} suffix="°" onChange={(value) => patchArtwork({ rotate: value })} /><button type="button" onClick={() => setSnap((current) => !current)} className={`flex w-full items-center justify-between rounded-2xl border p-4 ${snap ? "border-[#bfe9d4] bg-[#f1fbf6]" : "border-[#e2e1dc]"}`}><span className="flex items-center gap-2 text-sm font-bold"><Magnet className="h-4 w-4 text-[#16a462]" />Snap to centre</span><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${snap ? "studio-success bg-[#16a462] !text-white" : "bg-[#efeee9]"}`}>{snap ? "ON" : "OFF"}</span></button></> : <div className="flex min-h-64 flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-[#ddd9d1] bg-[#fafaf7] p-6 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#ff5a0a] shadow-[0_8px_25px_rgba(35,32,24,.08)]"><ImagePlus className="h-6 w-6" /></span><p className="mt-4 text-sm font-extrabold">No {activeSide} artwork yet</p><p className="mt-1 max-w-[250px] text-xs leading-5 text-[#85847d]">Upload an image for this side before positioning it, or continue to add text only.</p><button type="button" onClick={() => setStep(4)} className="studio-primary mt-4 inline-flex items-center gap-2 rounded-xl bg-[#ff5a0a] px-4 py-2.5 text-xs font-bold !text-white"><UploadCloud className="h-4 w-4" />Go to uploads</button></div>}</div> : null}

                {step === 6 ? <div className="space-y-5"><label className="flex items-center justify-between rounded-2xl border border-[#e2e1dc] p-4"><span className="flex items-center gap-2 text-sm font-bold"><TypeIcon className="h-4 w-4 text-[#ff5a0a]" />Custom text</span><input type="checkbox" checked={activeText.enabled} onChange={(event) => patchText({ enabled: event.target.checked })} className="h-5 w-5 accent-[#ff5a0a]" /></label><Field label="Your text"><input value={activeText.value} onChange={(event) => patchText({ value: event.target.value, enabled: true })} className="studio-field" placeholder="e.g. Team Mauritius" /></Field><div className="grid grid-cols-[1fr_72px] gap-3"><Field label="Font"><select value={activeText.font} onChange={(event) => patchText({ font: event.target.value })} className="studio-field"><option value="Arial, sans-serif">Modern sans</option><option value="Impact, sans-serif">Impact</option><option value="Georgia, serif">Classic serif</option><option value="cursive">Signature</option></select></Field><Field label="Colour"><input type="color" value={activeText.color} onChange={(event) => patchText({ color: event.target.value })} className="studio-field p-1.5" /></Field></div><RangeControl icon={<TypeIcon />} label="Text size" value={activeText.size} min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} onChange={(value) => patchText({ size: value })} /><RangeControl icon={<RotateCcw />} label="Rotation" value={activeText.rotate} min={-180} max={180} suffix="°" onChange={(value) => patchText({ rotate: value })} /><div className="grid grid-cols-3 gap-2"><PresetButton icon={<Crosshair />} label="Left chest" onClick={() => patchText({ x: -20, y: -18 })} /><PresetButton icon={<Focus />} label="Centre" onClick={() => patchText({ x: 0, y: 0 })} /><PresetButton icon={<Move />} label="Lower" onClick={() => patchText({ x: 0, y: 24 })} /></div></div> : null}

                {step === 7 ? <div className="space-y-4"><div className="rounded-2xl border border-[#e2e1dc] p-4"><Label>Order summary</Label><dl className="mt-3 space-y-3"><SummaryRow label="Product" value={product.label} /><SummaryRow label="Shop colour" value={selectedColor} /><SummaryRow label="Artwork files" value={artworkSides} /><SummaryRow label="Print method" value={printMethodLabel} /><SummaryRow label="Sizes" value={selectedSizes} /><SummaryRow label="Lead time" value={product.lead} /></dl></div><div className="studio-dark rounded-2xl bg-[#171714] p-5 !text-white"><div className="flex justify-between text-xs text-[#aaa9a2]"><span>Total quantity</span><span>{totalQty}</span></div><div className="mt-3 flex items-end justify-between"><span className="text-xs text-[#aaa9a2]">Estimated total</span><span className="text-2xl font-extrabold">{formatMoney(totalPrice)}</span></div><p className="mt-3 border-t border-white/10 pt-3 text-[9px] leading-4 text-[#888780]">Garment pricing and available sizes come directly from Shops. Final printing price is confirmed after artwork review.</p></div><Field label="Order notes"><textarea value={client.notes} onChange={(event) => setClient((current) => ({ ...current, notes: event.target.value }))} className="studio-field min-h-24 resize-none py-3" placeholder="Special instructions, placement details..." /></Field></div> : null}

                {step === 8 ? result?.ok ? <Success message={result.text} onReset={() => { setResult(null); setStep(1); }} /> : <div className="space-y-4"><Field label="Client name *"><input required value={client.name} onChange={(event) => setClient((current) => ({ ...current, name: event.target.value }))} className="studio-field" placeholder="Full name" /></Field><div className="grid gap-3 2xl:grid-cols-2"><Field label="Email"><input type="email" value={client.email} onChange={(event) => setClient((current) => ({ ...current, email: event.target.value }))} className="studio-field" placeholder="you@example.com" /></Field><Field label="Phone / WhatsApp"><input type="tel" value={client.phone} onChange={(event) => setClient((current) => ({ ...current, phone: event.target.value }))} className="studio-field" placeholder="+230 5..." /></Field></div><Field label="Preferred deadline"><input type="date" min={today} value={client.deadline} onChange={(event) => setClient((current) => ({ ...current, deadline: event.target.value }))} className="studio-field" /></Field><Field label="Delivery"><select value={delivery} onChange={(event) => setDelivery(event.target.value)} className="studio-field">{DELIVERY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>{needsDelivery ? <div className="space-y-3 rounded-2xl bg-[#f5f4f0] p-4"><Field label="Delivery name *"><input value={client.deliveryName} onChange={(event) => setClient((current) => ({ ...current, deliveryName: event.target.value }))} className="studio-field" /></Field><Field label="Address *"><input value={client.address} onChange={(event) => setClient((current) => ({ ...current, address: event.target.value }))} className="studio-field" /></Field><div className="grid grid-cols-2 gap-2"><input value={client.postCode} onChange={(event) => setClient((current) => ({ ...current, postCode: event.target.value }))} className="studio-field" placeholder="Post code" /><input value={client.deliveryPhone} onChange={(event) => setClient((current) => ({ ...current, deliveryPhone: event.target.value }))} className="studio-field" placeholder="Phone" /></div></div> : null}<div className="rounded-2xl border border-[#ffd2bd] bg-[#fff7f1] p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#8b5d47]">{hasCustomization ? "Estimated total" : "Garment total"}</span><span className="text-xl font-extrabold text-[#dd4904]">{formatMoney(totalPrice)}</span></div>{!hasCustomization ? <p className="mt-2 text-[10px] text-[#9a725f]">Printing and setup charges begin only after artwork or custom text is added.</p> : null}</div>{result && !result.ok ? <p className="rounded-xl bg-[#fff1f1] p-3 text-xs text-[#b91c1c]">{result.text}</p> : null}<a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#bce8d1] bg-[#f0fbf5] px-4 py-3 text-sm font-bold text-[#087b45]"><MessageCircle className="h-4 w-4" />Send details on WhatsApp</a></div> : null}
              </motion.div>
              {!result?.ok ? <div className="sticky bottom-0 mt-auto border-t border-[#ecebe6] bg-[#fff]/95 p-4 backdrop-blur"><div className="flex gap-2.5">{step > 1 ? <button type="button" onClick={() => goTo(step - 1)} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#deddd7] px-4 text-sm font-bold"><ChevronLeft className="h-4 w-4" />Back</button> : null}{step < STEPS.length ? <button type="button" onClick={() => goTo(step + 1)} className="studio-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff5a0a] px-4 text-sm font-bold !text-white shadow-[0_10px_24px_rgba(255,90,10,.22)]">Next step<ArrowRight className="h-4 w-4" /></button> : <button type="submit" disabled={!canSubmit || submitting} className="studio-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff5a0a] px-4 text-sm font-bold !text-white shadow-[0_10px_24px_rgba(255,90,10,.22)] disabled:cursor-not-allowed disabled:opacity-45">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? "Sending..." : "Request final price"}</button>}</div></div> : null}
            </aside>
          </form>
        </div>
      </div>

      {!embedded ? <footer className="border-t border-[#e3e2dc] bg-[#fff] px-4 py-7 sm:px-6"><div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-5 sm:grid-cols-4"><Benefit icon={<Shirt />} title="Premium garments" /><Benefit icon={<Palette />} title="High-quality printing" /><Benefit icon={<PackageCheck />} title="Reliable service" /><Benefit icon={<CircleDollarSign />} title="Local pricing" /></div><div className="mx-auto mt-6 flex max-w-[1200px] flex-wrap justify-center gap-x-5 gap-y-2 border-t border-[#efeee9] pt-5 text-[10px] text-[#77766f]"><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><span>•</span><a href={`tel:${CONTACT_TEL}`}>{CONTACT_PHONE_DISPLAY}</a></div></footer> : null}
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

type ArtworkUploadSlotProps = {
  side: Side;
  file: File | null;
  url: string | null;
  active: boolean;
  onChoose: () => void;
  onDrop: (file: File) => void;
  onRemove: () => void;
  onBackgroundRemoved: (file: File) => void;
  onPosition: () => void;
};

type BackgroundRemovalState = "idle" | "processing" | "done" | "error";
type BackgroundRemovalMode = "smart" | "ai";

function ArtworkUploadSlot({
  side,
  file,
  url,
  active,
  onChoose,
  onDrop,
  onRemove,
  onBackgroundRemoved,
  onPosition,
}: ArtworkUploadSlotProps) {
  const title = `${side[0].toUpperCase()}${side.slice(1)}`;
  const [removalState, setRemovalState] = useState<BackgroundRemovalState>("idle");
  const [removalProgress, setRemovalProgress] = useState(0);
  const [removalMessage, setRemovalMessage] = useState("");
  const [processingMode, setProcessingMode] = useState<BackgroundRemovalMode | null>(null);
  const [appliedMode, setAppliedMode] = useState<BackgroundRemovalMode | null>(null);
  const sourceFile = useRef<File | null>(file);
  const latestGeneratedFile = useRef<File | null>(null);
  const generatedFiles = useRef<Partial<Record<BackgroundRemovalMode, File>>>({});

  useEffect(() => {
    if (file === latestGeneratedFile.current) return;
    sourceFile.current = file;
    latestGeneratedFile.current = null;
    generatedFiles.current = {};
    setRemovalState("idle");
    setRemovalProgress(0);
    setRemovalMessage("");
    setProcessingMode(null);
    setAppliedMode(null);
  }, [file]);

  async function removeArtworkBackground(mode: BackgroundRemovalMode) {
    const originalFile = sourceFile.current ?? file;
    if (!originalFile || removalState === "processing") return;

    const cachedFile = generatedFiles.current[mode];
    if (cachedFile) {
      latestGeneratedFile.current = cachedFile;
      onBackgroundRemoved(cachedFile);
      setAppliedMode(mode);
      setProcessingMode(mode);
      setRemovalState("done");
      setRemovalProgress(1);
      setRemovalMessage(
        mode === "ai"
          ? "Free AI result applied — switch back to compare"
          : "Smart result applied — try Free AI to compare"
      );
      return;
    }

    setRemovalState("processing");
    setProcessingMode(mode);
    setRemovalProgress(0.04);
    setRemovalMessage(mode === "ai" ? "Preparing free AI cutout" : "Preparing smart cutout");

    try {
      const result = await removeBackgroundAutomatically(
        originalFile,
        ({ progress, label }) => {
          setRemovalProgress(progress);
          setRemovalMessage(label);
        },
        mode === "ai" ? { forceAi: true } : {}
      );
      const baseName = originalFile.name.replace(/\.[^.]+$/, "") || `${side}-artwork`;
      const suffix = mode === "ai" ? "free-ai-cutout" : "smart-cutout";
      const transparentFile = new File([result.blob], `${baseName}-${suffix}.png`, {
        type: "image/png",
        lastModified: Date.now(),
      });

      generatedFiles.current[mode] = transparentFile;
      latestGeneratedFile.current = transparentFile;
      onBackgroundRemoved(transparentFile);
      setAppliedMode(mode);
      setRemovalProgress(1);
      setRemovalState("done");
      setRemovalMessage(
        result.method === "already-transparent"
          ? "Your logo was already transparent"
          : mode === "ai"
            ? "Free AI result applied — tap Smart to compare"
            : "Smart result applied — try Free AI to compare"
      );
    } catch (error) {
      setRemovalState("error");
      setRemovalProgress(0);
      setRemovalMessage(
        error instanceof Error ? error.message : "Could not remove the background. Please try again."
      );
    }
  }

  const isRemovingBackground = removalState === "processing";

  function getRemovalButtonLabel(mode: BackgroundRemovalMode) {
    if (isRemovingBackground && processingMode === mode) return removalMessage;
    if (appliedMode === mode) return mode === "ai" ? "Free AI result applied" : "Smart result applied";
    if (removalState === "error" && processingMode === mode) {
      return mode === "ai" ? "Retry free AI" : "Retry smart magic";
    }
    return mode === "ai" ? "Free AI cutout" : "Remove background";
  }

  return (
    <section className={`overflow-hidden rounded-[22px] border transition ${file ? "border-[#cbded3] bg-[#fbfefc]" : active ? "border-[#ffb48f] bg-[#fffaf7]" : "border-[#dfded8] bg-white"}`} aria-label={`${title} artwork upload`}>
      <div className="flex items-center justify-between border-b border-[#ecebe6] px-4 py-3">
        <div className="flex items-center gap-2.5"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${side === "front" ? "bg-[#fff0e8] text-[#e94f08]" : "bg-[#efefff] text-[#5551c8]"}`}><Shirt className="h-4 w-4" /></span><div><h3 className="text-sm font-extrabold">{title} artwork</h3><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#97958e]">Printed on the {side}</p></div></div>
        {file ? <span className="flex items-center gap-1 rounded-full bg-[#eaf8f0] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#13814f]"><CheckCircle2 className="h-3.5 w-3.5" />Ready</span> : <span className="rounded-full bg-[#f2f1ed] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#8b8982]">Optional</span>}
      </div>
      {file && url ? (
        <div className="p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#e6e5df] bg-[conic-gradient(#edf0f4_25%,#fff_0_50%,#edf0f4_0_75%,#fff_0)] bg-[size:14px_14px] p-2">
              <img src={url} alt={`${title} artwork preview`} className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">{file.name}</p>
              <p className="mt-1 text-[10px] text-[#86847d]">
                {(file.size / 1024 / 1024).toFixed(2)} MB · Uploaded separately
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onChoose}
                  disabled={isRemovingBackground}
                  className="rounded-lg border border-[#dcdbd5] bg-white px-3 py-2 text-[10px] font-bold hover:border-[#ff9c6c] disabled:cursor-wait disabled:opacity-50"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={isRemovingBackground}
                  className="flex items-center gap-1 rounded-lg border border-[#f0d5d5] bg-[#fffafa] px-3 py-2 text-[10px] font-bold text-[#b94343] disabled:cursor-wait disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => removeArtworkBackground("smart")}
              disabled={isRemovingBackground}
              aria-label={`Smart background removal for ${title.toLowerCase()} artwork`}
              aria-pressed={appliedMode === "smart"}
              className="group relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[linear-gradient(110deg,#7c3aed_0%,#db2777_35%,#f97316_68%,#06b6d4_100%)] px-4 py-3 text-xs font-extrabold text-white shadow-[0_10px_26px_rgba(168,85,247,.3)] transition duration-300 hover:-translate-y-0.5 hover:saturate-150 hover:shadow-[0_14px_32px_rgba(219,39,119,.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-[-40%] left-[-30%] w-1/4 rotate-12 bg-white/35 blur-md transition-transform duration-700 group-hover:translate-x-[600%]"
              />
              {isRemovingBackground && processingMode === "smart" ? (
                <Loader2 className="relative h-4 w-4 animate-spin" />
              ) : appliedMode === "smart" ? (
                <CheckCircle2 className="relative h-4 w-4" />
              ) : (
                <Sparkles className="relative h-4 w-4" />
              )}
              <span className="relative">{getRemovalButtonLabel("smart")}</span>
              {!isRemovingBackground && appliedMode !== "smart" ? (
                <span className="relative rounded-full border border-white/35 bg-white/20 px-2 py-0.5 text-[8px] uppercase tracking-[0.16em]">
                  Smart
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => removeArtworkBackground("ai")}
              disabled={isRemovingBackground}
              aria-label={`Use free AI background remover on ${title.toLowerCase()} artwork`}
              aria-pressed={appliedMode === "ai"}
              className="group relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[linear-gradient(110deg,#06b6d4_0%,#2563eb_34%,#7c3aed_68%,#ec4899_100%)] px-4 py-3 text-xs font-extrabold text-white shadow-[0_10px_26px_rgba(37,99,235,.28)] transition duration-300 hover:-translate-y-0.5 hover:saturate-150 hover:shadow-[0_14px_32px_rgba(124,58,237,.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-[-40%] left-[-30%] w-1/4 rotate-12 bg-white/35 blur-md transition-transform duration-700 group-hover:translate-x-[600%]"
              />
              {isRemovingBackground && processingMode === "ai" ? (
                <Loader2 className="relative h-4 w-4 animate-spin" />
              ) : appliedMode === "ai" ? (
                <CheckCircle2 className="relative h-4 w-4" />
              ) : (
                <Sparkles className="relative h-4 w-4" />
              )}
              <span className="relative">{getRemovalButtonLabel("ai")}</span>
              {!isRemovingBackground && appliedMode !== "ai" ? (
                <span className="relative rounded-full border border-white/35 bg-white/20 px-2 py-0.5 text-[8px] uppercase tracking-[0.16em]">
                  AI test
                </span>
              ) : null}
            </button>

            <p className="px-1 text-center text-[9px] leading-4 text-[#77766f]">
              Both options use your original upload. Switch between saved results to compare.
            </p>
          </div>

          {removalState !== "idle" ? (
            <div
              className={`mt-2 rounded-xl px-3 py-2 ${
                removalState === "error"
                  ? "bg-[#fff1f2] text-[#be123c]"
                  : removalState === "done"
                    ? "bg-[#ecfdf5] text-[#047857]"
                    : "bg-[#f5f3ff] text-[#6d28d9]"
              }`}
              aria-live="polite"
            >
              <div className="flex items-center justify-between gap-3 text-[9px] font-bold">
                <span>{removalMessage}</span>
                {isRemovingBackground ? <span>{Math.round(removalProgress * 100)}%</span> : null}
              </div>
              {isRemovingBackground ? (
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70"
                  role="progressbar"
                  aria-label={
                    processingMode === "ai"
                      ? "Free AI background removal progress"
                      : "Smart background removal progress"
                  }
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(removalProgress * 100)}
                >
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6,#ec4899,#f97316)] transition-[width] duration-300"
                    style={{ width: `${Math.round(removalProgress * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onPosition}
            disabled={isRemovingBackground}
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-[#181815] px-4 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-50"
          >
            <span>Position {title.toLowerCase()} artwork</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onChoose}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const droppedFile = event.dataTransfer.files?.[0];
            if (droppedFile) onDrop(droppedFile);
          }}
          className="group flex min-h-36 w-full flex-col items-center justify-center p-5 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a0a] focus-visible:ring-inset"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f5f4f0] text-[#ff5a0a] transition group-hover:bg-[#fff0e8]">
            <UploadCloud className="h-5 w-5" />
          </span>
          <span className="mt-3 text-xs font-extrabold">Choose {title.toLowerCase()} artwork</span>
          <span className="mt-1 text-[10px] text-[#8a8982]">Browse or drag and drop here</span>
        </button>
      )}
    </section>
  );
}
