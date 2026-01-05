"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getWhatsAppUrl } from "@/data/work";
import {
  buildShopWhatsAppMessageForLines,
  getMinSizePrice,
  getSizePrice,
  getSizePrices,
  getSizes,
  sortSizes,
  type ShopItem,
  type ShopOrderLine,
  type ShopSelection,
} from "@/lib/shops";

type SortOrder = "default" | "price-asc";
const DELIVERY_FEE = 100;
const DELIVERY_METHODS = [
  { value: "Surinam pickup", label: "Surinam pickup (Free)" },
  { value: "Post Office delivery", label: `Post Office Delivery (Rs ${DELIVERY_FEE})` },
] as const;

const money = (value: number) => `Rs ${Number(value || 0).toLocaleString()}`;

type ItemSelection = {
  color: string;
  size: string;
  quantity: number;
};

export default function ShopClient() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedColor, setSelectedColor] = useState("all");
  const [selectedSize, setSelectedSize] = useState("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("default");

  const [selections, setSelections] = useState<Record<string, ItemSelection>>({});
  const [orderLines, setOrderLines] = useState<ShopOrderLine[]>([]);
  const [deliveryMethod, setDeliveryMethod] = useState<ShopSelection["deliveryMethod"]>("Surinam pickup");

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
    if (selectedColor !== "all") {
      next = next.filter((item) => item.colors.includes(selectedColor));
    }
    if (selectedSize !== "all") {
      next = next.filter((item) => getSizes(item).includes(selectedSize));
    }
    if (sortOrder === "price-asc") {
      next = next.sort((a, b) => getMinSizePrice(a) - getMinSizePrice(b));
    }
    return next;
  }, [items, selectedColor, selectedSize, sortOrder]);

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

  const deliveryFeeTotal =
    orderLines.length > 0 && deliveryMethod === "Post Office delivery"
      ? DELIVERY_FEE
      : 0;
  const totalPrice = subtotal + deliveryFeeTotal;

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

  const orderMessage = useMemo(
    () => buildShopWhatsAppMessageForLines(orderLines, deliveryMethod),
    [orderLines, deliveryMethod]
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
    const line: ShopOrderLine = {
      itemId: item.id,
      title: item.title,
      color: current.color,
      size: current.size,
      quantity: Math.max(1, Number(current.quantity || 1)),
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
    return (
      <main className="min-h-screen grid place-items-center px-6 py-24 text-sm text-neutral-500">
        Loading shops...
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
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

      <main className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-8">
            <section className="space-y-4">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-500">Shops</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Plain T-shirts ready to order</h1>
              <p className="max-w-2xl text-sm text-neutral-600">
                Choose your color and size, then confirm delivery or pickup. Orders are confirmed via WhatsApp.
              </p>
            </section>

            <section className="flex flex-col gap-4 rounded-[28px] border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-sm font-medium text-neutral-800">Filters</p>
                <p className="text-xs text-neutral-500">Refine by color, size, or price.</p>
              </div>
              <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
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
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-neutral-600">
                  Sort
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                    className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="default">Default</option>
                    <option value="price-asc">Price: low to high</option>
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

          <aside className="h-fit rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Order list</h3>
              <span className="text-xs text-neutral-500">
                {orderLines.length
                  ? `${orderLines.length} item${orderLines.length === 1 ? "" : "s"} · ${totalQty} qty`
                  : "0 items"}
              </span>
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
                          <span className="text-[11px] text-neutral-600">Size: {line.size}</span>
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

            <div className="mt-5 space-y-3">
              <a
                href={getWhatsAppUrl(orderMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  orderLines.length
                    ? "bg-[#FF6600] text-white hover:bg-orange-600"
                    : "cursor-not-allowed bg-neutral-200 text-neutral-500"
                }`}
                aria-disabled={!orderLines.length}
                onClick={(e) => {
                  if (!orderLines.length) e.preventDefault();
                }}
              >
                Order on WhatsApp
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
              <article key={item.id} className="group rounded-[28px] border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
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
                        <span key={entry.size} className="rounded-full border border-neutral-200 px-3 py-1">
                          {entry.size} {money(entry.price)}
                        </span>
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
                          <option key={size} value={size}>{size}</option>
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
                            quantity: Math.max(1, Number(e.target.value || 1)),
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
    </div>
  );
}
