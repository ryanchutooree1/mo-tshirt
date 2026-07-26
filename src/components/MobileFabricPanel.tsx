"use client";

import { X } from "lucide-react";

type MobileFabricProduct = {
  id: string;
  label: string;
};

type MobileFabricColour = {
  id: string;
  label: string;
};

type MobileFabricPanelProps = {
  products: MobileFabricProduct[];
  activeProductId: string;
  colours: MobileFabricColour[];
  selectedColourId: string | null;
  loading: boolean;
  onProductSelect: (productId: string) => void;
  onColourSelect: (colourId: string) => void;
  onClose: () => void;
};

const COLOUR_HEX: Record<string, string> = {
  beige: "#e8d8b8",
  black: "#171717",
  blue: "#3569d4",
  brown: "#7b4d34",
  burgundy: "#7d2135",
  cream: "#f2e8cf",
  gold: "#d6a934",
  green: "#39a85b",
  grey: "#8b8b8b",
  gray: "#8b8b8b",
  khaki: "#aaa173",
  navy: "#29356d",
  orange: "#ef762f",
  pink: "#ef8ead",
  purple: "#7c4eb5",
  red: "#df3f3f",
  royal: "#345fc4",
  sky: "#71bce8",
  white: "#f8f8f6",
  yellow: "#e8cf43",
};

function getColourBackground(label: string) {
  const names = label
    .toLowerCase()
    .split(/[,/&+-]/)
    .map((name) => name.trim())
    .filter(Boolean);
  const colours = names.map((name) => {
    const matchingName = Object.keys(COLOUR_HEX).find((key) => name.includes(key));
    return matchingName ? COLOUR_HEX[matchingName] : "#a8a8a8";
  });

  if (colours.length <= 1) return colours[0] ?? "#a8a8a8";
  const stopSize = 100 / colours.length;
  const stops = colours.flatMap((colour, index) => [
    `${colour} ${index * stopSize}%`,
    `${colour} ${(index + 1) * stopSize}%`,
  ]);
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

export function MobileFabricPanel({
  products,
  activeProductId,
  colours,
  selectedColourId,
  loading,
  onProductSelect,
  onColourSelect,
  onClose,
}: MobileFabricPanelProps) {
  return (
    <section
      className="rounded-[26px] border border-white/10 bg-[#202020]/95 p-4 text-white shadow-[0_22px_55px_rgba(0,0,0,.36)] backdrop-blur-xl"
      aria-label="Fabric and colour controls"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Garment</p>
          <h3 className="mt-0.5 text-xl font-bold tracking-[-0.03em]">Fabric colour</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white transition active:scale-95"
          aria-label="Close fabric colour controls"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-black/25 p-1.5">
        {products.map((product) => {
          const isActive = product.id === activeProductId;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onProductSelect(product.id)}
              aria-pressed={isActive}
              className={`min-h-11 rounded-xl px-3 text-xs font-bold transition active:scale-[.98] ${
                isActive ? "bg-white text-[#1b1b18] shadow-sm" : "text-white/58"
              }`}
            >
              {product.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto px-0.5 pb-1">
        {loading ? (
          Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              className="h-12 w-12 shrink-0 animate-pulse rounded-full border border-white/15 bg-white/10"
            />
          ))
        ) : colours.length ? (
          colours.map((colour) => {
            const isSelected = colour.id === selectedColourId;
            return (
              <button
                key={colour.id}
                type="button"
                onClick={() => onColourSelect(colour.id)}
                aria-label={`Choose ${colour.label}`}
                aria-pressed={isSelected}
                className={`relative h-12 w-12 shrink-0 rounded-full border-2 transition active:scale-90 ${
                  isSelected
                    ? "border-[#39a9ff] ring-2 ring-[#39a9ff] ring-offset-2 ring-offset-[#202020]"
                    : "border-white/25"
                }`}
                style={{ background: getColourBackground(colour.label) }}
              >
                <span className="sr-only">{colour.label}</span>
              </button>
            );
          })
        ) : (
          <p className="py-2 text-xs leading-5 text-white/55">No live colours are available for this garment.</p>
        )}
      </div>

      <p className="mt-3 truncate text-xs font-semibold text-white/65">
        {colours.find((colour) => colour.id === selectedColourId)?.label ?? "Choose a colour"}
      </p>
    </section>
  );
}
