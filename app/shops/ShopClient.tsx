"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getWhatsAppUrl } from "@/data/work";
import {
  buildShopWhatsAppMessageForLines,
  formatSizeLabel,
  getSizePrice,
  getSizePrices,
  getSizes,
  sortSizes,
  type DeliveryInfo,
  type ShopItem,
  type ShopOrderLine,
  type ShopOrderLineWithPrice,
  type ShopSelection,
} from "@/lib/shops";

const DELIVERY_FEE = 100;
const DELIVERY_METHODS = [
  { value: "Surinam pickup", label: "Surinam pickup (Free)" },
  { value: "Post Office delivery", label: `Post Office Delivery (Rs ${DELIVERY_FEE})` },
] as const;

const money = (value: number) => `Rs ${Number(value || 0).toLocaleString()}`;

const LOADING_CARDS = Array.from({ length: 6 });

type ItemSelection = {
  color: string;
  size: string;
  quantity: number | "";
};

function ShopsLoading() {
  return (
    <main className="min-h-screen bg-[#f7f7fb] text-neutral-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 top-[-10rem] h-72 w-72 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="pointer-events-none absolute right-[-6rem] top-16 h-80 w-80 rounded-full bg-zinc-200/60 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-8rem] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-slate-100/70 blur-3xl" />

        <div className="relative mx-auto w-full max-w-6xl px-6 py-16">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-neutral-200">
                <Image
                  src="/logo_transparent.png"
                  alt="MO T-SHIRT logo"
                  width={40}
                  height={16}
                  className="h-6 w-auto"
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-neutral-500">Loading</p>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Setting up the rack</h1>
                <p className="mt-1 text-sm text-neutral-600">Pulling fresh stock, colors, and prices.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-neutral-700 shadow-sm ring-1 ring-neutral-200 backdrop-blur">
              <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-500" />
              </span>
              Fetching the latest drop…
            </div>
          </div>

          <section className="mt-10 rounded-[28px] border border-neutral-200 bg-white/80 p-6 shadow-sm">
            <div className="space-y-4">
              <div className="h-3 w-24 rounded-full bg-neutral-200 animate-pulse" />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="h-10 rounded-2xl bg-neutral-200/80 animate-pulse" />
                <div className="h-10 rounded-2xl bg-neutral-200/80 animate-pulse" />
                <div className="h-10 rounded-2xl bg-neutral-200/80 animate-pulse" />
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {LOADING_CARDS.map((_, idx) => (
              <article
                key={idx}
                className="rounded-[28px] border border-neutral-200 bg-white/80 p-4 shadow-sm"
              >
                <div className="aspect-square w-full rounded-2xl bg-neutral-200/80 animate-pulse" />
                <div className="mt-4 space-y-3">
                  <div className="h-4 w-28 rounded-full bg-orange-100/80 animate-pulse" />
                  <div className="h-5 w-3/4 rounded-full bg-neutral-200/80 animate-pulse" />
                  <div className="flex flex-wrap gap-2">
                    <div className="h-7 w-24 rounded-full bg-neutral-200/80 animate-pulse" />
                    <div className="h-7 w-20 rounded-full bg-neutral-200/80 animate-pulse" />
                    <div className="h-7 w-16 rounded-full bg-neutral-200/80 animate-pulse" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="h-10 rounded-2xl bg-neutral-200/80 animate-pulse" />
                    <div className="h-10 rounded-2xl bg-neutral-200/80 animate-pulse" />
                    <div className="h-10 rounded-2xl bg-neutral-200/80 animate-pulse" />
                    <div className="h-10 rounded-2xl bg-neutral-200/80 animate-pulse" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-24 rounded-full bg-neutral-200/80 animate-pulse" />
                    <div className="h-9 w-28 rounded-full bg-neutral-200/80 animate-pulse" />
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </main>
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
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load shops.");
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
            size: sizes[0] || "M",
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
    items.forEach((item) => {
      if (item.title) set.add(item.title);
    });
    return Array.from(set).sort();
  }, [items]);

  const availableColors = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => item.colors.forEach((color) => set.add(color)));
    return Array.from(set).sort();
  }, [items]);

  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => getSizes(item).forEach((size) => set.add(size)));
    return sortSizes(Array.from(set));
  }, [items]);

  const filtered = useMemo(() => {
    let next = items.slice();
    next.sort((a, b) => (b.position || 0) - (a.position || 0));
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

  const deliveryFeeTotal =
    orderLines.length > 0 && deliveryMethod === "Post Office delivery"
      ? DELIVERY_FEE
      : 0;
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

  const deliveryInfoRequired = deliveryMethod === "Post Office delivery";
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

        <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2" aria-label="MO T-SHIRT Home">
            <Image src="/logo_transparent.png" alt="MO T-SHIRT logo" width={140} height={48} className="h-9 w-auto" />
          </Link>
          <nav className="flex items-center gap-4 text-xs font-semibold text-neutral-600 sm:text-sm">
            <Link href="/" className="transition hover:text-black">Home</Link>
            <Link href="/shops" className="rounded-full bg-[#FF6600] px-3 py-1 text-white shadow-sm hover:bg-orange-600">
              Plain Shops
            </Link>
            <Link href="/work" className="transition hover:text-black">Our Work</Link>
            <Link href="/contact" className="transition hover:text-black">Contact</Link>
            <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="transition hover:text-black">
              WhatsApp
            </a>
          </nav>
        </div>
        </header>

        <main className="relative z-10 mx-auto w-full max-w-6xl px-6 py-14">
        <div className="space-y-8">
            <section className="rounded-[32px] border border-neutral-200 bg-white/80 p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-[0.35em] text-neutral-500">Shops</p>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready-to-order essentials</h1>
                  <p className="max-w-2xl text-sm text-neutral-600">
                    Browse T-shirts, polos, hoodies, and caps. Choose color and size, then confirm delivery or pickup via WhatsApp.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-neutral-700">
                    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Fast pickup</span>
                    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">WhatsApp confirmation</span>
                    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Local delivery options</span>
                  </div>
                </div>
                <div className="rounded-[24px] border border-neutral-200 bg-gradient-to-br from-white via-slate-50 to-zinc-100 px-5 py-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">How it works</p>
                  <ol className="mt-3 space-y-2 text-sm text-neutral-700">
                    <li><span className="font-semibold text-neutral-900">1.</span> Pick item + color</li>
                    <li><span className="font-semibold text-neutral-900">2.</span> Choose size + qty</li>
                    <li><span className="font-semibold text-neutral-900">3.</span> Confirm on WhatsApp</li>
                  </ol>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4 rounded-[28px] border border-neutral-200 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-sm font-medium text-neutral-800">Filters</p>
                <p className="text-xs text-neutral-500">Refine by product, color, or size.</p>
              </div>
              <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
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
            const selection =
              selections[item.id] || {
                color: item.colors[0] || "Default",
                size: sizes[0] || "M",
                quantity: 1,
              };
            const sizePrice = getSizePrice(item, selection.size);
            const displayColor = selection.color || item.colors[0] || "Color";
            return (
              <article key={item.id} className="group rounded-[28px] border border-neutral-200 bg-white/90 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100">
                  {item.photoUrl ? (
                    <Image
                      src={item.photoUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                      No photo
                    </div>
                  )}
                  {!item.inStock && (
                    <span className="absolute left-3 top-3 rounded-full bg-black px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                      Out of stock
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-black">
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                        {displayColor}
                      </span>
                      <span>{item.title}</span>
                    </h2>
                  </div>

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
                          {formatSizeLabel(entry.size)} {money(entry.price)}
                        </button>
                      ))
                    ) : (
                      <span className="text-neutral-400">Sizes not set</span>
                    )}
                  </div>

                  <div className="grid gap-3 text-xs text-neutral-600 sm:grid-cols-2">
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
                    <label className="flex flex-col gap-2">
                      Size
                      <select
                        value={selection.size}
                        onChange={(e) => updateSelection(item.id, { size: e.target.value })}
                        className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                      >
                        {sizes.map((size) => (
                          <option key={size} value={size}>{formatSizeLabel(size)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2">
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
                    <div className="flex flex-col gap-2">
                      <span>Price (selected size)</span>
                      <div className="flex items-center rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-900">
                        {money(sizePrice)}
                      </div>
                    </div>
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
                          Size {formatSizeLabel(line.size)}
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
                <span>Post Office Delivery</span>
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
                if (!canOrder) e.preventDefault();
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
