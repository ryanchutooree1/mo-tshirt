"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_COLLECTION_POINT,
  DEFAULT_PICKUP_POINT,
  ONE_SIZE_LABEL,
  SHOP_IMAGE_VIEWS,
  formatSizeLabel,
  getShopDesignProductId,
  getShopImageViews,
  getSizePrices,
  isOneSizeLabel,
  normalizeList,
  SIZE_ORDER,
  sortQuoteColors,
  type ShopImageViewKey,
  type ShopItem,
} from "@/lib/shops";
import { formatMoney as formatDisplayMoney } from "@/lib/money";
import {
  downloadShopImage,
  getStudioImageField,
  prepareStudioImageFile,
  type StudioImageViewKey,
} from "@/lib/shop-studio-images";
import {
  FiActivity,
  FiBarChart2,
  FiBox,
  FiFilter,
  FiGrid,
  FiImage,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSliders,
  FiTag,
  FiTrendingUp,
  FiX,
  FiZap,
} from "react-icons/fi";

type SizePriceRow = {
  size: string;
  price: number | "";
  buyingPrice: number | "";
  profit: number | "";
  profitAuto: boolean;
};

type PriceMode = "sized" | "single";

const SIZE_ORDER_SET = new Set<string>(SIZE_ORDER);

function buildSizeRows(
  existing: { size: string; price: number; buyingPrice?: number | null; profit?: number | null }[] = []
): SizePriceRow[] {
  const rowMap = new Map<string, { price: number; buyingPrice: number | ""; profit: number | ""; profitAuto: boolean }>();
  existing.forEach((entry) => {
    rowMap.set(entry.size, {
      price: entry.price,
      buyingPrice:
        Number.isFinite(entry.buyingPrice) ? (entry.buyingPrice as number) : "",
      profit: Number.isFinite(entry.profit) ? (entry.profit as number) : "",
      profitAuto: !Number.isFinite(entry.profit),
    });
  });
  const ordered: SizePriceRow[] = SIZE_ORDER.map((size) => ({
    size,
    price: rowMap.get(size)?.price ?? "",
    buyingPrice: rowMap.get(size)?.buyingPrice ?? "",
    profit: rowMap.get(size)?.profit ?? "",
    profitAuto: rowMap.get(size)?.profitAuto ?? true,
  }));
  const extras: SizePriceRow[] = existing
    .filter((entry) => !SIZE_ORDER_SET.has(entry.size))
    .map((entry) => ({
      size: entry.size,
      price: entry.price,
      buyingPrice:
        Number.isFinite(entry.buyingPrice) ? (entry.buyingPrice as number) : "",
      profit: Number.isFinite(entry.profit) ? (entry.profit as number) : "",
      profitAuto: !Number.isFinite(entry.profit),
    }));
  const merged = [...ordered, ...extras];
  return merged.map((row) => {
    if (row.profitAuto && row.price !== "" && row.buyingPrice !== "") {
      return { ...row, profit: Number(row.price) - Number(row.buyingPrice) };
    }
    return row;
  });
}

function buildSinglePriceRow(
  existing: { size: string; price: number; buyingPrice?: number | null; profit?: number | null }[] = []
): SizePriceRow {
  const fallback =
    existing.find((entry) => isOneSizeLabel(entry.size)) ||
    (existing.length === 1 ? existing[0] : null);

  const row: SizePriceRow = {
    size: ONE_SIZE_LABEL,
    price: fallback?.price ?? "",
    buyingPrice:
      fallback && Number.isFinite(fallback.buyingPrice) ? (fallback.buyingPrice as number) : "",
    profit: fallback && Number.isFinite(fallback.profit) ? (fallback.profit as number) : "",
    profitAuto: !fallback || !Number.isFinite(fallback.profit),
  };

  if (row.profitAuto && row.price !== "" && row.buyingPrice !== "") {
    row.profit = Number(row.price) - Number(row.buyingPrice);
  }

  return row;
}

function getFirstPricedRow(rows: SizePriceRow[]): SizePriceRow | null {
  return (
    rows.find((row) => row.price !== "" && Number.isFinite(row.price)) ||
    rows.find((row) => row.buyingPrice !== "" && Number.isFinite(row.buyingPrice)) ||
    null
  );
}

type FormState = {
  title: string;
  colors: string;
  pricingMode: PriceMode;
  singlePrice: SizePriceRow;
  sizePrices: SizePriceRow[];
  pickupPoint: string;
  collectionPoint: string;
  photoUrl: string;
  backPhotoUrl: string;
  sidePhotoUrl: string;
  studioPhotoUrl: string;
  studioBackPhotoUrl: string;
  isActive: boolean;
  inStock: boolean;
};

type ImageFileState = Record<ShopImageViewKey, File | null>;

function buildEmptyFormState(): FormState {
  return {
    title: "",
    colors: "",
    pricingMode: "sized",
    singlePrice: buildSinglePriceRow(),
    sizePrices: buildSizeRows(),
    pickupPoint: DEFAULT_PICKUP_POINT,
    collectionPoint: DEFAULT_COLLECTION_POINT,
    photoUrl: "",
    backPhotoUrl: "",
    sidePhotoUrl: "",
    studioPhotoUrl: "",
    studioBackPhotoUrl: "",
    isActive: true,
    inStock: true,
  };
}

function buildEmptyImageFiles(): ImageFileState {
  return {
    front: null,
    back: null,
    side: null,
  };
}

const money = (value: number) => formatDisplayMoney(value);
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const IMAGE_RETRY_LIMIT = 2;
const IMAGE_RETRY_DELAY_MS = 900;

function getCatalogThumbnailUrl(src: string) {
  if (!src.startsWith("/api/shops/uploads/")) return src;
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}variant=thumbnail`;
}

function AsyncCatalogImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallback,
}: {
  src: string;
  alt: string;
  className: string;
  fallbackClassName?: string;
  fallback?: React.ReactNode;
}) {
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

  function handleError() {
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
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[2px]">
          <span
            className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500"
            aria-hidden="true"
          />
        </div>
      )}
      {status === "error" && (
        <div
          className={`absolute inset-0 flex items-center justify-center text-center text-[11px] text-slate-400 ${
            fallbackClassName || ""
          }`}
        >
          {fallback || "Image unavailable"}
        </div>
      )}
      { }
      <img
        key={`${src}-${retryNonce}`}
        src={src}
        alt={alt}
        className={`absolute inset-0 block ${className} transition-opacity duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        loading="lazy"
        decoding="async"
        onLoad={() => {
          clearRetryTimer();
          setStatus("loaded");
        }}
        onError={handleError}
      />
    </>
  );
}

export default function AdminShopsPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => buildEmptyFormState());

  const [search, setSearch] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  const [catalogImageSelections, setCatalogImageSelections] = useState<Record<string, ShopImageViewKey>>({});
  const [catalogThumbnailOverrides, setCatalogThumbnailOverrides] = useState<Record<string, string>>({});

  const [imageFiles, setImageFiles] = useState<ImageFileState>(() => buildEmptyImageFiles());
  const [previewUrls, setPreviewUrls] = useState<Record<ShopImageViewKey, string>>({
    front: "",
    back: "",
    side: "",
  });
  const [selectedImageView, setSelectedImageView] = useState<ShopImageViewKey>("front");
  const [uploading, setUploading] = useState(false);
  const [preparingStudio, setPreparingStudio] = useState(false);
  const [preparingStudioItemId, setPreparingStudioItemId] = useState<string | null>(null);
  const [studioProgress, setStudioProgress] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const nextUrls = {
      front: imageFiles.front ? URL.createObjectURL(imageFiles.front) : "",
      back: imageFiles.back ? URL.createObjectURL(imageFiles.back) : "",
      side: imageFiles.side ? URL.createObjectURL(imageFiles.side) : "",
    };
    setPreviewUrls(nextUrls);

    return () => {
      Object.values(nextUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [imageFiles]);

  useEffect(() => {
    if (!isComposerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsComposerOpen(false);
        setEditingId(null);
        setForm(buildEmptyFormState());
        setImageFiles(buildEmptyImageFiles());
        setSelectedImageView("front");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isComposerOpen]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shops");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load shops.");
      const list: ShopItem[] = Array.isArray(data?.items) ? data.items : [];
      list.sort((a, b) => (b.position || 0) - (a.position || 0));
      setItems(list);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load shops.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === editingId) || null,
    [items, editingId]
  );

  const needsNormalization = useMemo(
    () =>
      items.some(
        (item) =>
          item.sizePrices?.some((entry) => /\s+Old$/i.test(entry.size)) ||
          item.sizes?.some((size) => /\s+Old$/i.test(size))
      ),
    [items]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((item) => item.isActive).length;
    const inStock = items.filter((item) => item.inStock).length;
    const hidden = total - active;
    const out = items.filter((item) => !item.inStock).length;
    const attention = items.filter((item) => !item.inStock || !item.isActive).length;
    return { total, active, inStock, hidden, out, attention };
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (term) {
        const blob = `${item.title} ${item.colors?.join(", ") || ""}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      if (showActiveOnly && !item.isActive) return false;
      if (showInStockOnly && !item.inStock) return false;
      return true;
    });
  }, [items, search, showActiveOnly, showInStockOnly]);

  const studioItemsNeedingPreparation = useMemo(
    () =>
      items.filter((item) => {
        if (!getShopDesignProductId(item.title)) return false;
        return Boolean(
          (item.photoUrl && !item.studioPhotoUrl) ||
          (item.backPhotoUrl && !item.studioBackPhotoUrl)
        );
      }),
    [items]
  );

  const sortedFormColors = useMemo(
    () => sortQuoteColors(normalizeList(form.colors)),
    [form.colors]
  );

  const composerPricePreview = useMemo(() => {
    if (form.pricingMode === "single") {
      return form.singlePrice.price !== "" && Number.isFinite(form.singlePrice.price)
        ? Number(form.singlePrice.price)
        : null;
    }

    const values = form.sizePrices
      .map((row) => row.price)
      .filter((price) => price !== "" && Number.isFinite(price)) as number[];
    return values.length ? Math.min(...values) : null;
  }, [form.pricingMode, form.singlePrice.price, form.sizePrices]);

  const composerPricedRows = useMemo(() => {
    if (form.pricingMode === "single") {
      return form.singlePrice.price !== "" && Number.isFinite(form.singlePrice.price) ? 1 : 0;
    }

    return form.sizePrices.filter((row) => row.price !== "" && Number.isFinite(row.price)).length;
  }, [form.pricingMode, form.singlePrice.price, form.sizePrices]);

  function closeComposer() {
    setIsComposerOpen(false);
    setEditingId(null);
    setForm(buildEmptyFormState());
    setImageFiles(buildEmptyImageFiles());
    setSelectedImageView("front");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function openNewComposer() {
    setEditingId(null);
    setForm(buildEmptyFormState());
    setImageFiles(buildEmptyImageFiles());
    setSelectedImageView("front");
    if (photoInputRef.current) photoInputRef.current.value = "";
    setError(null);
    setNotice(null);
    setIsComposerOpen(true);
  }

  function startEdit(item: ShopItem) {
    const sizePrices = getSizePrices(item);
    const singlePriceMode =
      sizePrices.length === 1 && isOneSizeLabel(sizePrices[0]?.size || "");
    setEditingId(item.id);
    setForm({
      title: item.title,
      colors: item.colors.join(", "),
      pricingMode: singlePriceMode ? "single" : "sized",
      singlePrice: buildSinglePriceRow(sizePrices),
      sizePrices:
        !singlePriceMode && sizePrices.length
          ? buildSizeRows(sizePrices)
          : buildSizeRows(),
      pickupPoint: item.pickupPoint || DEFAULT_PICKUP_POINT,
      collectionPoint: item.collectionPoint || DEFAULT_COLLECTION_POINT,
      photoUrl: item.photoUrl || "",
      backPhotoUrl: item.backPhotoUrl || "",
      sidePhotoUrl: item.sidePhotoUrl || "",
      studioPhotoUrl: item.studioPhotoUrl || "",
      studioBackPhotoUrl: item.studioBackPhotoUrl || "",
      isActive: item.isActive,
      inStock: item.inStock,
    });
    setImageFiles(buildEmptyImageFiles());
    setSelectedImageView("front");
    if (photoInputRef.current) photoInputRef.current.value = "";
    setError(null);
    setNotice(null);
    setIsComposerOpen(true);
  }

  function computeProfitValue(price: number | "", buyingPrice: number | "") {
    if (price === "" || buyingPrice === "") return "";
    if (!Number.isFinite(price) || !Number.isFinite(buyingPrice)) return "";
    return Number(price) - Number(buyingPrice);
  }

  function updateSizeRow(index: number, patch: Partial<SizePriceRow>) {
    setForm((prev) => {
      const next = prev.sizePrices.slice();
      const current = next[index];
      const merged = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "profit")) {
        merged.profitAuto = patch.profit === "";
      }
      if (merged.profitAuto) {
        merged.profit = computeProfitValue(merged.price, merged.buyingPrice);
      }
      next[index] = merged;
      return { ...prev, sizePrices: next };
    });
  }

  function updateSinglePrice(patch: Partial<SizePriceRow>) {
    setForm((prev) => {
      const merged = { ...prev.singlePrice, ...patch, size: ONE_SIZE_LABEL };
      if (Object.prototype.hasOwnProperty.call(patch, "profit")) {
        merged.profitAuto = patch.profit === "";
      }
      if (merged.profitAuto) {
        merged.profit = computeProfitValue(merged.price, merged.buyingPrice);
      }
      return { ...prev, singlePrice: merged };
    });
  }

  function setPricingMode(mode: PriceMode) {
    setForm((prev) => {
      if (prev.pricingMode === mode) return prev;
      if (mode === "single") {
        const fallback = getFirstPricedRow(prev.sizePrices);
        return {
          ...prev,
          pricingMode: mode,
          singlePrice:
            prev.singlePrice.price !== "" || prev.singlePrice.buyingPrice !== ""
              ? prev.singlePrice
              : fallback
                ? {
                    ...prev.singlePrice,
                    price: fallback.price,
                    buyingPrice: fallback.buyingPrice,
                    profit:
                      fallback.profitAuto
                        ? computeProfitValue(fallback.price, fallback.buyingPrice)
                        : fallback.profit,
                    profitAuto: fallback.profitAuto,
                  }
                : prev.singlePrice,
        };
      }

      return { ...prev, pricingMode: mode };
    });
  }

  function addSizeRow() {
    setForm((prev) => ({
      ...prev,
      sizePrices: [
        ...prev.sizePrices,
        { size: "", price: "", buyingPrice: "", profit: "", profitAuto: true },
      ],
    }));
  }

  function removeSizeRow(index: number) {
    setForm((prev) => {
      const next = prev.sizePrices.filter((_, i) => i !== index);
      return {
        ...prev,
        sizePrices: next.length
          ? next
          : [{ size: "", price: "", buyingPrice: "", profit: "", profitAuto: true }],
      };
    });
  }

  function getFormImageUrl(view: ShopImageViewKey) {
    const config = SHOP_IMAGE_VIEWS.find((entry) => entry.key === view);
    return config ? form[config.field] : "";
  }

  function getPreviewImageUrl(view: ShopImageViewKey) {
    return previewUrls[view] || getFormImageUrl(view);
  }

  function getFormStudioImageUrl(view: ShopImageViewKey) {
    if (view === "front") return form.studioPhotoUrl;
    if (view === "back") return form.studioBackPhotoUrl;
    return "";
  }

  function updateFormImageUrl(view: ShopImageViewKey, url: string) {
    const config = SHOP_IMAGE_VIEWS.find((entry) => entry.key === view);
    if (!config) return;
    setForm((prev) => {
      const next = { ...prev, [config.field]: url };
      if (view === "front" && prev.photoUrl !== url) next.studioPhotoUrl = "";
      if (view === "back" && prev.backPhotoUrl !== url) next.studioBackPhotoUrl = "";
      return next;
    });
  }

  function getFormImageViews() {
    return SHOP_IMAGE_VIEWS.map((view) => ({
      key: view.key,
      label: view.label,
      url: getPreviewImageUrl(view.key),
    })).filter((view) => Boolean(view.url));
  }

  async function uploadPhoto() {
    const file = imageFiles[selectedImageView];
    if (!file) {
      setNotice("Choose a file first.");
      return;
    }
    setNotice(null);
    setError(null);
    setUploading(true);
    try {
      const result = await uploadFileAndGetUrl(selectedImageView);
      if (result.url) {
        const viewLabel = SHOP_IMAGE_VIEWS.find((view) => view.key === selectedImageView)?.label || "Photo";
        setNotice(`${viewLabel} photo uploaded. Save the item, then convert it to transparent when ready.`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed. Use an image URL instead.");
    } finally {
      setUploading(false);
      setStudioProgress(null);
    }
  }

  async function uploadImageFile(file: File) {
    try {
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/api/admin/shops/upload", {
        method: "POST",
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string; thumbnailDataUrl?: string | null };
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Photo upload failed. Paste an image URL instead.");
      }

      const uploadedUrl = data.url;
      const thumbnailDataUrl = data.thumbnailDataUrl;
      if (thumbnailDataUrl) {
        setCatalogThumbnailOverrides((current) => ({ ...current, [uploadedUrl]: thumbnailDataUrl }));
      }
      void fetch(getCatalogThumbnailUrl(uploadedUrl), { cache: "force-cache" }).catch(() => undefined);

      return uploadedUrl;
    } catch (err) {
      console.error("upload error", err);
      if (err instanceof Error) throw err;
      throw new Error("Photo upload failed. Paste an image URL instead.");
    }
  }

  async function uploadFileAndGetUrl(view: ShopImageViewKey) {
    const file = imageFiles[view];
    if (!file) {
      return {
        url: getFormImageUrl(view),
        studioUrl:
          view === "front"
            ? form.studioPhotoUrl
            : view === "back"
              ? form.studioBackPhotoUrl
              : "",
      };
    }

    const url = await uploadImageFile(file);
    updateFormImageUrl(view, url);
    const studioUrl = "";

    setImageFiles((prev) => ({ ...prev, [view]: null }));
    if (photoInputRef.current) photoInputRef.current.value = "";
    return { url, studioUrl };
  }

  async function uploadPendingImageFiles() {
    const uploaded = {
      front: form.photoUrl,
      back: form.backPhotoUrl,
      side: form.sidePhotoUrl,
      studioFront: form.studioPhotoUrl,
      studioBack: form.studioBackPhotoUrl,
    };
    for (const view of SHOP_IMAGE_VIEWS) {
      if (!imageFiles[view.key]) continue;
      const result = await uploadFileAndGetUrl(view.key);
      uploaded[view.key] = result.url;
      if (view.key === "front") uploaded.studioFront = result.studioUrl;
      if (view.key === "back") uploaded.studioBack = result.studioUrl;
    }

    return uploaded;
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    setError(null);

    try {
      const wasEditing = Boolean(editingId);
      const imageUrls = await uploadPendingImageFiles();
      const sizePrices =
        form.pricingMode === "single"
          ? (() => {
              if (form.singlePrice.price === "" || !Number.isFinite(form.singlePrice.price)) {
                throw new Error("Add a single price for one-size items.");
              }
              const buyingPrice =
                form.singlePrice.buyingPrice === "" || !Number.isFinite(form.singlePrice.buyingPrice)
                  ? null
                  : Number(form.singlePrice.buyingPrice);
              const profit =
                form.singlePrice.profit === "" || !Number.isFinite(form.singlePrice.profit)
                  ? form.singlePrice.profitAuto && buyingPrice !== null
                    ? Number(form.singlePrice.price) - Number(buyingPrice)
                    : null
                  : Number(form.singlePrice.profit);
              return [
                {
                  size: ONE_SIZE_LABEL,
                  price: Number(form.singlePrice.price),
                  buyingPrice,
                  profit,
                },
              ];
            })()
          : form.sizePrices
              .filter((row) => row.size && row.price !== "" && Number.isFinite(row.price))
              .map((row) => {
                const buyingPrice =
                  row.buyingPrice === "" || !Number.isFinite(row.buyingPrice)
                    ? null
                    : Number(row.buyingPrice);
                const profit =
                  row.profit === "" || !Number.isFinite(row.profit)
                    ? row.profitAuto && buyingPrice !== null && row.price !== ""
                      ? Number(row.price) - Number(buyingPrice)
                      : null
                    : Number(row.profit);
                return {
                  size: row.size,
                  price: Number(row.price),
                  buyingPrice,
                  profit,
                };
              });

      if (!sizePrices.length) {
        throw new Error("Add at least one size with a price.");
      }

      const payload = {
        title: form.title,
        colors: form.colors,
        sizeMode: form.pricingMode,
        singlePrice: form.pricingMode === "single" ? form.singlePrice.price : null,
        sizePrices,
        pickupPoint: form.pickupPoint,
        collectionPoint: form.collectionPoint,
        photoUrl: imageUrls.front,
        backPhotoUrl: imageUrls.back,
        sidePhotoUrl: imageUrls.side,
        studioPhotoUrl: imageUrls.studioFront,
        studioBackPhotoUrl: imageUrls.studioBack,
        isActive: form.isActive,
        inStock: form.inStock,
      };

      const res = await fetch(editingId ? `/api/admin/shops/${editingId}` : "/api/admin/shops", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save item.");
      await refresh();
      closeComposer();
      setNotice(`${wasEditing ? "Item updated" : "Item created"}. Convert its Design Studio photos to transparent when ready.`);
    } catch (err: any) {
      setError(err?.message || "Failed to save item.");
    } finally {
      setSaving(false);
      setStudioProgress(null);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item?")) return;
    try {
      const res = await fetch(`/api/admin/shops/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to delete item.");
      await refresh();
      if (editingId === id) closeComposer();
    } catch (err: any) {
      setError(err?.message || "Failed to delete item.");
    }
  }

  async function prepareStudioProduct(item: ShopItem, force = false) {
    const views: Array<{
      view: StudioImageViewKey;
      sourceUrl: string | null | undefined;
      studioUrl: string | null | undefined;
    }> = [
      { view: "front", sourceUrl: item.photoUrl, studioUrl: item.studioPhotoUrl },
      { view: "back", sourceUrl: item.backPhotoUrl, studioUrl: item.studioBackPhotoUrl },
    ];
    const patch: Record<string, string> = {};

    for (const { view, sourceUrl, studioUrl } of views) {
      if (!sourceUrl || (!force && studioUrl)) continue;
      setStudioProgress(`Downloading ${item.title} ${view} photo`);
      const sourceFile = await downloadShopImage(sourceUrl, item.title, view);
      setStudioProgress(`Removing ${item.title} ${view} background`);
      const studioFile = await prepareStudioImageFile(sourceFile, view, (label) => {
        setStudioProgress(`${item.title} ${view}: ${label}`);
      });
      setStudioProgress(`Saving ${item.title} transparent ${view} image`);
      patch[getStudioImageField(view)] = await uploadImageFile(studioFile);
    }

    if (!Object.keys(patch).length) return 0;
    const response = await fetch(`/api/admin/shops/${item.id}/studio-images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `Could not save studio images for ${item.title}.`);
    return Object.keys(patch).length;
  }

  async function prepareOneStudioProduct(item: ShopItem) {
    if (preparingStudio || !getShopDesignProductId(item.title)) return;
    setPreparingStudio(true);
    setPreparingStudioItemId(item.id);
    setNotice(null);
    setError(null);
    try {
      const count = await prepareStudioProduct(item, true);
      await refresh();
      setNotice(
        count
          ? `${item.title} now has ${count} refreshed transparent studio image${count === 1 ? "" : "s"}.`
          : `${item.title} has no front or back photo to prepare.`
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : `Could not prepare ${item.title}.`);
    } finally {
      setPreparingStudio(false);
      setPreparingStudioItemId(null);
      setStudioProgress(null);
    }
  }

  async function prepareAllStudioProducts() {
    if (preparingStudio || !studioItemsNeedingPreparation.length) return;
    setPreparingStudio(true);
    setPreparingStudioItemId("all");
    setNotice(null);
    setError(null);
    let converted = 0;
    const failures: string[] = [];

    for (const item of studioItemsNeedingPreparation) {
      try {
        converted += await prepareStudioProduct(item);
      } catch (error) {
        console.error("studio batch preparation error", error);
        failures.push(item.title);
      }
    }

    await refresh();
    if (failures.length) {
      setError(`Prepared ${converted} studio image${converted === 1 ? "" : "s"}, but ${failures.join(", ")} could not be converted.`);
    } else {
      setNotice(`Prepared ${converted} transparent image${converted === 1 ? "" : "s"} for Design Studio.`);
    }
    setPreparingStudio(false);
    setPreparingStudioItemId(null);
    setStudioProgress(null);
  }

  async function normalizeSizes() {
    if (normalizing) return;
    setNormalizing(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/shops/normalize-sizes", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to normalize sizes.");
      await refresh();
      setNotice(
        Number.isFinite(data?.updated)
          ? `Normalized ${data.updated} item${data.updated === 1 ? "" : "s"}.`
          : "Size labels normalized."
      );
    } catch (err: any) {
      setError(err?.message || "Failed to normalize sizes.");
    } finally {
      setNormalizing(false);
    }
  }

  async function moveItem(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const current = items[index];
    const target = items[targetIndex];
    if (!current || !target) return;

    const currentPos = Number.isFinite(current.position) ? (current.position as number) : index;
    const targetPos = Number.isFinite(target.position) ? (target.position as number) : targetIndex;
    try {
      const res = await fetch("/api/admin/shops/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { id: current.id, position: targetPos },
            { id: target.id, position: currentPos },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to reorder item.");
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to reorder item.");
    }
  }

  const togglePill = (active: boolean, activeClass: string) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
      active
        ? activeClass
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
    }`;

  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-12rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.35),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-48 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.25),transparent_70%)] blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_60%)]"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">Catalog</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Shops catalog</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Curate your best-selling blanks with clean price ladders, instant uploads, and sharp reorder control.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  <FiGrid className="h-4 w-4" /> Premium catalog
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <FiLayers className="h-4 w-4" /> Price matrix
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  <FiTrendingUp className="h-4 w-4" /> Profit visibility
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {studioItemsNeedingPreparation.length > 0 && (
                <button
                  onClick={prepareAllStudioProducts}
                  disabled={preparingStudio}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
                >
                  <FiZap className="h-4 w-4" />
                  {preparingStudioItemId === "all"
                    ? "Preparing studio images..."
                    : `Prepare ${studioItemsNeedingPreparation.length} studio product${studioItemsNeedingPreparation.length === 1 ? "" : "s"}`}
                </button>
              )}
              {needsNormalization && (
                <button
                  onClick={normalizeSizes}
                  disabled={normalizing}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiSliders className="h-4 w-4" />
                  {normalizing ? "Normalizing..." : "Normalize sizes"}
                </button>
              )}
              <button
                onClick={refresh}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FiRefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={openNewComposer}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiPlus className="h-4 w-4" /> Add item
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section
          className="grid grid-cols-2 gap-4 md:grid-cols-5"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.08s" }}
        >
          <StatCard label="Total items" value={stats.total} tone="sky" icon={<FiGrid className="h-4 w-4" />} />
          <StatCard label="Active" value={stats.active} tone="emerald" icon={<FiActivity className="h-4 w-4" />} />
          <StatCard label="In stock" value={stats.inStock} tone="slate" icon={<FiBox className="h-4 w-4" />} />
          <StatCard label="Hidden" value={stats.hidden} tone="amber" icon={<FiFilter className="h-4 w-4" />} />
          <StatCard label="Attention" value={stats.attention} tone="rose" icon={<FiBarChart2 className="h-4 w-4" />} />
        </section>

        {/* Filters */}
        <section
          className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.14s" }}
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or color..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200 sm:w-64"
              />
            </div>
            <button
              type="button"
              aria-pressed={showActiveOnly}
              onClick={() => setShowActiveOnly((v) => !v)}
              className={togglePill(showActiveOnly, "border-emerald-200 bg-emerald-50 text-emerald-700")}
            >
              <FiActivity className="h-4 w-4" /> Active only
            </button>
            <button
              type="button"
              aria-pressed={showInStockOnly}
              onClick={() => setShowInStockOnly((v) => !v)}
              className={togglePill(showInStockOnly, "border-sky-200 bg-sky-50 text-sky-700")}
            >
              <FiBox className="h-4 w-4" /> In stock
            </button>
            <div className="ml-auto text-xs font-semibold text-slate-500">
              Showing {filteredItems.length} of {items.length}
            </div>
          </div>
        </section>

        {!isComposerOpen && (error || notice) && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
            style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.18s" }}
          >
            {error || notice}
          </div>
        )}

        {studioProgress && (
          <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 shadow-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
            {studioProgress}
          </div>
        )}

        <section
          className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.2s" }}
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Catalog Board</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">Existing products</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Browse the live catalog first, then open the editor only when you want to add, refine, or reposition an item.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {filteredItems.length} shown
              </span>
              <button
                type="button"
                onClick={openNewComposer}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiPlus className="h-4 w-4" />
                Add item
              </button>
            </div>
          </div>

          {loading ? (
            <div className="mt-8 text-sm text-slate-500">Loading items...</div>
          ) : filteredItems.length ? (
            <ul className="mt-6 grid gap-4 2xl:grid-cols-2">
              {filteredItems.map((item) => {
                const sizePrices = getSizePrices(item);
                const isSinglePriceItem =
                  sizePrices.length === 1 && isOneSizeLabel(sizePrices[0]?.size || "");
                const priceValues = sizePrices
                  .map((entry) => entry.price)
                  .filter((price) => Number.isFinite(price)) as number[];
                const minPrice = priceValues.length ? Math.min(...priceValues) : null;
                const itemIndex = items.findIndex((entry) => entry.id === item.id);
                const isEditingCard = isComposerOpen && editingId === item.id;
                const visibleSizes = isSinglePriceItem ? sizePrices.slice(0, 1) : sizePrices.slice(0, 4);
                const extraSizes = Math.max(0, sizePrices.length - visibleSizes.length);
                const colorLabels = sortQuoteColors(item.colors);
                const imageViews = getShopImageViews(item);
                const selectedCatalogView = imageViews.find((view) => view.key === catalogImageSelections[item.id]) || imageViews[0];
                const coverImageUrl = selectedCatalogView?.url || item.photoUrl;
                const isStudioProduct = Boolean(getShopDesignProductId(item.title));
                const hasStudioSources = Boolean(item.photoUrl || item.backPhotoUrl);
                const studioReady = Boolean(
                  item.studioPhotoUrl && (!item.backPhotoUrl || item.studioBackPhotoUrl)
                );
                const isPreparingThisItem = preparingStudioItemId === item.id;
                const frontStudioStatus = !item.photoUrl
                  ? "No photo"
                  : isPreparingThisItem
                    ? "Converting..."
                    : item.studioPhotoUrl
                      ? "Converted"
                      : "Not converted";
                const backStudioStatus = !item.backPhotoUrl
                  ? "No photo"
                  : isPreparingThisItem
                    ? "Converting..."
                    : item.studioBackPhotoUrl
                      ? "Converted"
                      : "Not converted";

                return (
                  <li
                    key={item.id}
                    className={`group relative overflow-hidden rounded-[1.8rem] border p-5 shadow-sm transition ${
                      isEditingCard
                        ? "border-slate-900 bg-slate-900/[0.02] shadow-[0_24px_44px_-34px_rgba(15,23,42,0.28)]"
                        : "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.88)_100%)] hover:border-sky-200 hover:shadow-[0_24px_44px_-34px_rgba(56,189,248,0.25)]"
                    }`}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-slate-200/40 blur-3xl transition group-hover:bg-sky-200/30"
                    />
                    <div className="relative flex h-full flex-col gap-5 sm:flex-row">
                      <div className="w-28 shrink-0 self-start">
                        <div className="relative aspect-square overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white p-3 shadow-sm">
                          {coverImageUrl ? (
                            <AsyncCatalogImage
                              src={catalogThumbnailOverrides[coverImageUrl] || getCatalogThumbnailUrl(coverImageUrl)}
                              alt={`${item.title}${selectedCatalogView ? ` ${selectedCatalogView.label.toLowerCase()} view` : ""}`}
                              className="h-full w-full object-cover object-center"
                              fallback={<span className="px-3 leading-tight">Image unavailable</span>}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                              <FiImage className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        {imageViews.length > 1 && (
                          <div className="mt-2 grid grid-cols-3 gap-1.5" aria-label={`${item.title} image views`}>
                            {imageViews.map((view) => {
                              const isSelected = selectedCatalogView?.key === view.key;
                              return (
                                <button
                                  key={`${item.id}-${view.key}`}
                                  type="button"
                                  onClick={() => setCatalogImageSelections((current) => ({ ...current, [item.id]: view.key }))}
                                  aria-label={`Show ${item.title} ${view.label.toLowerCase()} view`}
                                  aria-pressed={isSelected}
                                  title={view.label}
                                  className={`relative aspect-square overflow-hidden rounded-lg bg-white transition ${
                                    isSelected
                                      ? "border-2 border-slate-900 ring-2 ring-slate-200"
                                      : "border border-slate-200 hover:border-slate-400"
                                  }`}
                                >
                                  <AsyncCatalogImage
                                    src={catalogThumbnailOverrides[view.url || ""] || getCatalogThumbnailUrl(view.url || "")}
                                    alt={`${item.title} ${view.label.toLowerCase()} thumbnail`}
                                    className="h-full w-full object-contain object-center p-0.5"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-[1.45rem] font-semibold tracking-tight text-slate-900">
                              {item.title}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {colorLabels.length ? `Colors: ${colorLabels.join(", ")}` : "No colors configured"}
                            </p>
                          </div>
                          {minPrice !== null && (
                            <span className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                              {isSinglePriceItem ? money(minPrice) : `From ${money(minPrice)}`}
                            </span>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                              item.isActive
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.isActive ? "Active" : "Hidden"}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                              item.inStock
                                ? "border border-sky-200 bg-sky-50 text-sky-700"
                                : "border border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            {item.inStock ? "In stock" : "Out of stock"}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                            {colorLabels.length} colour{colorLabels.length === 1 ? "" : "s"}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                            {sizePrices.length} price row{sizePrices.length === 1 ? "" : "s"}
                          </span>
                          {isStudioProduct && (
                            <span
                              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                                studioReady
                                  ? "border-violet-200 bg-violet-50 text-violet-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                              }`}
                            >
                              {studioReady ? "Transparent: complete" : "Transparent: pending"}
                            </span>
                          )}
                        </div>

                        {isStudioProduct && (
                          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.1em] text-violet-700">
                                Design Studio
                              </p>
                              <span className="whitespace-nowrap text-[10px] font-semibold text-violet-600">
                                Transparent copies
                              </span>
                            </div>
                            <div className="mt-2 grid gap-2">
                              <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-white px-3 py-2">
                                <span className="whitespace-nowrap text-xs font-semibold text-slate-700">Front</span>
                                <span
                                  className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold ${
                                    !item.photoUrl
                                      ? "text-slate-400"
                                      : isPreparingThisItem
                                        ? "text-violet-700"
                                        : item.studioPhotoUrl
                                          ? "text-emerald-700"
                                          : "text-amber-700"
                                  }`}
                                >
                                  <span
                                    className={`h-2 w-2 rounded-full ${
                                      !item.photoUrl
                                        ? "bg-slate-300"
                                        : isPreparingThisItem
                                          ? "animate-pulse bg-violet-500"
                                          : item.studioPhotoUrl
                                            ? "bg-emerald-500"
                                            : "bg-amber-500"
                                    }`}
                                  />
                                  {frontStudioStatus}
                                </span>
                              </div>
                              <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-white px-3 py-2">
                                <span className="whitespace-nowrap text-xs font-semibold text-slate-700">Back</span>
                                <span
                                  className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold ${
                                    !item.backPhotoUrl
                                      ? "text-slate-400"
                                      : isPreparingThisItem
                                        ? "text-violet-700"
                                        : item.studioBackPhotoUrl
                                          ? "text-emerald-700"
                                          : "text-amber-700"
                                  }`}
                                >
                                  <span
                                    className={`h-2 w-2 rounded-full ${
                                      !item.backPhotoUrl
                                        ? "bg-slate-300"
                                        : isPreparingThisItem
                                          ? "animate-pulse bg-violet-500"
                                          : item.studioBackPhotoUrl
                                            ? "bg-emerald-500"
                                            : "bg-amber-500"
                                    }`}
                                  />
                                  {backStudioStatus}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {isSinglePriceItem ? (
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
                              <div className="text-xs font-semibold text-slate-900">One size</div>
                              <div className="text-xs text-slate-500">{money(sizePrices[0].price)}</div>
                            </div>
                          ) : visibleSizes.length ? (
                            <>
                              {visibleSizes.map((entry) => (
                                <div
                                  key={entry.size}
                                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-center"
                                >
                                  <div className="text-xs font-semibold text-slate-900">
                                    {formatSizeLabel(entry.size)}
                                  </div>
                                  <div className="text-xs text-slate-500">{money(entry.price)}</div>
                                </div>
                              ))}
                              {extraSizes > 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
                                  +{extraSizes} more
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-sm text-slate-400">No sizes priced yet</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 sm:w-[10.5rem] sm:flex-col">
                        <button
                          type="button"
                          onClick={() => moveItem(itemIndex, "up")}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(itemIndex, "down")}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="rounded-full border border-slate-900 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
                        >
                          Edit
                        </button>
                        {isStudioProduct && hasStudioSources && (
                          <button
                            type="button"
                            onClick={() => prepareOneStudioProduct(item)}
                            disabled={preparingStudio}
                            className="rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-wait disabled:opacity-50"
                          >
                            {isPreparingThisItem
                              ? "Converting..."
                              : studioReady
                                ? "Convert again"
                                : "Convert to transparent"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          className="rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-500">
              No shop items yet.
            </div>
          )}
        </section>

        {isComposerOpen && (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close item editor"
              onClick={closeComposer}
              className="absolute inset-0 bg-slate-950/35 backdrop-blur-[4px]"
            />

            <div className="relative z-10 flex min-h-[100dvh] items-start justify-center overflow-y-auto p-4 lg:p-8">
              <section className="relative my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_36px_80px_rgba(15,23,42,0.24)] lg:my-8 lg:max-h-[calc(100dvh-4rem)]">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Catalog editor</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                      {selectedItem ? "Refine product" : "Add new product"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedItem
                        ? "Update pricing, visibility, and photos without losing context from the live catalog."
                        : "Create a polished catalog item in a focused editor, then return to the product board."}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      <FiTag className="h-4 w-4" />
                      {selectedItem ? "Editing live item" : "Draft item"}
                    </span>
                    <button
                      type="button"
                      onClick={closeComposer}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                    >
                      <FiX className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="min-h-0 overflow-y-auto px-6 py-6">
                    <form className="flex min-h-full flex-col" onSubmit={saveItem}>
                      <div className="space-y-6">
                        {(error || notice) && (
                          <div
                            className={`rounded-2xl border px-4 py-3 text-sm ${
                              error
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {error || notice}
                          </div>
                        )}

                        {studioProgress && (
                          <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                            {studioProgress}
                          </div>
                        )}

                        <section className="rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-5">
                          <div className="mb-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Basics</p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-900">Product identity</h3>
                          </div>

                          <div>
                            <label className="text-sm font-semibold text-slate-700">Title *</label>
                            <input
                              required
                              value={form.title}
                              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                              placeholder="Plain T-Shirt"
                            />
                          </div>

                          <div className="mt-5">
                            <label className="text-sm font-semibold text-slate-700">Colors *</label>
                            <input
                              required
                              value={form.colors}
                              onChange={(e) => setForm((prev) => ({ ...prev, colors: e.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                              placeholder="Black, White, Navy"
                            />
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              These colours feed the quote form dropdown. White, Black, and Navy Blue are pinned first there.
                            </p>
                            {sortedFormColors.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {sortedFormColors.map((color) => (
                                  <span
                                    key={color}
                                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                                  >
                                    {color}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </section>

                        <section className="rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-5">
                          <div className="mb-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Pricing</p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-900">How this item should sell</h3>
                          </div>

                          <div className="space-y-3">
                            <label className="text-sm font-semibold text-slate-700">Pricing *</label>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => setPricingMode("sized")}
                                className={`rounded-2xl border px-4 py-4 text-left transition ${
                                  form.pricingMode === "sized"
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <div className="text-sm font-semibold">Price by size</div>
                                <div className={`mt-1 text-xs leading-5 ${form.pricingMode === "sized" ? "text-slate-200" : "text-slate-500"}`}>
                                  Best for T-shirts, polos, hoodies, and any item with multiple sizes.
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPricingMode("single")}
                                className={`rounded-2xl border px-4 py-4 text-left transition ${
                                  form.pricingMode === "single"
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <div className="text-sm font-semibold">Single price / no size</div>
                                <div className={`mt-1 text-xs leading-5 ${form.pricingMode === "single" ? "text-slate-200" : "text-slate-500"}`}>
                                  Best for caps and accessories. The client shop will show this as one size.
                                </div>
                              </button>
                            </div>
                          </div>

                          <div className="mt-5 space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-semibold text-slate-700">
                                {form.pricingMode === "single" ? "Single price *" : "Size prices *"}
                              </label>
                              {form.pricingMode === "sized" && (
                                <button
                                  type="button"
                                  onClick={addSizeRow}
                                  className="rounded-full border border-slate-900 px-3 py-1 text-xs font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
                                >
                                  Add size
                                </button>
                              )}
                            </div>

                            {form.pricingMode === "single" ? (
                              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                                  One size
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={form.singlePrice.price}
                                  onChange={(e) =>
                                    updateSinglePrice({
                                      price: e.target.value === "" ? "" : Number(e.target.value),
                                    })
                                  }
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  placeholder="Selling price"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={form.singlePrice.buyingPrice}
                                  onChange={(e) =>
                                    updateSinglePrice({
                                      buyingPrice: e.target.value === "" ? "" : Number(e.target.value),
                                    })
                                  }
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  placeholder="Buying price"
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  value={form.singlePrice.profit}
                                  onChange={(e) =>
                                    updateSinglePrice({
                                      profit: e.target.value === "" ? "" : Number(e.target.value),
                                    })
                                  }
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  placeholder="Profit"
                                />
                              </div>
                            ) : (
                              <>
                                <div className="hidden sm:grid grid-cols-[1.1fr_0.85fr_0.85fr_0.85fr_auto] gap-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                  <span>Size</span>
                                  <span>Selling price</span>
                                  <span>Buying price</span>
                                  <span>Profit</span>
                                  <span className="sr-only">Remove</span>
                                </div>
                                <div className="space-y-3">
                                  {form.sizePrices.map((row, index) => (
                                    <div
                                      key={`${row.size}-${index}`}
                                      className="grid grid-cols-2 gap-3 sm:grid-cols-[1.1fr_0.85fr_0.85fr_0.85fr_auto] sm:items-center"
                                    >
                                      <select
                                        value={row.size}
                                        onChange={(e) => updateSizeRow(index, { size: e.target.value })}
                                        className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 sm:col-span-1"
                                        required
                                      >
                                        <option value="" disabled>
                                          Select size
                                        </option>
                                        {SIZE_ORDER.map((size) => (
                                          <option key={size} value={size}>
                                            {formatSizeLabel(size)}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={row.price}
                                        onChange={(e) =>
                                          updateSizeRow(index, {
                                            price: e.target.value === "" ? "" : Number(e.target.value),
                                          })
                                        }
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                        placeholder="Selling price"
                                      />
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={row.buyingPrice}
                                        onChange={(e) =>
                                          updateSizeRow(index, {
                                            buyingPrice: e.target.value === "" ? "" : Number(e.target.value),
                                          })
                                        }
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                        placeholder="Buying price"
                                      />
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={row.profit}
                                        onChange={(e) =>
                                          updateSizeRow(index, {
                                            profit: e.target.value === "" ? "" : Number(e.target.value),
                                          })
                                        }
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                        placeholder="Profit"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeSizeRow(index)}
                                        className="col-span-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 sm:col-span-1"
                                        aria-label="Remove size"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            <p className="text-xs text-slate-500">
                              {form.pricingMode === "single"
                                ? "Use this for caps and other products that do not need size selection. The client shop will show One size automatically."
                                : "Leave selling price blank if that size is not available."}
                            </p>
                          </div>
                        </section>

                        <section className="rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-5">
                          <div className="mb-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Logistics</p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-900">Pickup and visibility</h3>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="text-sm font-semibold text-slate-700">Supplier pickup point</label>
                              <input
                                value={form.pickupPoint}
                                onChange={(e) => setForm((prev) => ({ ...prev, pickupPoint: e.target.value }))}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-semibold text-slate-700">Collection point</label>
                              <input
                                value={form.collectionPoint}
                                onChange={(e) => setForm((prev) => ({ ...prev, collectionPoint: e.target.value }))}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                              />
                            </div>
                          </div>

                          <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={form.isActive}
                                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-slate-900"
                              />
                              Show on public page
                            </label>
                            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={form.inStock}
                                onChange={(e) => setForm((prev) => ({ ...prev, inStock: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-slate-900"
                              />
                              In stock
                            </label>
                          </div>
                        </section>

                        <section className="rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-5">
                          <div className="mb-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Photos</p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-900">Front, back, and side views</h3>
                          </div>

                          <div className="space-y-4">
                            <div className="grid gap-2 sm:grid-cols-3">
                              {SHOP_IMAGE_VIEWS.map((view) => {
                                const imageUrl = getPreviewImageUrl(view.key);
                                return (
                                  <button
                                    key={view.key}
                                    type="button"
                                    onClick={() => setSelectedImageView(view.key)}
                                    className={`rounded-2xl border p-2 text-left transition ${
                                      selectedImageView === view.key
                                        ? "border-slate-900 bg-white shadow-sm"
                                        : "border-slate-200 bg-white/70 hover:border-slate-300"
                                    }`}
                                  >
                                    <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                      {imageUrl ? (
                                        <AsyncCatalogImage
                                          src={imageUrl}
                                          alt={`${view.label} view`}
                                          className="h-full w-full object-cover object-center"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                                          <FiImage className="h-5 w-5" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="mt-2 text-xs font-semibold text-slate-800">{view.label}</div>
                                  </button>
                                );
                              })}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {SHOP_IMAGE_VIEWS.find((view) => view.key === selectedImageView)?.label} view
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    Front is required for a one-photo product. Back and side are optional.
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    ref={photoInputRef}
                                    id="shop-photo-upload"
                                    type="file"
                                    accept="image/*"
                                    tabIndex={-1}
                                    onChange={(e) => {
                                      const nextFile = e.target.files?.[0] || null;
                                      if (nextFile && nextFile.size > MAX_UPLOAD_BYTES) {
                                        setError("Image must be 6 MB or smaller.");
                                        setImageFiles((prev) => ({ ...prev, [selectedImageView]: null }));
                                        if (photoInputRef.current) photoInputRef.current.value = "";
                                        e.currentTarget.value = "";
                                        return;
                                      }
                                      setError(null);
                                      setImageFiles((prev) => ({
                                        ...prev,
                                        [selectedImageView]: nextFile,
                                      }));
                                      photoInputRef.current?.blur();
                                    }}
                                    className="hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => photoInputRef.current?.click()}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                                  >
                                    <FiImage className="h-4 w-4" />
                                    Choose file
                                  </button>
                                  <button
                                    type="button"
                                    onClick={uploadPhoto}
                                    disabled={!imageFiles[selectedImageView] || uploading}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-900 px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <FiImage className="h-4 w-4" />
                                    {uploading ? "Uploading..." : "Upload"}
                                  </button>
                                </div>
                              </div>

                              <div className="mt-3 text-xs text-slate-500">
                                {imageFiles[selectedImageView]
                                  ? imageFiles[selectedImageView]?.name
                                  : "No new file chosen"}
                              </div>

                              <input
                                value={getFormImageUrl(selectedImageView)}
                                onChange={(e) => updateFormImageUrl(selectedImageView, e.target.value)}
                                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                placeholder={`Paste ${SHOP_IMAGE_VIEWS.find((view) => view.key === selectedImageView)?.label.toLowerCase()} image URL`}
                              />

                              {(selectedImageView === "front" || selectedImageView === "back") && (
                                <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-violet-900">Design Studio copy</div>
                                      <div className="mt-1 text-xs leading-5 text-violet-700/75">
                                        Generated automatically with a transparent background and consistent square alignment.
                                      </div>
                                    </div>
                                    {getFormStudioImageUrl(selectedImageView) ? (
                                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                                        Ready
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
                                        Pending
                                      </span>
                                    )}
                                  </div>
                                  {getFormStudioImageUrl(selectedImageView) && (
                                    <div className="mt-3 flex items-center gap-3">
                                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-violet-100 bg-[linear-gradient(45deg,#e8e7f5_25%,transparent_25%),linear-gradient(-45deg,#e8e7f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e8e7f5_75%),linear-gradient(-45deg,transparent_75%,#e8e7f5_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]">
                                        <AsyncCatalogImage
                                          src={getFormStudioImageUrl(selectedImageView)}
                                          alt={`${selectedImageView} transparent studio preview`}
                                          className="h-full w-full object-contain object-center"
                                        />
                                      </div>
                                      <p className="text-xs leading-5 text-violet-700">
                                        This copy is used only in Design Studio. The public Shops photo stays unchanged.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </section>
                      </div>

                      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-white pt-4">
                        <button
                          type="button"
                          onClick={closeComposer}
                          className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-700"
                        >
                          {saving ? "Saving..." : selectedItem ? "Update item" : "Create item"}
                        </button>
                      </div>
                    </form>
                  </div>

                  <aside className="min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-50/80 px-6 py-6 xl:border-l xl:border-t-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Live preview</p>
                    <div className="mt-4 rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="relative aspect-square overflow-hidden rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
                        {getPreviewImageUrl(selectedImageView) || form.photoUrl ? (
                          <AsyncCatalogImage
                            src={getPreviewImageUrl(selectedImageView) || form.photoUrl}
                            alt={form.title || "Preview item"}
                            className="h-full w-full object-cover object-center"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-300">
                            <FiImage className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      {getFormImageViews().length > 0 && (
                        <div className="mt-3 flex gap-2">
                          {getFormImageViews().map((view) => (
                            <button
                              key={`preview-${view.key}`}
                              type="button"
                              onClick={() => setSelectedImageView(view.key)}
                              className={`relative h-14 w-14 overflow-hidden rounded-xl border bg-slate-50 transition ${
                                selectedImageView === view.key
                                  ? "border-slate-900 ring-2 ring-slate-900/10"
                                  : "border-slate-200"
                              }`}
                              title={`${view.label} view`}
                            >
                              <AsyncCatalogImage
                                src={view.url || ""}
                                alt={`${view.label} preview`}
                                className="h-full w-full object-cover object-center"
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="mt-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-900">
                            {form.title.trim() || "Untitled item"}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              form.isActive
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            {form.isActive ? "Active" : "Hidden"}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              form.inStock
                                ? "border border-sky-200 bg-sky-50 text-sky-700"
                                : "border border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            {form.inStock ? "In stock" : "Out of stock"}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {composerPricePreview !== null ? (
                            <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                              {form.pricingMode === "single"
                                ? money(composerPricePreview)
                                : `From ${money(composerPricePreview)}`}
                            </span>
                          ) : (
                            <span className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-400">
                              Add price to preview
                            </span>
                          )}
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                            {composerPricedRows} priced row{composerPricedRows === 1 ? "" : "s"}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {sortedFormColors.length ? (
                            sortedFormColors.slice(0, 6).map((color) => (
                              <span
                                key={color}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                              >
                                {color}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">Add colours to preview swatches.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Pickup</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {form.pickupPoint.trim() || DEFAULT_PICKUP_POINT}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">Supplier pickup location</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Collection</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {form.collectionPoint.trim() || DEFAULT_COLLECTION_POINT}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">Client collection point</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Pricing mode</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {form.pricingMode === "single" ? "Single price / no size" : "Price by size"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {form.pricingMode === "single"
                            ? "Best for caps and accessories."
                            : "Best for garments with multiple sizes."}
                        </div>
                      </div>
                    </div>
                  </aside>
                </div>
              </section>
            </div>
          </div>
        )}

        <style jsx>{`
          @keyframes fadeUp {
            from {
              opacity: 0;
              transform: translateY(14px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone = "slate",
  icon,
}: {
  label: string;
  value: number;
  tone?: "slate" | "sky" | "emerald" | "amber" | "rose";
  icon?: React.ReactNode;
}) {
  const tones = {
    slate: {
      border: "border-slate-200",
      bg: "from-slate-50 via-white to-white",
      accent: "bg-slate-100 text-slate-700",
      glow: "bg-slate-200/40",
      value: "text-slate-900",
    },
    sky: {
      border: "border-sky-100",
      bg: "from-sky-50 via-white to-white",
      accent: "bg-sky-100 text-sky-700",
      glow: "bg-sky-200/40",
      value: "text-slate-900",
    },
    emerald: {
      border: "border-emerald-100",
      bg: "from-emerald-50 via-white to-white",
      accent: "bg-emerald-100 text-emerald-700",
      glow: "bg-emerald-200/40",
      value: "text-slate-900",
    },
    amber: {
      border: "border-amber-100",
      bg: "from-amber-50 via-white to-white",
      accent: "bg-amber-100 text-amber-700",
      glow: "bg-amber-200/40",
      value: "text-slate-900",
    },
    rose: {
      border: "border-rose-100",
      bg: "from-rose-50 via-white to-white",
      accent: "bg-rose-100 text-rose-700",
      glow: "bg-rose-200/40",
      value: "text-slate-900",
    },
  } as const;
  const theme = tones[tone] ?? tones.slate;

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.accent}`}>
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${theme.value}`}>{value.toLocaleString()}</div>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`}
      />
    </div>
  );
}
