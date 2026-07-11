"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  LocateFixed,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import type { AdminProfile } from "@/lib/admin-profile";

type AdminProfileEditorProps = {
  open: boolean;
  profile: AdminProfile;
  email: string;
  fallbackAvatarUrl: string | null;
  onSaveRequest?: (profile: AdminProfile) => Promise<AdminProfile>;
  onClose: () => void;
  onSaved: (profile: AdminProfile) => void;
};

type DragStart = {
  pointerId: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number) {
  return canvas.toDataURL("image/jpeg", quality);
}

function avatarPosition(offset: number) {
  return clamp(50 - offset, 0, 100);
}

function profilesEqual(left: AdminProfile, right: AdminProfile) {
  return (
    left.displayName === right.displayName &&
    left.headline === right.headline &&
    left.location === right.location &&
    left.bio === right.bio &&
    left.avatarDataUrl === right.avatarDataUrl &&
    left.avatarZoom === right.avatarZoom &&
    left.avatarOffsetX === right.avatarOffsetX &&
    left.avatarOffsetY === right.avatarOffsetY
  );
}

async function prepareProfileImage(file: File) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 10 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image could not be opened."));
      element.src = objectUrl;
    });

    if (image.naturalWidth < 256 || image.naturalHeight < 256) {
      throw new Error("Choose a photo that is at least 256 × 256 pixels.");
    }
    if (
      image.naturalWidth > 8_192 ||
      image.naturalHeight > 8_192 ||
      image.naturalWidth * image.naturalHeight > 25_000_000
    ) {
      throw new Error("Choose a photo below 8,192 pixels and 25 megapixels.");
    }

    const maxDimension = 900;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let dataUrl = canvasToDataUrl(canvas, 0.84);
    for (const quality of [0.72, 0.6]) {
      if (dataUrl.length <= 620_000) break;
      dataUrl = canvasToDataUrl(canvas, quality);
    }
    if (dataUrl.length > 620_000) {
      throw new Error("This image is still too large. Choose a smaller photo.");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function AdminProfileEditor({
  open,
  profile,
  email,
  fallbackAvatarUrl,
  onSaveRequest,
  onClose,
  onSaved,
}: AdminProfileEditorProps) {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const inputId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const previousOpen = useRef(false);
  const baselineProfile = useRef(profile);
  const draftRef = useRef(profile);
  const closingRef = useRef(false);
  const saveControllerRef = useRef<AbortController | null>(null);
  const photoOperationRef = useRef(0);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  draftRef.current = draft;
  savingRef.current = saving;
  const isDirty = !profilesEqual(draft, baselineProfile.current);

  useEffect(() => {
    const wasOpen = previousOpen.current;
    previousOpen.current = open;
    if (!open || wasOpen) return;
    baselineProfile.current = profile;
    draftRef.current = profile;
    setDraft({ ...profile });
    setError("");
    setNameError("");
    setSaving(false);
    setProcessingImage(false);
    closingRef.current = false;
  }, [open, profile]);

  const closeEditor = useCallback(() => {
    const hasChanges = !profilesEqual(draftRef.current, baselineProfile.current);
    if (
      hasChanges &&
      !window.confirm(savingRef.current ? "Stop saving and discard these changes?" : "Discard your unsaved profile changes?")
    ) {
      return;
    }
    closingRef.current = true;
    photoOperationRef.current += 1;
    saveControllerRef.current?.abort();
    saveControllerRef.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => nameRef.current?.focus(), 50);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditor();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeEditor, open]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  if (!open) return null;

  const imageSource = draft.avatarDataUrl || fallbackAvatarUrl;
  const fieldClass = `mt-1.5 h-11 w-full rounded-xl border px-3 text-base outline-none transition sm:text-sm ${
    isDark
      ? "border-white/10 bg-white/[0.055] text-white placeholder:text-white/30 focus:border-[#7cff45]/50"
      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-400"
  }`;

  async function choosePhoto(file: File | undefined) {
    if (!file || saving || processingImage) return;
    const operation = photoOperationRef.current + 1;
    photoOperationRef.current = operation;
    setProcessingImage(true);
    setError("");
    try {
      const avatarDataUrl = await prepareProfileImage(file);
      if (photoOperationRef.current !== operation || closingRef.current) return;
      setDraft((current) => ({
        ...current,
        avatarDataUrl,
        avatarZoom: 1,
        avatarOffsetX: 0,
        avatarOffsetY: 0,
      }));
    } catch (nextError) {
      if (photoOperationRef.current !== operation || closingRef.current) return;
      setError(nextError instanceof Error ? nextError.message : "Could not prepare this image.");
    } finally {
      if (photoOperationRef.current === operation && !closingRef.current) {
        setProcessingImage(false);
      }
    }
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!imageSource || !event.isPrimary || event.button !== 0 || dragStart.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: draft.avatarOffsetX,
      offsetY: draft.avatarOffsetY,
    };
  }

  function nudgePhoto(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!imageSource || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    setDraft((current) => ({
      ...current,
      avatarOffsetX: clamp(
        current.avatarOffsetX + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
        -35,
        35
      ),
      avatarOffsetY: clamp(
        current.avatarOffsetY + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
        -35,
        35
      ),
    }));
  }

  function movePhoto(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextX = start.offsetX + ((event.clientX - start.x) / bounds.width) * 100;
    const nextY = start.offsetY + ((event.clientY - start.y) / bounds.height) * 100;
    setDraft((current) => ({
      ...current,
      avatarOffsetX: clamp(nextX, -35, 35),
      avatarOffsetY: clamp(nextY, -35, 35),
    }));
  }

  function stopDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current?.pointerId !== event.pointerId) return;
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function saveProfile() {
    if (draft.displayName.trim().length < 2) {
      setNameError("Enter at least 2 characters for your full name.");
      setError("");
      nameRef.current?.focus();
      return;
    }

    setSaving(true);
    setError("");
    setNameError("");
    const controller = new AbortController();
    saveControllerRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    try {
      if (onSaveRequest) {
        const savedProfile = await onSaveRequest(draft);
        onSaved(savedProfile);
        return;
      }
      const response = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.profile) {
        throw new Error(body?.error || "Could not save your profile.");
      }
      onSaved(body.profile as AdminProfile);
    } catch (nextError) {
      if (controller.signal.aborted) {
        if (timedOut && !closingRef.current) {
          setError("Saving took too long. Check your connection and try again.");
        }
        return;
      }
      setError(nextError instanceof Error ? nextError.message : "Could not save your profile.");
    } finally {
      window.clearTimeout(timeout);
      if (saveControllerRef.current === controller) saveControllerRef.current = null;
      if (!closingRef.current) setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeEditor}
        aria-label="Close edit profile"
        tabIndex={-1}
      />
      <section className={`relative flex max-h-[calc(100dvh-0.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px] ${
        isDark ? "border-white/10 bg-[#0b1510] text-white" : "border-slate-200 bg-[#f8f9fb] text-slate-950"
      }`} ref={dialogRef} aria-busy={saving || processingImage}>
        <span className="sr-only" role="status" aria-live="polite">
          {processingImage ? "Preparing profile photo" : saving ? "Saving profile" : ""}
        </span>
        <header className={`flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6 ${isDark ? "border-white/10 bg-[#0e1b14]" : "border-slate-200 bg-white"}`}>
          <div>
            <h2 id="edit-profile-title" className="text-base font-bold">Edit profile</h2>
          </div>
          <button type="button" onClick={closeEditor} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`} aria-label="Close profile editor">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              <div className={`rounded-2xl border p-4 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
                <div
                  className={`relative mx-auto h-44 w-44 touch-none overflow-hidden rounded-full border-4 shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff6400]/60 ${isDark ? "border-[#284e37] bg-[#071015]" : "border-white bg-slate-200"} ${imageSource ? "cursor-grab active:cursor-grabbing" : ""}`}
                  onPointerDown={startDrag}
                  onPointerMove={movePhoto}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  onLostPointerCapture={stopDrag}
                  onKeyDown={nudgePhoto}
                  tabIndex={imageSource ? 0 : -1}
                  role="group"
                  aria-label="Drag to reposition profile photo"
                >
                  {imageSource ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center bg-no-repeat will-change-transform"
                      style={{
                        backgroundImage: `url(${imageSource})`,
                        backgroundPosition: `${avatarPosition(draft.avatarOffsetX)}% ${avatarPosition(draft.avatarOffsetY)}%`,
                        transform: `scale(${draft.avatarZoom})`,
                        transformOrigin: `${avatarPosition(draft.avatarOffsetX)}% ${avatarPosition(draft.avatarOffsetY)}%`,
                      }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-4xl font-bold opacity-50">
                      {draft.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A"}
                    </div>
                  )}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-2 text-[10px] font-semibold text-white">
                    <Camera className="h-3.5 w-3.5" /> Drag to position
                  </span>
                </div>

                <input
                  id={inputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={saving || processingImage}
                  className="peer sr-only"
                  onChange={(event) => {
                    void choosePhoto(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <label htmlFor={inputId} aria-disabled={saving || processingImage} className={`mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#ff6400] ${saving || processingImage ? "pointer-events-none opacity-55" : ""} ${isDark ? "border-white/10 bg-white/[0.055] hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <ImagePlus className="h-4 w-4" />
                  {processingImage ? "Preparing photo..." : "Change photo"}
                </label>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span>Zoom</span>
                    <span className={isDark ? "text-white/45" : "text-slate-400"}>{draft.avatarZoom.toFixed(1)}×</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Minus className="h-3.5 w-3.5 opacity-45" />
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={draft.avatarZoom}
                      onChange={(event) => setDraft((current) => ({ ...current, avatarZoom: Number(event.target.value) }))}
                      className="h-11 min-w-0 flex-1 accent-[#ff6400]"
                      aria-label="Profile photo zoom"
                    />
                    <Plus className="h-3.5 w-3.5 opacity-45" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, avatarZoom: 1, avatarOffsetX: 0, avatarOffsetY: 0 }))}
                  className={`mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-[11px] font-semibold transition ${isDark ? "text-white/60 hover:bg-white/[0.06]" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  <LocateFixed className="h-3.5 w-3.5" /> Center photo
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-semibold">
                Full name
                <input
                  ref={nameRef}
                  value={draft.displayName}
                  maxLength={80}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, displayName: event.target.value }));
                    if (nameError) setNameError("");
                  }}
                  className={fieldClass}
                  placeholder="Your full name"
                  autoComplete="name"
                  required
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "profile-name-error" : undefined}
                />
                {nameError ? <span id="profile-name-error" className="mt-1.5 block text-[11px] text-rose-500">{nameError}</span> : null}
              </label>
              <label className="block text-xs font-semibold">
                Headline
                <input
                  value={draft.headline}
                  maxLength={100}
                  onChange={(event) => setDraft((current) => ({ ...current, headline: event.target.value }))}
                  className={fieldClass}
                  placeholder="Founder & Administrator"
                />
              </label>
              <label className="block text-xs font-semibold">
                Location
                <input
                  value={draft.location}
                  maxLength={100}
                  onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
                  className={fieldClass}
                  placeholder="Mauritius"
                  autoComplete="country-name"
                />
              </label>
              <label className="block text-xs font-semibold">
                Email
                <input value={email} readOnly className={`${fieldClass} cursor-not-allowed opacity-60`} />
              </label>
              <label className="block text-xs font-semibold">
                About
                <textarea
                  value={draft.bio}
                  maxLength={240}
                  rows={4}
                  onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                  className={`${fieldClass} h-auto min-h-24 resize-y py-3`}
                  placeholder="A short introduction for your administrator profile."
                />
                <span className={`mt-1 block text-right text-[10px] ${isDark ? "text-white/35" : "text-slate-400"}`}>{draft.bio.length}/240</span>
              </label>
            </div>
          </div>

          {error ? <div ref={errorRef} tabIndex={-1} role="alert" className={`mt-5 rounded-xl border px-3 py-2.5 text-xs font-semibold outline-none ${isDark ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{error}</div> : null}
        </div>

        <footer className={`flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 ${isDark ? "border-white/10 bg-[#0e1b14]" : "border-slate-200 bg-white"}`}>
          <button type="button" onClick={closeEditor} className={`min-h-11 flex-1 rounded-xl px-4 text-xs font-semibold transition sm:flex-none ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}>Cancel</button>
          <button type="button" onClick={() => void saveProfile()} disabled={saving || processingImage || !isDirty} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff6400] px-5 text-xs font-bold text-white transition hover:bg-[#e95b00] disabled:cursor-wait disabled:opacity-60 sm:flex-none">
            {saving ? "Saving..." : <><Check className="h-4 w-4" /> Save profile</>}
          </button>
        </footer>
      </section>
    </div>
  );
}
