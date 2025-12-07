"use client";

import { useMemo, useState } from "react";
import { getWhatsAppUrl } from "@/data/work";

type ProductKey = "tshirt" | "polo" | "hoodie";

type Tier = { min: number; max: number; price: number };

const products: Record<
  ProductKey,
  { label: string; tiers: Tier[]; note: string }
> = {
  tshirt: {
    label: "T-Shirt",
    note: "Crew neck, 160-180gsm",
    tiers: [
      { min: 1, max: 9, price: 350 },
      { min: 10, max: 49, price: 300 },
      { min: 50, max: 99, price: 260 },
      { min: 100, max: 499, price: 230 },
      { min: 500, max: Infinity, price: 190 },
    ],
  },
  polo: {
    label: "Polo Shirt",
    note: "Collar polo, 200-220gsm",
    tiers: [
      { min: 1, max: 9, price: 450 },
      { min: 10, max: 49, price: 390 },
      { min: 50, max: 99, price: 340 },
      { min: 100, max: 499, price: 310 },
      { min: 500, max: Infinity, price: 270 },
    ],
  },
  hoodie: {
    label: "Hoodie",
    note: "Cotton/poly fleece",
    tiers: [
      { min: 1, max: 9, price: 950 },
      { min: 10, max: 49, price: 850 },
      { min: 50, max: 99, price: 760 },
      { min: 100, max: 499, price: 690 },
      { min: 500, max: Infinity, price: 640 },
    ],
  },
};

function getUnitPrice(product: ProductKey, quantity: number) {
  const tier = products[product].tiers.find((t) => quantity >= t.min && quantity <= t.max);
  return tier?.price ?? products[product].tiers[0].price;
}

export default function PricingEstimator() {
  const [product, setProduct] = useState<ProductKey>("tshirt");
  const [quantity, setQuantity] = useState(50);
  const [rush, setRush] = useState(false);

  const { unitPrice, rushFee, total } = useMemo(() => {
    const base = Math.max(1, quantity || 0);
    const unit = getUnitPrice(product, base);
    const rushFeeRate = rush ? 0.15 : 0;
    const totalBeforeRush = unit * base;
    const rushAmount = Math.round(totalBeforeRush * rushFeeRate);
    return { unitPrice: unit, rushFee: rushAmount, total: totalBeforeRush + rushAmount };
  }, [product, quantity, rush]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-orange-500">Estimator</p>
          <h3 className="text-xl font-semibold text-black">Instant ballpark pricing</h3>
          <p className="text-sm text-neutral-600">Final quote may vary with colors, placements, and fabric.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Item</label>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as ProductKey)}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
          >
            {Object.entries(products).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">{products[product].note}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">Better rates above 50 units.</p>
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-neutral-700">
        <input
          type="checkbox"
          checked={rush}
          onChange={(e) => setRush(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-black focus:ring-black"
        />
        Rush in 48h? (+15%)
      </label>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Est. unit" value={`MUR ${unitPrice.toLocaleString()}`} />
        <Stat label="Est. total" value={`MUR ${total.toLocaleString()}`} />
        <Stat label="Rush fee" value={rush ? `+ MUR ${rushFee.toLocaleString()}` : "None"} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a
          href="#contact"
          className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Lock in this price
        </a>
        <a
          href={getWhatsAppUrl("Hi! Can you confirm pricing for my order?")}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-black transition hover:border-black"
        >
          WhatsApp to confirm
        </a>
      </div>

      <ul className="mt-6 space-y-2 text-sm text-neutral-600">
        <li>• Embroidery and multiple print locations may adjust pricing.</li>
        <li>• Add a rush fee for urgent jobs; standard turnaround is 5–7 working days.</li>
        <li>• Bulk orders (500+) get custom pricing—ask us.</li>
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-center">
      <p className="text-xs uppercase tracking-[0.08em] text-neutral-500">{label}</p>
      <p className="text-lg font-semibold text-black">{value}</p>
    </div>
  );
}
