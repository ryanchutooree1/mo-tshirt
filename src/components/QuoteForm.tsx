"use client";

import Image from "next/image";
import { Check, ChevronDown, FileText, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";
import { trackQuoteSubmit } from "@/lib/analytics";
import { formatWholeMoney as formatDisplayWholeMoney } from "@/lib/money";
import {
  QUOTE_GARMENT_OPTIONS,
  SIZE_ORDER,
  createQuoteColorOptionsByGarment,
  type QuoteGarmentOption,
} from "@/lib/shops";

type QuoteFormProps = {
  source?: string;
  className?: string;
};

type FormState = {
  name: string;
  email: string;
  phone: string;
  deadline: string;
  notes: string;
  delivery: string;
  deliveryName: string;
  deliveryAddress: string;
  deliveryPostCode: string;
  deliveryPhone: string;
};

type GarmentLine = {
  garment: string;
  color: string;
  size: string;
  quantity: string;
};

type ArtworkSlot = "front" | "back";

type ArtworkItem = {
  id: number;
  label: string;
  description: string;
  product: string;
  color: string;
  size: string;
  printPlacement: "front" | "back" | "front_back";
  frontLogoDescription: string;
  backLogoDescription: string;
  quantity: string;
  frontFile: File | null;
  backFile: File | null;
};

type PrintMethodInfo = {
  title: string;
  description?: string;
  note?: string;
  items?: string[];
};

type QuoteOptionsResponse = {
  colors?: string[];
  colorsByGarment?: Partial<Record<QuoteGarmentOption, string[]>>;
};

const garmentOptions = [...QUOTE_GARMENT_OPTIONS];
const sizeOptions = [...SIZE_ORDER];
const DTF_METHOD = "1. DTF Printing (Price $$$)";
const VINYL_METHOD = "2. Vinyl Heat Press Printing (Price $$)";
const SCREEN_PRINTING_METHOD = "3. Screen Printing (Price $)";
const NOT_SURE_METHOD = "Not sure";
const printMethods = [
  DTF_METHOD,
  VINYL_METHOD,
  SCREEN_PRINTING_METHOD,
  NOT_SURE_METHOD,
];
const deliveryOptions = [
  "Surinam Pickup (Free)",
  `Post Office Postage Delivery (${formatDisplayWholeMoney(100)})`,
  `Post Office Express Delivery (${formatDisplayWholeMoney(150)})`,
  "Delivery (Need to arrange first)",
];
const artworkAccept =
  ".png,.jpg,.jpeg,.webp,.svg,.heic,.heif,.pdf,image/png,image/jpeg,image/webp,image/svg+xml,image/heic,image/heif,application/pdf";
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
const printMethodInfoByMethod: Partial<Record<string, PrintMethodInfo>> = {
  [SCREEN_PRINTING_METHOD]: {
    title: "Screen printing rule",
    description:
      "Minimum order is 10 pcs per design. That means 10 identical prints for one logo or artwork, not 10 pcs with 10 different designs.",
    note: "Screen printing makes use of paint. If you have several logos or design versions, add each one separately below and tell us its quantity.",
  },
  [VINYL_METHOD]: {
    title: "Vinyl Heat Press guide",
    description:
      "Best for simple logos, names, numbers, and clean shapes. It works well for smaller quantities and personalized pieces.",
    note: "We make use of durable vinyl. If the artwork has gradients, photos, or a lot of detail, DTF is usually the better option.",
  },
  [DTF_METHOD]: {
    title: "DTF (Direct-to-Film) guide",
    description:
      "It is best for full-color artwork, gradients, and detailed logos. It is a strong choice for smaller runs that are too complex for vinyl or not ideal for screen printing.",
    note: "Send the clearest artwork file you have so we can confirm the print size and placement properly.",
  },
  [NOT_SURE_METHOD]: {
    title: "Printing Methods:",
    items: [
      "DTF (Faster Process)",
      "Vinyl Heat Press (Fast Process)",
      "Screen Printing (Slower Process)",
    ],
  },
};

function createArtworkItem(id: number): ArtworkItem {
  return {
    id,
    label: "",
    description: "",
    product: "",
    color: "",
    size: "",
    printPlacement: "front",
    frontLogoDescription: "",
    backLogoDescription: "",
    quantity: "",
    frontFile: null,
    backFile: null,
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

function formatColorOptionLabel(color: string) {
  const normalized = String(color || "").trim().toLowerCase();
  if (normalized === "black" || normalized === "white") {
    return `${color} (Faster)`;
  }
  return color;
}

function getColorSwatch(color: string) {
  const normalized = color.toLowerCase().trim();
  const found = COLOR_SWATCH_RULES.find((rule) =>
    rule.match.some((token) => normalized.includes(token))
  );
  return found?.value || "#d4d4d8";
}

function ColorSelect({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <div ref={rootRef} className="relative mt-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-neutral-900 focus:border-black focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {value ? (
            <span
              className="h-3 w-3 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.16),0_1px_2px_rgba(0,0,0,0.08)]"
              style={{ backgroundColor: getColorSwatch(value) }}
              aria-hidden="true"
            />
          ) : null}
          <span className={`truncate ${value ? "text-neutral-900" : "text-neutral-500"}`}>
            {value ? formatColorOptionLabel(value) : placeholder}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled ? (
        <div
          className="absolute left-0 z-30 mt-2 max-h-72 w-max min-w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.12)] sm:max-w-[26rem]"
          role="listbox"
        >
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-neutral-700 transition hover:bg-neutral-50"
            role="option"
            aria-selected={!value}
          >
            <span className="text-left leading-snug">{placeholder}</span>
            {!value ? <Check className="h-4 w-4 text-neutral-700" /> : null}
          </button>
          {options.map((option) => {
            const active = option === value;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                  active ? "bg-neutral-100 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"
                }`}
                role="option"
                aria-selected={active}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.16),0_1px_2px_rgba(0,0,0,0.08)]"
                    style={{ backgroundColor: getColorSwatch(option) }}
                    aria-hidden="true"
                  />
                  <span className="text-left leading-snug">{formatColorOptionLabel(option)}</span>
                </span>
                {active ? <Check className="h-4 w-4 shrink-0 text-neutral-900" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getArtworkSlots(printPlacement: ArtworkItem["printPlacement"]): ArtworkSlot[] {
  return printPlacement === "front_back" ? ["front", "back"] : [printPlacement];
}

function getArtworkSlotLabel(slot: ArtworkSlot) {
  return slot === "front" ? "Front logo" : "Back logo";
}

function getArtworkSlotFile(item: ArtworkItem, slot: ArtworkSlot) {
  return slot === "front" ? item.frontFile : item.backFile;
}

function getArtworkSlotDescription(item: ArtworkItem, slot: ArtworkSlot) {
  const legacyDescription = item.description.trim();
  return (slot === "front" ? item.frontLogoDescription : item.backLogoDescription).trim() || legacyDescription;
}

function hasArtworkFile(item: ArtworkItem) {
  return getArtworkSlots(item.printPlacement).some((slot) => Boolean(getArtworkSlotFile(item, slot)));
}

function getArtworkUploadEntries(items: ArtworkItem[]) {
  return items.flatMap((item) =>
    getArtworkSlots(item.printPlacement)
      .map((slot) => ({ item, slot, file: getArtworkSlotFile(item, slot) }))
      .filter((entry): entry is { item: ArtworkItem; slot: ArtworkSlot; file: File } => Boolean(entry.file))
  );
}

function buildArtworkAttachmentMetadata(
  entry: { item: ArtworkItem; slot: ArtworkSlot; file: File },
  index: number
) {
  const { item, slot, file: currentFile } = entry;
  if (!currentFile) return null;
  const slotDescription = getArtworkSlotDescription(item, slot);
  const descriptionRows = [
    item.product.trim() ? `Product: ${item.product.trim()}` : "",
    item.color.trim() ? `Colour: ${item.color.trim()}` : "",
    item.size.trim() ? `Size: ${item.size.trim()}` : "",
    slotDescription ? `${getArtworkSlotLabel(slot).replace(" logo", "")}: ${slotDescription}` : "",
  ].filter(Boolean);
  const placementLabel = getArtworkSlotLabel(slot);

  return {
    label: item.label.trim() || `${placementLabel} ${index + 1}`,
    description: descriptionRows.join(" / ") || null,
    quantity: item.quantity.trim() || null,
    filename: currentFile.name,
    contentType: currentFile.type || "application/octet-stream",
    size: currentFile.size || null,
  };
}

function isPreviewableArtworkFile(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|svg|heic|heif)$/i.test(file.name);
}

function ArtworkFilePreview({ file }: { file: File | null }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 1200 });

  useEffect(() => {
    if (!file || !isPreviewableArtworkFile(file)) {
      setPreviewUrl(null);
      setOpen(false);
      setDimensions({ width: 1200, height: 1200 });
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);

    const probeImage = new window.Image();
    probeImage.onload = () => {
      setDimensions({
        width: probeImage.naturalWidth || 1200,
        height: probeImage.naturalHeight || 1200,
      });
    };
    probeImage.src = nextPreviewUrl;

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [file]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!file || !previewUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        aria-label={`Zoom ${file.name}`}
      >
        <Image
          src={previewUrl}
          alt={`${file.name} preview`}
          fill
          unoptimized
          className="object-contain transition group-hover:opacity-95"
        />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
            aria-label="Close zoom"
          />
          <div className="relative w-full max-w-5xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-10 right-0 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-700 shadow"
            >
              Close
            </button>
            <div className="overflow-hidden rounded-[28px] bg-white p-4 shadow-2xl">
              <Image
                src={previewUrl}
                alt={`${file.name} preview`}
                width={dimensions.width}
                height={dimensions.height}
                unoptimized
                sizes="(max-width: 1024px) 95vw, 900px"
                className="h-auto w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function QuoteForm({ source = "Website", className }: QuoteFormProps) {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    deadline: "",
    notes: "",
    delivery: deliveryOptions[0],
    deliveryName: "",
    deliveryAddress: "",
    deliveryPostCode: "",
    deliveryPhone: "",
  });
  const [garmentLines, setGarmentLines] = useState<GarmentLine[]>([
    { garment: garmentOptions[0], color: "", size: sizeOptions[0], quantity: "1" },
  ]);
  const [printMethod, setPrintMethod] = useState<string>(NOT_SURE_METHOD);
  const [showArtworkSection, setShowArtworkSection] = useState(false);
  const [artworkItems, setArtworkItems] = useState<ArtworkItem[]>([createArtworkItem(1)]);
  const [nextArtworkId, setNextArtworkId] = useState(2);
  const [pendingArtworkPickerId, setPendingArtworkPickerId] = useState<number | null>(null);
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [deliveryPhoneError, setDeliveryPhoneError] = useState<string | null>(null);
  const [deliveryPostCodeError, setDeliveryPostCodeError] = useState<string | null>(null);
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [colorOptionsByGarment, setColorOptionsByGarment] = useState<
    Record<QuoteGarmentOption, string[]>
  >(() => createQuoteColorOptionsByGarment());
  const [loadingColors, setLoadingColors] = useState(true);
  const artworkInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isValidPhone = (value: string) => /^[0-9+()\s-]+$/.test(value);
  const isValidPostCode = (value: string) => /^\d+$/.test(value);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateGarmentLine(index: number, patch: Partial<GarmentLine>) {
    setGarmentLines((prev) => {
      const next = prev.slice();
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addGarmentLine() {
    setGarmentLines((prev) => [
      ...prev,
      { garment: garmentOptions[0], color: "", size: sizeOptions[0], quantity: "1" },
    ]);
  }

  function removeGarmentLine(index: number) {
    setGarmentLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateArtworkItem(index: number, patch: Partial<ArtworkItem>) {
    setArtworkItems((prev) => {
      const next = prev.slice();
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addArtworkItem() {
    const createdId = nextArtworkId;
    setShowArtworkSection(true);
    setArtworkItems((prev) => [...prev, createArtworkItem(createdId)]);
    setNextArtworkId((prev) => prev + 1);
    setPendingArtworkPickerId(createdId);
  }

  function removeArtworkItem(index: number) {
    setArtworkItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function getArtworkInputKey(id: number, slot: ArtworkSlot) {
    return `${id}-${slot}`;
  }

  function setArtworkInputRef(key: string, node: HTMLInputElement | null) {
    if (node) {
      artworkInputRefs.current[key] = node;
      return;
    }
    delete artworkInputRefs.current[key];
  }

  function openArtworkPicker(id: number, slot: ArtworkSlot = "front") {
    setShowArtworkSection(true);
    const targetInput = artworkInputRefs.current[getArtworkInputKey(id, slot)];
    if (targetInput) {
      targetInput.click();
      return;
    }
    setPendingArtworkPickerId(id);
  }

  function handleEmailChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setForm((prev) => ({ ...prev, email: next }));
    if (!next) {
      setEmailError("Email is required.");
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      setEmailError("Enter a valid email.");
    } else {
      setEmailError(null);
    }
  }

  function handleFileChange(index: number, slot: ArtworkSlot, e: ChangeEvent<HTMLInputElement>) {
    const nextFile = e.target.files?.[0] || null;
    updateArtworkItem(index, slot === "front" ? { frontFile: nextFile } : { backFile: nextFile });
  }

  function handlePhoneChange(value: string) {
    update("phone", value);
    if (!value) {
      setPhoneError(null);
      return;
    }
    setPhoneError(isValidPhone(value) ? null : "Use only numbers and + ( ) -");
  }

  function handleDeliveryPhoneChange(value: string) {
    update("deliveryPhone", value);
    if (!value) {
      setDeliveryPhoneError(null);
      return;
    }
    setDeliveryPhoneError(isValidPhone(value) ? null : "Use only numbers and + ( ) -");
  }

  function handleDeliveryPostCodeChange(value: string) {
    update("deliveryPostCode", value);
    if (!value) {
      setDeliveryPostCodeError(null);
      return;
    }
    setDeliveryPostCodeError(isValidPostCode(value) ? null : "Numbers only");
  }

  const totalQuantity = garmentLines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0);
  const screenPrintingSelected = printMethod === SCREEN_PRINTING_METHOD;
  const showScreenPrintingWarning = screenPrintingSelected && totalQuantity < 10;
  const selectedPrintMethodInfo = printMethodInfoByMethod[printMethod];
  const uploadedArtworkCount = getArtworkUploadEntries(artworkItems).length;

  function getGarmentColorOptions(garment: string) {
    const garmentKey = QUOTE_GARMENT_OPTIONS.includes(garment as QuoteGarmentOption)
      ? (garment as QuoteGarmentOption)
      : "Other";
    const garmentColors = colorOptionsByGarment[garmentKey] || [];
    return garmentColors.length ? garmentColors : availableColors;
  }

  useEffect(() => {
    let active = true;

    async function loadQuoteOptions() {
      try {
        const res = await fetch("/api/quote-options");
        const body = (await res.json().catch(() => ({}))) as QuoteOptionsResponse & {
          error?: string;
        };

        if (!res.ok) {
          throw new Error(body.error || "Failed to load quote options.");
        }

        if (!active) return;

        const nextColors = Array.isArray(body.colors)
          ? body.colors.map((entry) => String(entry || "").trim()).filter(Boolean)
          : [];
        const nextColorsByGarment = createQuoteColorOptionsByGarment();

        QUOTE_GARMENT_OPTIONS.forEach((garment) => {
          const garmentColors = body.colorsByGarment?.[garment];
          nextColorsByGarment[garment] = Array.isArray(garmentColors)
            ? garmentColors.map((entry) => String(entry || "").trim()).filter(Boolean)
            : [];
        });

        setAvailableColors(nextColors);
        setColorOptionsByGarment(nextColorsByGarment);
      } catch (error) {
        console.error("quote-options:load", error);
        if (!active) return;
        setAvailableColors([]);
        setColorOptionsByGarment(createQuoteColorOptionsByGarment());
      } finally {
        if (active) setLoadingColors(false);
      }
    }

    loadQuoteOptions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setGarmentLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const garmentKey = QUOTE_GARMENT_OPTIONS.includes(line.garment as QuoteGarmentOption)
          ? (line.garment as QuoteGarmentOption)
          : "Other";
        const garmentColors = colorOptionsByGarment[garmentKey]?.length
          ? colorOptionsByGarment[garmentKey]
          : availableColors;
        if (!line.color || garmentColors.includes(line.color)) return line;
        changed = true;
        return { ...line, color: "" };
      });
      return changed ? next : prev;
    });
  }, [availableColors, colorOptionsByGarment]);

  useEffect(() => {
    if (pendingArtworkPickerId === null) return;
    const targetInput = artworkInputRefs.current[getArtworkInputKey(pendingArtworkPickerId, "front")];
    if (!targetInput) return;
    targetInput.click();
    setPendingArtworkPickerId(null);
  }, [artworkItems, pendingArtworkPickerId]);

  function getScreenPrintingValidationMessage() {
    const filledArtworkItems = artworkItems.filter(
      (item) =>
        hasArtworkFile(item) ||
        item.label.trim() ||
        item.description.trim() ||
        item.product.trim() ||
        item.color.trim() ||
        item.size.trim() ||
        item.frontLogoDescription.trim() ||
        item.backLogoDescription.trim() ||
        item.quantity.trim()
    );
    const incompleteArtwork = filledArtworkItems.find((item) =>
      getArtworkSlots(item.printPlacement).some((slot) => !getArtworkSlotFile(item, slot))
    );
    if (incompleteArtwork) {
      return "Upload the required front/back logo file or clear the extra logo row before sending the quote.";
    }

    if (!screenPrintingSelected) return null;
    if (totalQuantity < 10) {
      return "Screen printing requires at least 10 pieces for the same design.";
    }

    const uploadedArtworkItems = filledArtworkItems.filter(hasArtworkFile);
    if (uploadedArtworkItems.length > 1) {
      const missingQty = uploadedArtworkItems.find((item) => !item.quantity.trim() || Number(item.quantity) <= 0);
      if (missingQty) {
        return "Add the quantity for each uploaded design so we can confirm the 10-piece minimum per design.";
      }
    }

    const tooSmall = uploadedArtworkItems.find(
      (item) => item.quantity.trim() && Number(item.quantity) > 0 && Number(item.quantity) < 10
    );
    if (tooSmall) {
      const firstFile = getArtworkSlots(tooSmall.printPlacement)
        .map((slot) => getArtworkSlotFile(tooSmall, slot))
        .find(Boolean);
      return `${tooSmall.label.trim() || firstFile?.name || "This design"} needs at least 10 pieces for screen printing.`;
    }

    const declaredArtworkQty = uploadedArtworkItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    if (declaredArtworkQty > totalQuantity) {
      return "Artwork quantities cannot be higher than the total garment quantity.";
    }

    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const phoneOk = !form.phone || isValidPhone(form.phone);
    const deliveryPhoneOk = !form.deliveryPhone || isValidPhone(form.deliveryPhone);
    const deliveryPostCodeOk = !form.deliveryPostCode || isValidPostCode(form.deliveryPostCode);
    setPhoneError(phoneOk ? null : "Use only numbers and + ( ) -");
    setDeliveryPhoneError(deliveryPhoneOk ? null : "Use only numbers and + ( ) -");
    setDeliveryPostCodeError(deliveryPostCodeOk ? null : "Numbers only");
    if (!phoneOk || !deliveryPhoneOk || !deliveryPostCodeOk) return;

    const screenPrintingError = getScreenPrintingValidationMessage();
    if (screenPrintingError) {
      setResult({ ok: false, msg: screenPrintingError });
      return;
    }

    setLoading(true);
    setResult(null);

    const summaryMessage = form.notes.trim()
      ? "Notes are included in the details above."
      : "Quote request submitted via the website.";

    const payload = new FormData();
    const primaryLine = garmentLines[0] || { garment: "", color: "", size: "", quantity: "" };
    payload.append("name", form.name);
    payload.append("email", form.email);
    payload.append("message", summaryMessage);
    payload.append("website", website);
    payload.append("phone", form.phone);
    payload.append("garment", primaryLine.garment);
    payload.append("color", primaryLine.color);
    payload.append("size", primaryLine.size);
    payload.append("printMethod", printMethod);
    payload.append("quantity", primaryLine.quantity);
    payload.append("garments", JSON.stringify(garmentLines));
    payload.append("deadline", form.deadline);
    payload.append("notes", form.notes);
    payload.append("source", source);
    payload.append("delivery", form.delivery);
    payload.append("deliveryName", form.deliveryName);
    payload.append("deliveryAddress", form.deliveryAddress);
    payload.append("deliveryPostCode", form.deliveryPostCode);
    payload.append("deliveryPhone", form.deliveryPhone);

    const uploadedArtworkEntries = getArtworkUploadEntries(artworkItems);
    const uploadedArtworkItems = artworkItems.filter(hasArtworkFile);
    const firstFrontLogoDescription =
      artworkItems.find((item) => item.printPlacement !== "back" && item.frontLogoDescription.trim())
        ?.frontLogoDescription.trim() || "";
    const firstBackLogoDescription =
      artworkItems.find((item) => item.printPlacement !== "front" && item.backLogoDescription.trim())
        ?.backLogoDescription.trim() || "";
    payload.append(
      "designBrief",
      JSON.stringify({
        product: primaryLine.garment,
        color: primaryLine.color,
        printMethod,
        deadline: form.deadline,
        totalQty: totalQuantity,
        clientNotes: form.notes,
        frontLogoDescription: firstFrontLogoDescription,
        backLogoDescription: firstBackLogoDescription,
        lineItems: garmentLines,
        artwork: uploadedArtworkItems.map((item, index) => ({
          label: item.label.trim() || `Logo ${index + 1}`,
          product: item.product.trim(),
          color: item.color.trim(),
          size: item.size.trim(),
          printPlacement: item.printPlacement,
          frontLogoDescription: item.frontLogoDescription.trim(),
          backLogoDescription: item.backLogoDescription.trim(),
          quantity: item.quantity.trim(),
          files: getArtworkSlots(item.printPlacement).map((slot) => ({
            side: slot,
            filename: getArtworkSlotFile(item, slot)?.name || "",
          })),
        })),
      })
    );
    if (uploadedArtworkEntries.length) {
      const attachmentMetadata = uploadedArtworkEntries
        .map((entry, index) => buildArtworkAttachmentMetadata(entry, index))
        .filter((entry): entry is NonNullable<ReturnType<typeof buildArtworkAttachmentMetadata>> => Boolean(entry));

      payload.append("attachments", JSON.stringify(attachmentMetadata));
      uploadedArtworkEntries.forEach((entry) => {
        payload.append("files", entry.file);
      });
    }

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        body: payload,
      });
      const body = await res.json();
      if (res.ok) {
        trackQuoteSubmit({
          form_source: source,
          print_method: printMethod,
          garment_lines: garmentLines.length,
          total_quantity: totalQuantity,
          artwork_count: uploadedArtworkEntries.length,
          delivery_method: form.delivery,
        });
        setResult({ ok: true, msg: body?.message || "Got it! We’ll reply soon." });
        setForm({
          name: "",
          email: "",
          phone: "",
          deadline: "",
          notes: "",
          delivery: deliveryOptions[0],
          deliveryName: "",
          deliveryAddress: "",
          deliveryPostCode: "",
          deliveryPhone: "",
        });
        setGarmentLines([{ garment: garmentOptions[0], color: "", size: sizeOptions[0], quantity: "1" }]);
        setPrintMethod(NOT_SURE_METHOD);
        setShowArtworkSection(false);
        setArtworkItems([createArtworkItem(1)]);
        setNextArtworkId(2);
        setWebsite("");
        setEmailError(null);
      } else {
        setResult({ ok: false, msg: body?.error || "Something went wrong." });
      }
    } catch {
      setResult({ ok: false, msg: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="quote-website">Website</label>
          <input
            id="quote-website"
            name="website"
            tabIndex={-1}
            autoComplete="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="Your Name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Email *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={handleEmailChange}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                emailError ? "border-red-400 focus:border-red-500" : "border-neutral-200 focus:border-black"
              }`}
              placeholder="you@example.com"
            />
            {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Phone / WhatsApp</label>
            <input
              value={form.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                phoneError ? "border-red-400 focus:border-red-500" : "border-neutral-200 focus:border-black"
              }`}
              placeholder="e.g.,+230 5988 3880"
            />
            {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Deadline (optional)</label>
            <input
              value={form.deadline}
              onChange={(e) => update("deadline", e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
              placeholder="e.g., Next Friday, Dec 20"
            />
          </div>
        </div>

        <div className="space-y-3">
          {!loadingColors && !availableColors.length ? (
            <p className="text-xs text-amber-700">No live colours available right now. Add the preferred colour in notes if needed.</p>
          ) : null}
          {garmentLines.map((line, index) => {
            const colorOptions = getGarmentColorOptions(line.garment);
            const colorPlaceholder =
              loadingColors && colorOptions.length === 0
                ? "Loading colors..."
                : colorOptions.length
                  ? "Select color"
                  : "No colors available";

            return (
              <div
                key={`${index}-${line.garment}`}
                className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,0.72fr)_minmax(0,0.9fr)]"
              >
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Garment</label>
                  <select
                    value={line.garment}
                    onChange={(e) => {
                      const nextGarment = e.target.value;
                      const nextColorOptions = getGarmentColorOptions(nextGarment);
                      updateGarmentLine(index, {
                        garment: nextGarment,
                        color: nextColorOptions.includes(line.color) ? line.color : "",
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                  >
                    {garmentOptions.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Color</label>
                  <ColorSelect
                    value={line.color}
                    options={colorOptions}
                    placeholder={colorPlaceholder}
                    disabled={loadingColors && colorOptions.length === 0}
                    onChange={(value) => updateGarmentLine(index, { color: value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Size</label>
                  <select
                    value={line.size}
                    onChange={(e) => updateGarmentLine(index, { size: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                  >
                    {sizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Quantity *</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      required
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateGarmentLine(index, { quantity: e.target.value })}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                      placeholder="50"
                    />
                    {garmentLines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeGarmentLine(index)}
                        className="inline-flex aspect-square h-[34px] w-[34px] items-center justify-center rounded-full border border-red-300 bg-gradient-to-br from-red-500 to-rose-500 text-base font-semibold text-white shadow-[0_10px_20px_-14px_rgba(239,68,68,0.95)] transition hover:from-red-600 hover:to-rose-600"
                        aria-label="Remove garment"
                        title="Remove garment"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {garmentLines.length > 1 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="md:col-start-4">
                <label className="block text-sm font-medium text-neutral-700">Total quantity</label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    readOnly
                    value={`${totalQuantity || 0} pcs`}
                    className="w-full cursor-default rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-700 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06),0_14px_28px_-24px_rgba(15,23,42,0.35)] focus:outline-none"
                  />
                  <span aria-hidden="true" className="h-[34px] w-[34px] flex-shrink-0 invisible" />
                </div>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={addGarmentLine}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_-16px_rgba(249,115,22,0.75)] transition hover:from-orange-600 hover:via-amber-500 hover:to-orange-700"
          >
            + Add more garment
          </button>
        </div>

        <div className={`grid grid-cols-1 gap-4 ${selectedPrintMethodInfo ? "sm:grid-cols-2" : ""}`}>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Print method</label>
            <select
              value={printMethod}
              onChange={(e) => setPrintMethod(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
            >
              {printMethods.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
          {selectedPrintMethodInfo ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              <p className="font-semibold text-neutral-900">{selectedPrintMethodInfo.title}</p>
              {selectedPrintMethodInfo.description ? (
                <p className="mt-2">{selectedPrintMethodInfo.description}</p>
              ) : null}
              {selectedPrintMethodInfo.items?.length ? (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-700">
                  {selectedPrintMethodInfo.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              ) : null}
              {selectedPrintMethodInfo.note ? (
                <p className="mt-2 text-xs text-neutral-500">{selectedPrintMethodInfo.note}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {showScreenPrintingWarning && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Screen printing selected</p>
            <p className="mt-1">
              Total quantity in this quote: <span className="font-semibold">{totalQuantity || 0} pcs</span>.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              For multiple logos, each uploaded design should normally cover at least 10 pcs.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="sr-only" aria-hidden="true">
            {artworkItems.flatMap((item) =>
              (["front", "back"] as ArtworkSlot[]).map((slot) => (
                <input
                  key={getArtworkInputKey(item.id, slot)}
                  ref={(node) => setArtworkInputRef(getArtworkInputKey(item.id, slot), node)}
                  id={`quote-artwork-file-${item.id}-${slot}`}
                  type="file"
                  accept={artworkAccept}
                  onClick={(event) => {
                    event.currentTarget.value = "";
                  }}
                  onChange={(e) =>
                    handleFileChange(
                      artworkItems.findIndex((entry) => entry.id === item.id),
                      slot,
                      e
                    )
                  }
                  className="sr-only"
                />
              ))
            )}
          </div>

          {!showArtworkSection ? (
            <button
              type="button"
              onClick={() => openArtworkPicker(artworkItems[0]?.id ?? 1, "front")}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-800 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)] transition hover:border-neutral-900 hover:bg-neutral-50"
            >
              <UploadCloud className="h-4 w-4" />
              Upload logo
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Upload your logo / artwork</label>
                  <p className="mt-1 text-xs text-neutral-500">
                    Add one item per product, size, logo, or print side.
                  </p>
                </div>
                <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-500">
                  {uploadedArtworkCount
                    ? `${uploadedArtworkCount} file${uploadedArtworkCount === 1 ? "" : "s"} added`
                    : "No file chosen yet"}
                </div>
              </div>

              {artworkItems.map((item, index) => {
                const logoSlots = getArtworkSlots(item.printPlacement);
                return (
                <div key={item.id} className="rounded-[24px] border border-neutral-200 bg-neutral-50/80 p-4 shadow-[0_20px_45px_-40px_rgba(15,23,42,0.55)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-neutral-900">Item {index + 1}</p>
                      <p className="mt-1 text-xs text-neutral-500">Choose the print side, then upload the required logo.</p>
                    </div>
                    {artworkItems.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeArtworkItem(index)}
                        className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Product</label>
                      <input
                        value={item.product}
                        onChange={(e) => updateArtworkItem(index, { product: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                        placeholder="T-shirt / polo / hoodie"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Colour</label>
                      <input
                        value={item.color}
                        onChange={(e) => updateArtworkItem(index, { color: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                        placeholder="Navy blue"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Size</label>
                      <input
                        value={item.size}
                        onChange={(e) => updateArtworkItem(index, { size: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                        placeholder="S / M / 2XL"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Qty</label>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateArtworkItem(index, { quantity: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                        placeholder="2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Print side</label>
                      <select
                        value={item.printPlacement}
                        onChange={(e) =>
                          updateArtworkItem(index, {
                            printPlacement: e.target.value as ArtworkItem["printPlacement"],
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                      >
                        <option value="front">Front only</option>
                        <option value="back">Back only</option>
                        <option value="front_back">Front and back</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {logoSlots.map((slot) => {
                      const file = getArtworkSlotFile(item, slot);
                      const slotLabel = getArtworkSlotLabel(slot);
                      return (
                        <div key={slot} className="rounded-2xl border border-neutral-200 bg-white p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-neutral-900">{slotLabel}</p>
                              <p className="mt-1 text-xs text-neutral-500">
                                {item.printPlacement === "front_back"
                                  ? "Required for front and back printing."
                                  : "Required for selected print side."}
                              </p>
                            </div>
                            {file ? (
                              <button
                                type="button"
                                onClick={() => updateArtworkItem(index, slot === "front" ? { frontFile: null } : { backFile: null })}
                                className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>

                          {file ? (
                            <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                              <div className="grid gap-3 p-3 sm:grid-cols-[104px_minmax(0,1fr)] sm:items-center">
                                <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
                                  {isPreviewableArtworkFile(file) ? (
                                    <ArtworkFilePreview file={file} />
                                  ) : (
                                    <FileText className="h-7 w-7 text-neutral-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-neutral-900">{file.name}</p>
                                  <p className="mt-1 text-xs text-neutral-500">
                                    {file.size ? `${formatBytes(file.size)} file ready.` : "File ready."}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => openArtworkPicker(item.id, slot)}
                                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-black hover:text-black"
                                  >
                                    <UploadCloud className="h-4 w-4" />
                                    Change
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openArtworkPicker(item.id, slot)}
                              className="mt-3 flex min-h-32 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-5 text-center transition hover:border-emerald-500 hover:bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                            >
                              <UploadCloud className="h-5 w-5 text-emerald-600" />
                              <span className="mt-2 text-sm font-semibold text-neutral-900">
                                Choose {slotLabel.toLowerCase()}
                              </span>
                              <span className="mt-1 max-w-56 text-xs text-neutral-500">
                                PNG, JPG, WEBP, SVG, HEIC, or PDF. Max 5MB.
                              </span>
                            </button>
                          )}

                          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.06em] text-neutral-600">
                            Description below {slotLabel.toLowerCase()}
                            <textarea
                              value={slot === "front" ? item.frontLogoDescription : item.backLogoDescription}
                              onChange={(e) =>
                                updateArtworkItem(
                                  index,
                                  slot === "front"
                                    ? { frontLogoDescription: e.target.value }
                                    : { backLogoDescription: e.target.value }
                                )
                              }
                              rows={2}
                              className="mt-2 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm normal-case tracking-normal focus:border-black focus:outline-none"
                              placeholder={
                                slot === "front"
                                  ? "Example: print small on left chest."
                                  : "Example: print large centered on back."
                              }
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}

              <button
                type="button"
                onClick={addArtworkItem}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:border-black hover:text-black"
              >
                + Add another item / logo
              </button>
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            className="mt-1 h-[86px] w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
            placeholder="Describe the print: front chest 1-color, back 2-color, sleeve logo, sizes, deadlines…"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Delivery</label>
          <select
            value={form.delivery}
            onChange={(e) => update("delivery", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
          >
            {deliveryOptions.map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {form.delivery !== "Surinam Pickup (Free)" && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-800">Delivery Info</p>
            <div className="mt-3 grid gap-3">
              <input
                value={form.deliveryName}
                onChange={(e) => update("deliveryName", e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                placeholder="Your Full Name"
              />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                <div>
                  <input
                    value={form.deliveryAddress}
                    onChange={(e) => update("deliveryAddress", e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
                    placeholder="Your Delivery Address"
                  />
                </div>
                <div>
                  <input
                    value={form.deliveryPostCode}
                    onChange={(e) => handleDeliveryPostCodeChange(e.target.value)}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none ${
                      deliveryPostCodeError ? "border-red-400 focus:border-red-500" : "border-neutral-200 focus:border-black"
                    }`}
                    placeholder="Post Code (optional)"
                  />
                  {deliveryPostCodeError && <p className="mt-1 text-xs text-red-600">{deliveryPostCodeError}</p>}
                </div>
              </div>
              <input
                value={form.deliveryPhone}
                onChange={(e) => handleDeliveryPhoneChange(e.target.value)}
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none ${
                  deliveryPhoneError ? "border-red-400 focus:border-red-500" : "border-neutral-200 focus:border-black"
                }`}
                placeholder="Your Phone Number"
              />
              {deliveryPhoneError && <p className="text-xs text-red-600">{deliveryPhoneError}</p>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || Boolean(emailError)}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_20px_38px_-18px_rgba(249,115,22,0.9)] transition hover:-translate-y-0.5 hover:from-orange-600 hover:via-amber-500 hover:to-orange-700 disabled:translate-y-0 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Get my quote"}
          </button>
          <TrackedWhatsAppLink
            href={getWhatsAppUrl("Hi! Can you quote me for custom shirts?")}
            trackingLocation="quote_form"
            trackingSource={source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-black transition hover:border-black"
          >
            Or WhatsApp {CONTACT_PHONE_DISPLAY}
          </TrackedWhatsAppLink>
        </div>

        {result && (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}
          >
            {result.msg}
          </div>
        )}
      </form>

      <p className="mt-4 text-xs text-neutral-500">
        By submitting, you agree we may reach you at {CONTACT_TEL} / email to confirm details and pricing.
      </p>
    </div>
  );
}
