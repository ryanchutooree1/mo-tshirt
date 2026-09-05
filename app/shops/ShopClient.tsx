"use client";

import styles from "./shop.module.css";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowRight, FiDownload, FiEdit3, FiLayers } from "react-icons/fi";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { READY_MADE_UNIFORMS_PATH } from "@/data/ready-made-uniforms";
import { getWhatsAppUrl } from "@/data/work";
import { trackProductInterest, trackWhatsAppClick } from "@/lib/analytics";
import { formatMoney as formatDisplayMoney, formatWholeMoney as formatDisplayWholeMoney } from "@/lib/money";
import type { ReadyMadeUniformItem } from "@/lib/ready-made-uniforms-store";
import {
  buildShopWhatsAppMessageForLines,
  formatSizeLabel,
  getSizePrice,
  getShopDesignProductId,
  getShopImageViews,
  getSizePrices,
  getSizes,
  isOneSizeLabel,
  sortShopItems,
  sortSizes,
  type DeliveryInfo,
  type ShopItem,
  type ShopOrderLine,
  type ShopOrderLineWithPrice,
  type ShopSelection,
} from "@/lib/shops";

const DELIVERY_METHODS = [
  { value: "Surinam pickup", label: "Surinam Pickup (Free)", fee: 0 },
  { value: "Post Office Postage Delivery", label: `Post Office Postage Delivery (${formatDisplayWholeMoney(100)})`, fee: 100 },
  { value: "Post Office Express Delivery", label: `Post Office Express Delivery (${formatDisplayWholeMoney(150)})`, fee: 150 },
  { value: "Delivery (Need to arrange first)", label: "Delivery (Need to arrange first)", fee: 0 },
] as const;

const money = (value: number) => formatDisplayMoney(value);
const IMAGE_RETRY_LIMIT = 2;
const IMAGE_RETRY_DELAY_MS = 900;

const COLOR_SWATCH_RULES = [
  { match: ["white"], value: "#f8fafc" },
  { match: ["black"], value: "#171717" },
  { match: ["navy"], value: "#243b6b" },
  { match: ["royal blue"], value: "#1d4ed8" },
  { match: ["aqua"], value: "#4cc9f0" },
  { match: ["sky blue"], value: "#38bdf8" },
  { match: ["blue"], value: "#2563eb" },
  { match: ["purple"], value: "#7c3aed" },
  { match: ["light pink"], value: "#f9a8d4" },
  { match: ["vibrant pink"], value: "#ec4899" },
  { match: ["pink"], value: "#db2777" },
  { match: ["deep red"], value: "#991b1b" },
  { match: ["red"], value: "#c0392b" },
  { match: ["military green"], value: "#556b2f" },
  { match: ["bottle green"], value: "#14532d" },
  { match: ["vibrant apple green"], value: "#a3e635" },
  { match: ["vibrant green"], value: "#22c55e" },
  { match: ["tea green"], value: "#d9f99d" },
  { match: ["pastel green"], value: "#d9f99d" },
  { match: ["green"], value: "#2f855a" },
  { match: ["deep grey", "deep gray"], value: "#4b5563" },
  { match: ["charcoal"], value: "#374151" },
  { match: ["grey", "gray"], value: "#9ca3af" },
  { match: ["soft pastel yellow"], value: "#fde68a" },
  { match: ["lemon yellow"], value: "#facc15" },
  { match: ["serein yellow"], value: "#f4d35e" },
  { match: ["moutard yellow", "mustard yellow"], value: "#d4a017" },
  { match: ["yellow"], value: "#eab308" },
  { match: ["orange"], value: "#ea580c" },
  { match: ["gold"], value: "#c68a12" },
  { match: ["beige"], value: "#d6c3a1" },
  { match: ["cream"], value: "#f1e7d0" },
  { match: ["brown"], value: "#7c4a2d" },
] as const;

const PRODUCT_SWATCH_OVERRIDES = [
  { titleMatch: ["baseball cap"], colorMatch: ["off white", "off-white"], value: "#f4ead7" },
  { titleMatch: ["baseball cap"], colorMatch: ["beige"], value: "#d9c39b" },
  { titleMatch: ["baseball cap"], colorMatch: ["military green"], value: "#667638" },
  { titleMatch: ["baseball cap"], colorMatch: ["green fluo"], value: "#9ef01a" },
  { titleMatch: ["baseball cap"], colorMatch: ["yellow"], value: "#ffd428" },
  { titleMatch: ["trucker cap"], colorMatch: ["pink"], value: "#f5a9cd" },
] as const;

function normalizeSwatchKey(value: string) {
  return value.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function getColorSwatch(color: string, itemTitle?: string) {
  const normalized = normalizeSwatchKey(color);
  const normalizedTitle = normalizeSwatchKey(itemTitle || "");

  const override = PRODUCT_SWATCH_OVERRIDES.find((rule) => {
    const matchesTitle = rule.titleMatch.some((token) => normalizedTitle.includes(token));
    if (!matchesTitle) return false;
    return rule.colorMatch.some((token) => normalized.includes(token));
  });

  if (override) {
    return override.value;
  }

  const found = COLOR_SWATCH_RULES.find((rule) =>
    rule.match.some((token) => normalized.includes(token))
  );
  return found?.value || "#d4d4d8";
}

function formatDownloadName(color: string, title: string) {
  const joined = [color, title]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("_");

  return joined
    .replace(/[^\w\s-]+/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type ItemSelection = {
  color: string;
  size: string;
  quantity: number | "";
};

type ShopProductImageProps = {
  src: string;
  alt: string;
};

type ProductThumbnailRailProps = {
  item: ShopItem;
};

function ShopProductImage({ src, alt }: ShopProductImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [retryNonce, setRetryNonce] = useState(0);
  const retryAttemptsRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    retryAttemptsRef.current = 0;
    setRetryNonce(0);
    setStatus("loading");
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, [src]);

  function clearRetryTimer() {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function handleLoadError() {
    const nextAttempt = retryAttemptsRef.current + 1;
    if (nextAttempt > IMAGE_RETRY_LIMIT) {
      setStatus("error");
      return;
    }

    retryAttemptsRef.current = nextAttempt;
    setStatus("loading");
    clearRetryTimer();
    retryTimerRef.current = window.setTimeout(() => {
      setRetryNonce((current) => current + 1);
    }, IMAGE_RETRY_DELAY_MS * nextAttempt);
  }

  return (
    <>
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
          <span
            className="inline-flex h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-[#ff3b22]"
            aria-hidden="true"
          />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">
          Image unavailable
        </div>
      )}
      <Image
        key={`${src}-${retryNonce}`}
        src={src}
        alt={alt}
        fill
        className={`object-cover transition-opacity duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        onLoad={() => {
          clearRetryTimer();
          setStatus("loaded");
        }}
        onError={handleLoadError}
      />
    </>
  );
}

function getProductThumbnailUrls(item: ShopItem) {
  return getShopImageViews(item);
}

function ProductThumbnailRail({
  item,
  activeUrl,
  onSelect,
}: ProductThumbnailRailProps & {
  activeUrl: string | null;
  onSelect: (url: string) => void;
}) {
  const thumbnails = getProductThumbnailUrls(item);
  if (!thumbnails.length) return null;

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5" aria-label={`${item.title} thumbnails`}>
      {thumbnails.map((view) => (
        <button
          key={`${item.id}-thumb-${view.key}`}
          type="button"
          onClick={() => view.url && onSelect(view.url)}
          className={`relative h-10 w-10 overflow-hidden rounded-lg border bg-neutral-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 ${
            activeUrl === view.url ? "border-black ring-2 ring-black/10" : "border-neutral-200"
          }`}
          aria-label={`Show ${view.label.toLowerCase()} view`}
          title={`${view.label} view`}
        >
          {view.url ? (
            <Image
              src={view.url}
              alt={`${item.title} ${view.label.toLowerCase()} view`}
              fill
              className="object-cover"
              sizes="40px"
            />
          ) : (
            <span className="absolute inset-0 bg-[linear-gradient(135deg,#f5f5f5,#e5e5e5)]" />
          )}
        </button>
      ))}
    </div>
  );
}

export default function ShopClient({ uniforms }: { uniforms: ReadyMadeUniformItem[] }) {
  const [catalogView, setCatalogView] = useState<"plain" | "uniforms">("plain");
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedColor, setSelectedColor] = useState("all");
  const [selectedSize, setSelectedSize] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState("all");

  const [selections, setSelections] = useState<Record<string, ItemSelection>>({});
  const [orderLines, setOrderLines] = useState<ShopOrderLine[]>([]);
  const [deliveryMethod, setDeliveryMethod] = useState<ShopSelection["deliveryMethod"]>("Surinam pickup");
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({
    name: "",
    address: "",
    postCode: "",
    phone: "",
  });
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/shops");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load shops.");
        }
        if (active) {
          setItems(Array.isArray(data?.items) ? data.items : []);
          setError(null);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load shops.";
        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelections((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const sizes = getSizes(item);
        if (!next[item.id]) {
          next[item.id] = {
            color: item.colors[0] || "Default",
            size: sizes[0] || "",
            quantity: 1,
          };
        }
      });
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (!isOrderOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOrderOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOrderOpen]);

  const availableProducts = useMemo(() => {
    const set = new Set<string>();
    sortShopItems(items).forEach((item) => {
      if (item.title) set.add(item.title);
    });
    return Array.from(set);
  }, [items]);

  const availableColors = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => item.colors.forEach((color) => set.add(color)));
    return Array.from(set).sort();
  }, [items]);

  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) =>
      getSizes(item).forEach((size) => {
        if (!isOneSizeLabel(size)) {
          set.add(size);
        }
      })
    );
    return sortSizes(Array.from(set));
  }, [items]);

  useEffect(() => {
    if (selectedSize !== "all" && !availableSizes.includes(selectedSize)) {
      setSelectedSize("all");
    }
  }, [availableSizes, selectedSize]);

  const filtered = useMemo(() => {
    let next = sortShopItems(items);
    if (selectedProduct !== "all") {
      next = next.filter((item) => item.title === selectedProduct);
    }
    if (selectedColor !== "all") {
      next = next.filter((item) => item.colors.includes(selectedColor));
    }
    if (selectedSize !== "all") {
      next = next.filter((item) => getSizes(item).includes(selectedSize));
    }
    return next;
  }, [items, selectedProduct, selectedColor, selectedSize]);

  const totalQty = useMemo(
    () => orderLines.reduce((sum, line) => sum + line.quantity, 0),
    [orderLines]
  );

  const itemsById = useMemo(() => {
    const map = new Map<string, ShopItem>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const subtotal = useMemo(() => {
    return orderLines.reduce((sum, line) => {
      const item = itemsById.get(line.itemId);
      if (!item) return sum;
      const price = getSizePrice(item, line.size);
      return sum + price * line.quantity;
    }, 0);
  }, [orderLines, itemsById]);

  const orderLinesWithPrice = useMemo<ShopOrderLineWithPrice[]>(() => {
    return orderLines.map((line) => {
      const item = itemsById.get(line.itemId);
      if (!item) {
        return { ...line, unitPrice: null, lineTotal: null };
      }
      const unitPrice = getSizePrice(item, line.size);
      return {
        ...line,
        unitPrice,
        lineTotal: unitPrice * line.quantity,
      };
    });
  }, [orderLines, itemsById]);

  const selectedDelivery = DELIVERY_METHODS.find((method) => method.value === deliveryMethod);
  const deliveryFeeTotal =
    orderLines.length > 0 ? Number(selectedDelivery?.fee || 0) : 0;
  const totalPrice = subtotal + deliveryFeeTotal;
  const orderItemsSummary = orderLines.length
    ? `${orderLines.length} item${orderLines.length === 1 ? "" : "s"} · ${totalQty} qty`
    : "0 items";

  const groupedOrderLines = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        title: string;
        color: string;
        lines: { size: string; quantity: number; index: number }[];
      }
    >();
    orderLines.forEach((line, index) => {
      const key = `${line.itemId}:${line.color}`;
      const group = groups.get(key) || {
        key,
        title: line.title,
        color: line.color,
        lines: [],
      };
      group.lines.push({ size: line.size, quantity: line.quantity, index });
      groups.set(key, group);
    });
    return Array.from(groups.values()).map((group) => {
      const order = sortSizes(group.lines.map((entry) => entry.size));
      const bySize = new Map(group.lines.map((entry) => [entry.size, entry]));
      return {
        ...group,
        lines: order.map((size) => bySize.get(size) || { size, quantity: 0, index: -1 }),
      };
    });
  }, [orderLines]);

  const deliveryInfoRequired = deliveryMethod !== "Surinam pickup";
  const deliveryInfoValid =
    !deliveryInfoRequired ||
    Boolean(
      deliveryInfo.name.trim() &&
        deliveryInfo.address.trim() &&
        deliveryInfo.phone.trim()
    );
  const canOrder = orderLines.length > 0 && deliveryInfoValid;

  const orderMessage = useMemo(
    () =>
      buildShopWhatsAppMessageForLines(
        orderLinesWithPrice,
        deliveryMethod,
        {
          subtotal,
          deliveryFee: deliveryFeeTotal,
          total: totalPrice,
        },
        deliveryInfoRequired ? deliveryInfo : null
      ),
    [
      orderLinesWithPrice,
      deliveryMethod,
      subtotal,
      deliveryFeeTotal,
      totalPrice,
      deliveryInfo,
      deliveryInfoRequired,
    ]
  );

  function updateSelection(id: string, patch: Partial<ItemSelection>) {
    setSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  function addLineItem(item: ShopItem) {
    const current = selections[item.id];
    if (!current) return;
    const rawQty = current.quantity === "" ? 1 : Number(current.quantity);
    const quantity = Number.isFinite(rawQty) ? Math.max(1, rawQty) : 1;
    const line: ShopOrderLine = {
      itemId: item.id,
      title: item.title,
      color: current.color,
      size: current.size,
      quantity,
    };
    setOrderLines((prev) => {
      const next = prev.slice();
      const existingIndex = next.findIndex(
        (entry) =>
          entry.itemId === line.itemId &&
          entry.color === line.color &&
          entry.size === line.size
      );
      if (existingIndex >= 0) {
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + line.quantity,
        };
      } else {
        next.push(line);
      }
      return next;
    });
    setIsOrderOpen(true);
  }

  function removeLineItem(index: number) {
    setOrderLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLineQty(index: number, quantity: number) {
    setOrderLines((prev) => {
      const next = prev.slice();
      if (!next[index]) return prev;
      next[index] = { ...next[index], quantity: Math.max(1, quantity) };
      return next;
    });
  }

  function clearLineItems() {
    setOrderLines([]);
  }

  return (
    <div className={styles.shop}>
      <div className="relative overflow-x-clip">
        <header className={styles.header}>
          <Link href="/" className={styles.wordmark} aria-label="MO T-SHIRT home"><strong>MO</strong> T-SHIRT<span>.</span></Link>
          <nav aria-label="Shop navigation">
            <Link href="/">Home</Link><Link href="/shop" aria-current="page">Shop</Link>
            <Link href="/design-studio">Design studio</Link><Link href="/#track-parcel">Track parcel ↗</Link>
          </nav>
          <button type="button" onClick={() => setIsOrderOpen(true)}>Your order <span>{totalQty}</span></button>
        </header>
        <section className={styles.hero}>
          <div><p className={styles.eyebrow}>THE MO SHOP · MAURITIUS</p><h1>Choose it.<br/><span>Make it yours.</span></h1></div>
          <div className={styles.heroAside}><p>Plain apparel. Everyday essentials.<br/>Ready for your next idea.</p><Link href="/design-studio">Create your design <FiArrowRight aria-hidden="true" /></Link><span>ONE PIECE OR A FULL RUN</span></div>
        </section>
        <main className={styles.main}>
          <div className={styles.catalogTabs} aria-label="Product collections">
            <button type="button" aria-pressed={catalogView === "plain"} onClick={() => setCatalogView("plain")}>Plain products <span>{items.length}</span></button>
            <button type="button" aria-pressed={catalogView === "uniforms"} onClick={() => setCatalogView("uniforms")}>Uniform designs <span>{uniforms.length}</span></button>
          </div>
          <div id="plain-apparel" hidden={catalogView !== "plain"} className="space-y-8">
            <section className={styles.filters}>
              <div>
                <p className="text-sm font-medium text-neutral-800">Filters</p>
                <button type="button" className={styles.reset} onClick={() => {setSelectedProduct("all");setSelectedColor("all");setSelectedSize("all");}}>Clear filters ↗</button>
              </div>
              <div
                className={`grid w-full gap-3 sm:w-auto ${
                  availableSizes.length ? "sm:grid-cols-3" : "sm:grid-cols-2"
                }`}
              >
                <label className="text-xs font-medium text-neutral-600">
                  Product
                  <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All products</option>
                    {availableProducts.map((product) => (
                      <option key={product} value={product}>{product}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-neutral-600">
                  Color
                  <select
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All colors</option>
                    {availableColors.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                </label>
                {availableSizes.length > 0 && (
                  <label className="text-xs font-medium text-neutral-600">
                    Size
                    <select
                      value={selectedSize}
                      onChange={(e) => setSelectedSize(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="all">All sizes</option>
                      {availableSizes.map((size) => (
                        <option key={size} value={size}>{formatSizeLabel(size)}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </section>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
        </div>

        <div className={styles.catalog}>
          {loading && catalogView === "plain" && <p role="status" className="py-8 text-sm text-neutral-500">Loading live products…</p>}
          <div className="min-w-0" hidden={catalogView !== "plain"}>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#d52c16]">Plain Shop</p>
                <h2 className={styles.catalogTitle}>Find your fit.</h2>
              </div>
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 shadow-sm">
                {filtered.length} products
              </span>
            </div>

            <section className={styles.productGrid} aria-label="Plain apparel products">
              {filtered.map((item) => {
            const sizes = getSizes(item);
            const sizePrices = getSizePrices(item);
            const isOneSizeItem =
              sizePrices.length === 1 && isOneSizeLabel(sizePrices[0]?.size || "");
            const hasMultipleColors = item.colors.length > 1;
            const priceValues = sizePrices
              .map((entry) => entry.price)
              .filter((price) => Number.isFinite(price)) as number[];
            const minPrice = priceValues.length ? Math.min(...priceValues) : 0;
            const selection =
              selections[item.id] || {
                color: item.colors[0] || "Default",
                size: sizes[0] || "",
                quantity: 1,
              };
            const displayColor = selection.color || item.colors[0] || "Color";
            const imageViews = getShopImageViews(item);
            const displayPhotoUrl = selectedImageUrls[item.id] || imageViews[0]?.url || item.photoUrl;
            return (
              <article key={item.id} onClickCapture={() => trackProductInterest(item.id, item.title)} onChangeCapture={() => trackProductInterest(item.id, item.title)} className={styles.productCard}>
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100">
                  {displayPhotoUrl ? (
                    <ShopProductImage src={displayPhotoUrl} alt={item.title} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                      No photo
                    </div>
                  )}
                  {displayPhotoUrl && (
                    <a
                      href={`/api/shops/download?url=${encodeURIComponent(displayPhotoUrl)}&name=${encodeURIComponent(
                        formatDownloadName(displayColor, item.title)
                      )}`}
                      className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-sm ring-1 ring-neutral-200 backdrop-blur transition hover:scale-105 hover:bg-white"
                      aria-label={`Download ${item.title} photo`}
                      title="Download image"
                    >
                      <FiDownload className="h-4 w-4" />
                    </a>
                  )}
                  {!item.inStock && (
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-black px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                      Out of stock
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-black">
                      <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold text-neutral-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                        <span
                          className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.16),0_1px_2px_rgba(0,0,0,0.08)]"
                          style={{ backgroundColor: getColorSwatch(displayColor, item.title) }}
                          aria-hidden="true"
                        />
                        {displayColor}
                      </span>
                      <span>{item.title}</span>
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 font-semibold text-neutral-700">
                        {isOneSizeItem
                          ? formatDisplayWholeMoney(minPrice)
                          : `From ${formatDisplayWholeMoney(minPrice)}`}
                      </span>
                      <ProductThumbnailRail
                        item={item}
                        activeUrl={displayPhotoUrl || null}
                        onSelect={(url) =>
                          setSelectedImageUrls((current) => ({ ...current, [item.id]: url }))
                        }
                      />
                    </div>
                  </div>

                  {!isOneSizeItem && (
                    <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
                      {sizePrices.length ? (
                      sizePrices.map((entry) => (
                        <button
                          key={entry.size}
                          aria-pressed={selection.size === entry.size}
                          title={`${formatSizeLabel(entry.size)} · ${formatDisplayWholeMoney(entry.price)}`}
                          type="button"
                          onClick={() => updateSelection(item.id, { size: entry.size })}
                          className={`rounded-full border px-3 py-1 transition ${
                            selection.size === entry.size
                              ? "border-black bg-black text-white"
                              : "border-neutral-200 hover:border-neutral-400"
                          }`}
                        >
                          {formatSizeLabel(entry.size)}
                        </button>
                      ))
                      ) : (
                        <span className="text-neutral-400">Sizes not set</span>
                      )}
                    </div>
                  )}

                  <div className="grid gap-3 text-xs text-neutral-600 sm:grid-cols-2">
                    {hasMultipleColors && (
                      <label className="flex flex-col gap-2">
                        Color
                        <select
                          value={selection.color}
                          onChange={(e) => updateSelection(item.id, { color: e.target.value })}
                          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                        >
                          {item.colors.map((color) => (
                            <option key={color} value={color}>{color}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="flex flex-col gap-2 sm:col-span-2">
                      Qty
                      <input
                        type="number"
                        min={1}
                        value={selection.quantity}
                        onChange={(e) =>
                          updateSelection(item.id, {
                            quantity:
                              e.target.value === ""
                                ? ""
                                : Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {getShopDesignProductId(item.title) && item.inStock ? (
                      <Link
                        href={`/design-studio?shopItem=${encodeURIComponent(item.id)}`}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ff3b22] px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-600"
                      >
                        <FiEdit3 className="h-3.5 w-3.5" />
                        Design this product
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => addLineItem(item)}
                      disabled={!item.inStock}
                      className="inline-flex items-center justify-center rounded-full border border-black px-4 py-2 text-xs font-semibold text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add to order
                    </button>
                  </div>
                </div>
              </article>
            );
              })}
            </section>

            {!loading && !filtered.length && !error && (
              <div className="mt-12 rounded-[24px] border border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-600">
                No items match those filters yet.
              </div>
            )}
          </div>

          <aside className="min-w-0" hidden={catalogView !== "uniforms"} aria-label="Uniform products">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#e65500]">Uniform Shop</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-neutral-950">Uniform products</h2>
              </div>
              <Link
                href={READY_MADE_UNIFORMS_PATH}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-[#d94f00] transition hover:border-orange-300 hover:bg-orange-100"
              >
                View all
                <FiArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <section className={styles.productGrid} aria-label="Ready-made uniform products">
              {uniforms.map((uniform) => {
                const gallery = [uniform.imageSrc, ...(uniform.imageGallery || [])].filter(Boolean);

                return (
                  <article
                    key={uniform.id}
                    className="group overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-[0_18px_50px_-38px_rgba(194,65,12,0.55)] transition duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_24px_60px_-36px_rgba(194,65,12,0.7)]"
                  >
                    <Link
                      href={READY_MADE_UNIFORMS_PATH}
                      className="relative block aspect-square overflow-hidden bg-[radial-gradient(circle_at_top,#fff7ed_0%,#ffffff_65%)]"
                      aria-label={`View ${uniform.code} ${uniform.title}`}
                    >
                      <div className="absolute inset-x-0 top-0 z-10 h-1.5 bg-[linear-gradient(90deg,#ff5d00,#ff9f32)]" />
                      <Image
                        src={uniform.imageSrc}
                        alt={`${uniform.title} ${uniform.code}`}
                        fill
                        sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1279px) calc(50vw - 36px), 360px"
                        loading="lazy"
                        className="object-contain p-5 transition duration-500 group-hover:scale-[1.03]"
                      />
                      <span className="absolute left-4 top-4 z-10 rounded-full bg-black px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] text-white shadow-sm">
                        {uniform.code}
                      </span>
                      {gallery.length > 1 && (
                        <span className="absolute bottom-4 right-4 z-10 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-[10px] font-bold text-neutral-700 shadow-sm backdrop-blur">
                          {gallery.length} photos
                        </span>
                      )}
                    </Link>

                    <div className="p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e65500]">Ready-made uniform</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-neutral-950">{uniform.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-neutral-500">{uniform.audience}</p>

                      <ul className="mt-4 grid gap-2 text-xs font-medium text-neutral-700">
                        {uniform.features.slice(0, 3).map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff3b22]" aria-hidden="true" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-5 grid gap-2">
                        <TrackedWhatsAppLink
                          href={getWhatsAppUrl(uniform.message)}
                          trackingLocation={`shop_uniform_${uniform.code.toLowerCase()}`}
                          trackingSource="shop"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-full bg-[#ff3b22] px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
                        >
                          Order {uniform.code}
                        </TrackedWhatsAppLink>
                        <Link
                          href={READY_MADE_UNIFORMS_PATH}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-400 hover:text-black"
                        >
                          View design details
                          <FiArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            {!uniforms.length && (
              <div className="mt-4 rounded-[28px] border border-dashed border-orange-200 bg-orange-50/60 px-6 py-12 text-center">
                <FiLayers className="mx-auto h-6 w-6 text-orange-500" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-neutral-800">Uniform products are being updated.</p>
              </div>
            )}
          </aside>
        </div>
      </main>
      <footer className={styles.footer}><Link href="/" className={styles.wordmark}><strong>MO</strong> T-SHIRT.</Link><p>Made in Mauritius. Made for you.</p><div><Link href="/#order">Get a print quote ↗</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div></footer>

      <button
        type="button"
        onClick={() => setIsOrderOpen(true)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-black px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-black/30 transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
          isOrderOpen ? "pointer-events-none opacity-0" : ""
        }`}
        aria-label="Open order list"
      >
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white/20 px-2 text-[11px]">
          {totalQty}
        </span>
        <span>{orderLines.length ? "View order" : "Start order"}</span>
        <span className="text-orange-300">{money(totalPrice)}</span>
      </button>

      <div
        className={`fixed inset-0 z-50 ${isOrderOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!isOrderOpen}
        inert={!isOrderOpen}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${isOrderOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setIsOrderOpen(false)}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Order list"
          className={`absolute bottom-0 left-0 right-0 mx-auto w-full max-w-lg max-h-[85svh] overflow-y-auto overflow-x-hidden rounded-t-[32px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out sm:bottom-auto sm:top-20 sm:right-6 sm:left-auto sm:mx-0 sm:max-w-[380px] sm:rounded-[32px] sm:shadow-xl sm:max-h-[80svh] ${
            isOrderOpen ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-[120%]"
          }`}
        >
          <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-neutral-200 sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-orange-500">Order</p>
              <h3 className="text-base font-semibold">Order list</h3>
              <span className="text-xs text-neutral-500">{orderItemsSummary}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOrderOpen(false)}
              className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-600 transition hover:bg-neutral-100"
            >
              Close
            </button>
          </div>

          <div className="mt-4 space-y-3 text-xs text-neutral-700">
            {orderLines.length ? (
              groupedOrderLines.map((group) => (
                <div key={group.key} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="text-sm font-semibold text-black">
                    {group.color} {group.title}
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.lines.map((line) => (
                      <div key={`${group.key}-${line.size}`} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-neutral-600">
                          {isOneSizeLabel(line.size) ? "One size" : `Size ${formatSizeLabel(line.size)}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              line.index >= 0 &&
                              updateLineQty(line.index, Number(e.target.value || 1))
                            }
                            className="w-12 rounded-xl border border-neutral-200 bg-white px-2 py-1 text-center text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => line.index >= 0 && removeLineItem(line.index)}
                            className="rounded-full border border-neutral-300 px-3 py-1 text-[11px] font-semibold text-neutral-600 transition hover:bg-neutral-100"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-6 text-center text-xs text-neutral-500">
                Add colors and sizes from the cards to build your WhatsApp order.
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2 text-xs text-neutral-700">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span className="font-semibold">{money(subtotal)}</span>
            </div>
            {deliveryFeeTotal > 0 && (
              <div className="flex items-center justify-between">
                <span>{deliveryMethod}</span>
                <span className="font-semibold">{money(deliveryFeeTotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm font-semibold text-black">
              <span>Total</span>
              <span>{money(totalPrice)}</span>
            </div>
          </div>

          <div className="mt-5">
            <label className="text-xs font-medium text-neutral-600">
              Delivery
              <select
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value as ShopSelection["deliveryMethod"])}
                className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              >
                {DELIVERY_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {deliveryInfoRequired && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold text-neutral-700">Delivery Info</p>
              <input
                value={deliveryInfo.name}
                onChange={(e) => setDeliveryInfo((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                aria-label="Your Name"
                placeholder="Your Name"
              />
              <input
                value={deliveryInfo.address}
                onChange={(e) => setDeliveryInfo((prev) => ({ ...prev, address: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                aria-label="Your Address"
                placeholder="Your Address"
              />
              <input
                value={deliveryInfo.postCode || ""}
                onChange={(e) => setDeliveryInfo((prev) => ({ ...prev, postCode: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                aria-label="Post Code (optional)"
                placeholder="Post Code (optional)"
              />
              <input
                value={deliveryInfo.phone}
                onChange={(e) => setDeliveryInfo((prev) => ({ ...prev, phone: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                aria-label="Your Phone Number"
                placeholder="Your Phone Number"
              />
            </div>
          )}

          <div className="mt-5 space-y-3">
            <a
              href={getWhatsAppUrl(orderMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                canOrder
                  ? "bg-[#ff3b22] text-white hover:bg-orange-600"
                  : "cursor-not-allowed bg-neutral-200 text-neutral-500"
              }`}
              aria-disabled={!canOrder}
              onClick={(e) => {
                if (!canOrder) {
                  e.preventDefault();
                  return;
                }

                trackWhatsAppClick({
                  location: "shops_order_send",
                  source: "shops_page",
                });

              }}
            >
              Send Order on WhatsApp
            </a>
            {!!orderLines.length && (
              <button
                type="button"
                onClick={clearLineItems}
                className="inline-flex w-full items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-100"
              >
                Clear list
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  </div>
  );
}
