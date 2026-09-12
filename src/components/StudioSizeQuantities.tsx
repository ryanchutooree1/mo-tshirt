"use client";

import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { getStudioSizeSelection, MAX_SIZE_QUANTITY } from "@/lib/design-studio-sizes";

export function StudioSizeQuantities({ availableSizes, quantities, onChange }: {
  availableSizes: string[];
  quantities: Record<string, number>;
  onChange: (size: string, quantity: number) => void;
}) {
  const id = useId();
  const selection = getStudioSizeSelection(availableSizes, quantities);
  return <section aria-label="Sizes and quantities" className="space-y-3">
    <p className="text-xs leading-5 text-[#626a76]">Add a quantity for every size you need. For two Small garments, set S to 2. You can mix sizes in one order.</p>
    <div data-studio-part="size-grid" className="grid grid-cols-2 gap-3">
      {availableSizes.map(size => <div key={size} data-selected={Boolean(quantities[size])} className={`rounded-xl border p-2 ${quantities[size] ? "border-[#ff5a0a] bg-[#fff8f3]" : "border-[#d6dbe2] bg-white"}`}>
        <label htmlFor={`${id}-${size}`} className="mb-2 block text-center text-sm font-bold">{size}</label>
        <div className="flex items-center justify-center gap-1">
          <button type="button" aria-label={`Decrease ${size} quantity`} disabled={!quantities[size]} onClick={() => onChange(size, Math.max(0, (quantities[size] || 0) - 1))} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#d6dbe2] bg-white disabled:opacity-30"><Minus size={16} /></button>
          <input id={`${id}-${size}`} aria-label={`${size} quantity`} inputMode="numeric" pattern="[0-9]*" maxLength={4} value={quantities[size] || ""} placeholder="0" onChange={event => {
            if (/^\d*$/.test(event.target.value)) onChange(size, Math.min(MAX_SIZE_QUANTITY, Number(event.target.value) || 0));
          }} className="studio-field h-11 min-w-0 flex-1 rounded-lg bg-white text-center text-sm font-bold" />
          <button type="button" aria-label={`Increase ${size} quantity`} disabled={quantities[size] >= MAX_SIZE_QUANTITY} onClick={() => onChange(size, (quantities[size] || 0) + 1)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#d6dbe2] bg-white disabled:opacity-30"><Plus size={16} /></button>
        </div>
      </div>)}
    </div>
    <p aria-live="polite" className="rounded-xl bg-[#f5f6f8] p-3 text-xs font-semibold text-[#313a46]">{selection.total} total · {selection.label}</p>
  </section>;
}
