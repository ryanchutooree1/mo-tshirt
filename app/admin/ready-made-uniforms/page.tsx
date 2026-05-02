"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  READY_MADE_UNIFORM_ACCENT_OPTIONS,
  type ReadyMadeUniformItem,
} from "@/lib/ready-made-uniforms-store";
import {
  FiActivity,
  FiEye,
  FiEyeOff,
  FiImage,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTag,
  FiUpload,
  FiX,
} from "react-icons/fi";

const UNIFORM_IMAGE_VIEWS = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "side", label: "Side" },
] as const;

type UniformImageViewKey = (typeof UNIFORM_IMAGE_VIEWS)[number]["key"];
type ImageFileState = Record<UniformImageViewKey, File | null>;

type FormState = {
  code: string;
  title: string;
  audience: string;
  description: string;
  features: string;
  imageSrc: string;
  imageGallery: string;
  accentClass: string;
  badgeClass: string;
  message: string;
  isActive: boolean;
  position: number;
};

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const INPUT_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100";

function buildEmptyFormState(): FormState {
  const accent = READY_MADE_UNIFORM_ACCENT_OPTIONS[0];
  return {
    code: "",
    title: "",
    audience: "",
    description: "",
    features: "",
    imageSrc: "",
    imageGallery: "",
    accentClass: accent.value,
    badgeClass: accent.badgeClass,
    message: "",
    isActive: true,
    position: Date.now(),
  };
}

function buildFormState(item: ReadyMadeUniformItem): FormState {
  return {
    code: item.code,
    title: item.title,
    audience: item.audience,
    description: item.description,
    features: item.features.join("\n"),
    imageSrc: item.imageSrc,
    imageGallery: (item.imageGallery || []).join("\n"),
    accentClass: item.accentClass,
    badgeClass: item.badgeClass,
    message: item.message,
    isActive: item.isActive,
    position: item.position,
  };
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getAccentForValue(value: string) {
  return (
    READY_MADE_UNIFORM_ACCENT_OPTIONS.find((option) => option.value === value) ||
    READY_MADE_UNIFORM_ACCENT_OPTIONS[0]
  );
}

function buildEmptyImageFiles(): ImageFileState {
  return {
    front: null,
    back: null,
    side: null,
  };
}

function parseGalleryInput(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatGalleryInput(list: string[]) {
  return list.filter(Boolean).join("\n");
}

function UniformImage({
  src,
  alt,
  className = "h-full w-full object-contain",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-300">
        <FiImage className="h-6 w-6" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setHasError(true)}
    />
  );
}

export default function AdminReadyMadeUniformsPage() {
  const [items, setItems] = useState<ReadyMadeUniformItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => buildEmptyFormState());
  const [imageFiles, setImageFiles] = useState<ImageFileState>(() => buildEmptyImageFiles());
  const [previewUrls, setPreviewUrls] = useState<Record<UniformImageViewKey, string>>({
    front: "",
    back: "",
    side: "",
  });
  const [selectedImageView, setSelectedImageView] = useState<UniformImageViewKey>("front");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      if (event.key === "Escape") closeComposer();
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
      const res = await fetch("/api/admin/ready-made-uniforms", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load uniforms.");
      setItems(Array.isArray(data?.items) ? data.items : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load uniforms.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (showActiveOnly && !item.isActive) return false;
      if (!term) return true;
      const blob = `${item.code} ${item.title} ${item.audience} ${item.description} ${item.features.join(" ")}`.toLowerCase();
      return blob.includes(term);
    });
  }, [items, search, showActiveOnly]);

  const stats = useMemo(() => {
    const active = items.filter((item) => item.isActive).length;
    return {
      total: items.length,
      active,
      hidden: items.length - active,
    };
  }, [items]);

  function closeComposer() {
    setIsComposerOpen(false);
    setEditingId(null);
    setForm(buildEmptyFormState());
    setImageFiles(buildEmptyImageFiles());
    setSelectedImageView("front");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openNewComposer() {
    setError(null);
    setNotice(null);
    setEditingId(null);
    setForm(buildEmptyFormState());
    setImageFiles(buildEmptyImageFiles());
    setSelectedImageView("front");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsComposerOpen(true);
  }

  function startEdit(item: ReadyMadeUniformItem) {
    setError(null);
    setNotice(null);
    setEditingId(item.id);
    setForm(buildFormState(item));
    setImageFiles(buildEmptyImageFiles());
    setSelectedImageView("front");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsComposerOpen(true);
  }

  async function uploadImageFile(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/api/admin/ready-made-uniforms/upload", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Photo upload failed. Paste an image URL instead.");
      }

      return String(data.url);
    } finally {
      setUploading(false);
    }
  }

  function getFormImageUrl(view: UniformImageViewKey) {
    const gallery = parseGalleryInput(form.imageGallery);
    if (view === "front") return form.imageSrc;
    if (view === "back") return gallery[0] || "";
    return gallery[1] || "";
  }

  function getPreviewImageUrl(view: UniformImageViewKey) {
    return previewUrls[view] || getFormImageUrl(view);
  }

  function updateFormImageUrl(view: UniformImageViewKey, url: string) {
    if (view === "front") {
      setForm((prev) => ({ ...prev, imageSrc: url }));
      return;
    }

    setForm((prev) => {
      const gallery = parseGalleryInput(prev.imageGallery);
      const index = view === "back" ? 0 : 1;
      gallery[index] = url;
      return { ...prev, imageGallery: formatGalleryInput(gallery) };
    });
  }

  async function uploadFileAndGetUrl(view: UniformImageViewKey) {
    const file = imageFiles[view];
    if (!file) return getFormImageUrl(view);

    const url = await uploadImageFile(file);
    updateFormImageUrl(view, url);
    setImageFiles((prev) => ({ ...prev, [view]: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
    return url;
  }

  async function uploadPhoto() {
    const file = imageFiles[selectedImageView];
    if (!file) {
      setNotice("Choose a file first.");
      return;
    }
    setNotice(null);
    setError(null);
    try {
      const url = await uploadFileAndGetUrl(selectedImageView);
      if (url) {
        const viewLabel =
          UNIFORM_IMAGE_VIEWS.find((view) => view.key === selectedImageView)?.label ||
          "Photo";
        setNotice(`${viewLabel} photo uploaded. Save the uniform to apply it.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Use an image URL instead.");
    }
  }

  async function uploadPendingImageFiles() {
    const uploaded = {
      front: form.imageSrc,
      back: parseGalleryInput(form.imageGallery)[0] || "",
      side: parseGalleryInput(form.imageGallery)[1] || "",
    };

    for (const view of UNIFORM_IMAGE_VIEWS) {
      if (!imageFiles[view.key]) continue;
      uploaded[view.key] = await uploadFileAndGetUrl(view.key);
    }

    return uploaded;
  }

  async function saveItem(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const imageUrls = await uploadPendingImageFiles();
      const code = normalizeCode(form.code);
      const payload = {
        ...form,
        code,
        imageSrc: imageUrls.front,
        imageGallery: [imageUrls.back, imageUrls.side].filter(Boolean),
        features: form.features
          .split(/\r?\n|,/)
          .map((entry) => entry.trim())
          .filter(Boolean),
      };

      const res = await fetch(
        editingId
          ? `/api/admin/ready-made-uniforms/${encodeURIComponent(editingId)}`
          : "/api/admin/ready-made-uniforms",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save uniform.");

      await refresh();
      closeComposer();
      setNotice(editingId ? "Uniform updated." : "Uniform created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save uniform.");
    } finally {
      setSaving(false);
    }
  }

  async function hideItem(item: ReadyMadeUniformItem) {
    if (!confirm(`Hide ${item.code} from the public page?`)) return;
    try {
      const res = await fetch(`/api/admin/ready-made-uniforms/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to hide uniform.");
      await refresh();
      setNotice("Uniform hidden from the public page.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hide uniform.");
    }
  }

  async function moveItem(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const current = items[index];
    const target = items[targetIndex];
    if (!current || !target) return;

    try {
      const res = await fetch("/api/admin/ready-made-uniforms/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { id: current.id, position: target.position },
            { id: target.id, position: current.position },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to reorder uniform.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder uniform.");
    }
  }

  const previewImage = getPreviewImageUrl(selectedImageView);

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-600">
                Public Page Content
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Ready-made uniforms
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Update the style codes, images, selling copy, and WhatsApp messages shown on
                /ready-made-uniforms.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={refresh}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <FiRefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                type="button"
                onClick={openNewComposer}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiPlus className="h-4 w-4" /> Add uniform
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-4">
          <StatCard label="Total" value={stats.total} icon={<FiLayers className="h-4 w-4" />} />
          <StatCard label="Active" value={stats.active} icon={<FiActivity className="h-4 w-4" />} />
          <StatCard label="Hidden" value={stats.hidden} icon={<FiEyeOff className="h-4 w-4" />} />
        </section>

        <section className="sticky top-20 z-10 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search code, title, or audience..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 sm:w-72"
              />
            </div>
            <button
              type="button"
              aria-pressed={showActiveOnly}
              onClick={() => setShowActiveOnly((value) => !value)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                showActiveOnly
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <FiEye className="h-4 w-4" /> Active only
            </button>
            <div className="ml-auto text-xs font-semibold text-slate-500">
              Showing {filteredItems.length} of {items.length}
            </div>
          </div>
        </section>

        {(error || notice) && !isComposerOpen && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || notice}
          </div>
        )}

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Uniform Board
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">Style codes</h2>
              <p className="mt-2 text-sm text-slate-600">
                Edit cards here and the public ready-made uniforms page will use the saved version.
              </p>
            </div>
            <a
              href="/ready-made-uniforms"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Open public page
            </a>
          </div>

          {loading ? (
            <div className="mt-8 text-sm text-slate-500">Loading uniforms...</div>
          ) : filteredItems.length ? (
            <ul className="mt-6 grid gap-4 xl:grid-cols-2">
              {filteredItems.map((item) => {
                const itemIndex = items.findIndex((entry) => entry.id === item.id);
                return (
                  <li
                    key={item.id}
                    className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="relative aspect-square overflow-hidden bg-white">
                      <UniformImage src={item.imageSrc} alt={item.title} />
                      <div className="absolute left-4 top-4 flex items-start gap-2">
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${item.badgeClass}`}>
                          {item.code}
                        </span>
                        <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm backdrop-blur-sm">
                          {item.isActive ? "Live" : "Hidden"}
                        </span>
                      </div>
                    </div>

                    <div className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.code}</p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-900">{item.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">{item.audience}</p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveItem(itemIndex, "up")}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(itemIndex, "down")}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
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
                        <button
                          type="button"
                          onClick={() => hideItem(item)}
                          className="rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-500">
              No uniforms match the current filters.
            </div>
          )}
        </section>
      </div>

      {isComposerOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close uniform editor"
            onClick={closeComposer}
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[4px]"
          />
          <div className="relative z-10 flex min-h-[100dvh] items-start justify-center overflow-y-auto p-4 lg:p-8">
            <section className="relative my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_36px_80px_rgba(15,23,42,0.24)] lg:my-8 lg:max-h-[calc(100dvh-4rem)]">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                    Uniform editor
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                    {editingId ? "Edit style code" : "Add style code"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeComposer}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>

              <form className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_340px]" onSubmit={saveItem}>
                <div className="min-h-0 overflow-y-auto px-6 py-6">
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

                    <EditorSection eyebrow="Basics" title="Style identity">
                      <div className="grid gap-4 sm:grid-cols-[0.45fr_1fr]">
                        <Field label="Style code *">
                          <input
                            required
                            value={form.code}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, code: normalizeCode(event.target.value) }))
                            }
                            className={INPUT_CLASS}
                            placeholder="SEC-01"
                          />
                        </Field>
                        <Field label="Title *">
                          <input
                            required
                            value={form.title}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, title: event.target.value }))
                            }
                            className={INPUT_CLASS}
                            placeholder="Security Poloshirts"
                          />
                        </Field>
                      </div>

                      <Field label="Audience *">
                        <input
                          required
                          value={form.audience}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, audience: event.target.value }))
                          }
                          className={INPUT_CLASS}
                          placeholder="For guards, supervisors, and patrol teams"
                        />
                      </Field>

                      <Field label="Description *">
                        <textarea
                          required
                          rows={4}
                          value={form.description}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, description: event.target.value }))
                          }
                          className={`${INPUT_CLASS} resize-y`}
                          placeholder="Explain how this uniform offer helps the buyer."
                        />
                      </Field>

                      <Field label="Features *">
                        <textarea
                          required
                          rows={4}
                          value={form.features}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, features: event.target.value }))
                          }
                          className={`${INPUT_CLASS} resize-y`}
                          placeholder={"Add company logo\nBlack, navy, or grey base\nBuilt for repeat orders"}
                        />
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          Add one feature per line. Commas also work.
                        </p>
                      </Field>
                    </EditorSection>

                    <EditorSection eyebrow="Visuals" title="Card image">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Color style">
                          <select
                            value={form.accentClass}
                            onChange={(event) => {
                              const accent = getAccentForValue(event.target.value);
                              setForm((prev) => ({
                                ...prev,
                                accentClass: accent.value,
                                badgeClass: accent.badgeClass,
                              }));
                            }}
                            className={INPUT_CLASS}
                          >
                            {READY_MADE_UNIFORM_ACCENT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Show on public page">
                          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={form.isActive}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                              }
                              className="h-4 w-4 rounded border-slate-300 text-slate-900"
                            />
                            Active
                          </label>
                        </Field>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        {UNIFORM_IMAGE_VIEWS.map((view) => {
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
                                  <UniformImage src={imageUrl} alt={`${view.label} view`} />
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
                              {UNIFORM_IMAGE_VIEWS.find((view) => view.key === selectedImageView)?.label} view
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Front is the main card image. Back and side become thumbnails.
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              ref={fileInputRef}
                              id="uniform-photo-upload"
                              type="file"
                              accept="image/*"
                              tabIndex={-1}
                              className="hidden"
                              onChange={(event) => {
                                const nextFile = event.target.files?.[0] || null;
                                if (nextFile && nextFile.size > MAX_UPLOAD_BYTES) {
                                  setError("Image must be 6 MB or smaller.");
                                  setImageFiles((prev) => ({ ...prev, [selectedImageView]: null }));
                                  if (fileInputRef.current) fileInputRef.current.value = "";
                                  event.currentTarget.value = "";
                                  return;
                                }
                                setError(null);
                                setImageFiles((prev) => ({ ...prev, [selectedImageView]: nextFile }));
                                fileInputRef.current?.blur();
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              <FiUpload className="h-4 w-4" /> Choose file
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
                          onChange={(event) => updateFormImageUrl(selectedImageView, event.target.value)}
                          className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                          placeholder={selectedImageView === "front" ? "/mockups/polo-front.png" : "Optional image URL"}
                          required={selectedImageView === "front"}
                        />
                      </div>
                    </EditorSection>

                    <EditorSection eyebrow="WhatsApp" title="Client message">
                      <Field label="WhatsApp message">
                        <textarea
                          rows={4}
                          value={form.message}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, message: event.target.value }))
                          }
                          className={`${INPUT_CLASS} resize-y`}
                          placeholder="Hi! I want the ready-made uniform SEC-01..."
                        />
                      </Field>
                    </EditorSection>
                  </div>
                </div>

                <aside className="border-t border-slate-200 bg-slate-50 p-6 xl:border-l xl:border-t-0">
                  <div className="sticky top-6 space-y-4">
                    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                      <div className="relative aspect-square bg-white">
                        <span className={`absolute left-4 top-4 z-10 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${form.badgeClass}`}>
                          {form.code || "CODE"}
                        </span>
                        <UniformImage src={previewImage} alt={form.title || "Uniform preview"} />
                      </div>
                      <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {form.audience || "Audience"}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">
                          {form.title || "Uniform title"}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {form.description || "Description preview"}
                        </p>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={saving || uploading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FiTag className="h-4 w-4" />
                      {saving || uploading ? "Saving..." : "Save uniform"}
                    </button>
                    <button
                      type="button"
                      onClick={closeComposer}
                      className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </aside>
              </form>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function EditorSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block text-sm font-semibold text-slate-700">
      <div>{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
