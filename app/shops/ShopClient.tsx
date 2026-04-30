"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiDownload } from "react-icons/fi";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { getWhatsAppUrl } from "@/data/work";
import { trackShopOrderSubmit, trackWhatsAppClick } from "@/lib/analytics";
import { formatMoney as formatDisplayMoney, formatWholeMoney as formatDisplayWholeMoney } from "@/lib/money";
import {
  buildShopWhatsAppMessageForLines,
  formatSizeLabel,
  getSizePrice,
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

function ShopsLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7fb] text-neutral-900">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <span
          className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-[#FF6600]"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-neutral-600">Loading…</p>
      </div>
    </main>
  );
}

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
            className="inline-flex h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-[#FF6600]"
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
  return [item.photoUrl, item.photoUrl, item.photoUrl];
}

function ProductThumbnailRail({ item }: ProductThumbnailRailProps) {
  const thumbnails = getProductThumbnailUrls(item);

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5" aria-label={`${item.title} thumbnails`}>
      {thumbnails.map((src, index) => (
        <div
          key={`${item.id}-thumb-${index}`}
          className="relative h-10 w-10 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          {src ? (
            <Image
              src={src}
              alt={`${item.title} thumbnail ${index + 1}`}
              fill
              className="object-cover"
              sizes="40px"
            />
          ) : (
            <span className="absolute inset-0 bg-[linear-gradient(135deg,#f5f5f5,#e5e5e5)]" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ShopClient() {
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

  if (loading) {
    return <ShopsLoading />;
  }

  return (
    <div className="min-h-screen bg-[#f7f7fb] text-neutral-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 top-[-12rem] h-72 w-72 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="pointer-events-none absolute right-[-6rem] top-12 h-80 w-80 rounded-full bg-zinc-200/60 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-8rem] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-slate-100/70 blur-3xl" />

        <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <Link href="/" className="flex shrink-0 items-center justify-center gap-2 sm:justify-start" aria-label="MO T-SHIRT Home">
            <Image
              src="/logo_transparent.png"
              alt="MO T-SHIRT logo"
              width={150}
              height={60}
              priority
              className="h-10 w-auto sm:h-12"
            />
          </Link>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
            <nav className="flex w-max min-w-full items-center justify-start gap-2 pb-1 text-xs font-semibold text-neutral-600 sm:w-auto sm:min-w-0 sm:justify-end sm:gap-4 sm:pb-0 sm:text-sm" aria-label="Shops navigation">
              <Link href="/" className="whitespace-nowrap rounded-full border border-neutral-200 bg-white px-3 py-2 transition hover:border-black hover:text-black sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">Home</Link>
              <Link href="/shops" className="whitespace-nowrap rounded-full border border-transparent bg-[#FF6600] px-3 py-2 text-white shadow-sm hover:bg-orange-600 sm:px-3 sm:py-1">
                Plain Shops
              </Link>
              <Link href="/#our-work" className="whitespace-nowrap rounded-full border border-neutral-200 bg-white px-3 py-2 transition hover:border-black hover:text-black sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">Our Work</Link>
              <Link href="/#contact" className="whitespace-nowrap rounded-full border border-neutral-200 bg-white px-3 py-2 transition hover:border-black hover:text-black sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">Contact</Link>
              <TrackedWhatsAppLink
                href={getWhatsAppUrl()}
                trackingLocation="shops_header"
                trackingSource="shops_page"
                target="_blank"
                rel="noopener noreferrer"
                className="whitespace-nowrap rounded-full border border-neutral-200 bg-white px-3 py-2 transition hover:border-black hover:text-black sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
              >
                WhatsApp
              </TrackedWhatsAppLink>
            </nav>
          </div>
        </div>
        </header>

        <main className="relative z-10 mx-auto w-full max-w-6xl px-6 py-14">
        <div className="space-y-8">
            <section className="flex flex-col gap-4 rounded-[28px] border border-neutral-200 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-sm font-medium text-neutral-800">Filters</p>
                <p className="text-xs text-neutral-500">Refine by product, color, or size.</p>
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

        <section className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const sizes = getSizes(item);
            const sizePrices = getSizePrices(item);
            const isOneSizeItem =
              sizePrices.length === 1 && isOneSizeLabel(sizePrices[0]?.size || "");
            const hasMultipleColors = item.colors.length > 1;
            const hasMultipleSizes = sizePrices.length > 1;
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
            return (
              <article key={item.id} className="group rounded-[28px] border border-neutral-200 bg-white/90 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100">
                  {item.photoUrl ? (
                    <ShopProductImage src={item.photoUrl} alt={item.title} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                      No photo
                    </div>
                  )}
                  {item.photoUrl && (
                    <a
                      href={`/api/shops/download?url=${encodeURIComponent(item.photoUrl)}&name=${encodeURIComponent(
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
                      <ProductThumbnailRail item={item} />
                    </div>
                  </div>

                  {!isOneSizeItem && (
                    <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
                      {sizePrices.length ? (
                      sizePrices.map((entry) => (
                        <button
                          key={entry.size}
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
                    {hasMultipleSizes && !isOneSizeItem && (
                      <label className="flex flex-col gap-2">
                        Size
                        <select
                          value={selection.size}
                          onChange={(e) => updateSelection(item.id, { size: e.target.value })}
                          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                        >
                          {sizes.map((size) => (
                            <option key={size} value={size}>
                              {`${formatSizeLabel(size)} (${formatDisplayWholeMoney(getSizePrice(item, size))})`}
                            </option>
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

        {!filtered.length && !error && (
          <div className="mt-12 rounded-[24px] border border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-600">
            No items match those filters yet.
          </div>
        )}
      </main>

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
                placeholder="Your Name"
              />
              <input
                value={deliveryInfo.address}
                onChange={(e) => setDeliveryInfo((prev) => ({ ...prev, address: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                placeholder="Your Address"
              />
              <input
                value={deliveryInfo.postCode || ""}
                onChange={(e) => setDeliveryInfo((prev) => ({ ...prev, postCode: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                placeholder="Post Code (optional)"
              />
              <input
                value={deliveryInfo.phone}
                onChange={(e) => setDeliveryInfo((prev) => ({ ...prev, phone: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
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
                  ? "bg-[#FF6600] text-white hover:bg-orange-600"
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
                trackShopOrderSubmit({
                  line_items: orderLines.length,
                  total_quantity: totalQty,
                  delivery_method: deliveryMethod,
                  delivery_required: deliveryInfoRequired,
                  value: totalPrice,
                  currency: "MUR",
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
