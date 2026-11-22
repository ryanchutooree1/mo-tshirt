"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ImageUp, Loader2 } from "lucide-react";
import type { PrintJobVisual } from "@/lib/print-job-visuals";
import styles from "./print-jobs.module.css";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type Side = "front" | "back";
type Attempt = {
  file: File;
  quoteId: string;
  requestId: string;
  side: Side;
};

type Props = {
  quoteId: string;
  mockups: PrintJobVisual[];
  disabled?: boolean;
  onUploaded: () => void;
};

export default function FinalMockupUpload({ quoteId, mockups, disabled = false, onUploaded }: Props) {
  const [side, setSide] = useState<Side>("front");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const currentQuoteId = useRef(quoteId);
  const requests = useRef(new Set<AbortController>());
  currentQuoteId.current = quoteId;

  useEffect(() => {
    const pendingRequests = requests.current;
    for (const request of pendingRequests) request.abort();
    pendingRequests.clear();
    attempt.current = null;
    setBusy(false);
    setError("");
    setSuccess("");
    if (picker.current) picker.current.value = "";
    return () => {
      for (const request of pendingRequests) request.abort();
      pendingRequests.clear();
    };
  }, [quoteId]);

  function chooseSide(nextSide: Side) {
    if (busy || disabled) return;
    side !== nextSide && (attempt.current = null);
    setSide(nextSide);
    setError("");
    setSuccess("");
    if (picker.current) picker.current.value = "";
  }

  async function upload(selected: Attempt) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData();
    form.set("file", selected.file);
    form.set("side", selected.side);
    form.set("requestId", selected.requestId);
    const controller = new AbortController();
    requests.current.add(controller);

    try {
      const response = await fetch(`/api/admin/print-jobs/${encodeURIComponent(selected.quoteId)}/mockup`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted || currentQuoteId.current !== selected.quoteId) return;
      if (!response.ok) {
        if ([400, 401, 403, 404, 409, 413, 415].includes(response.status)) attempt.current = null;
        throw new Error(data?.error || "The mockup upload could not be confirmed. Please retry.");
      }
      if (data?.ok !== true || data.quoteId !== selected.quoteId || data.requestId !== selected.requestId) {
        throw new Error("The upload response could not be verified. Reload the order before trying again.");
      }
      attempt.current = null;
      if (picker.current) picker.current.value = "";
      setSuccess(`${selected.side === "front" ? "Front" : "Back"} mockup uploaded.`);
      onUploaded();
    } catch (failure) {
      if (controller.signal.aborted || currentQuoteId.current !== selected.quoteId) return;
      setError(failure instanceof Error ? failure.message : "The mockup upload could not be confirmed. Please retry.");
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted && currentQuoteId.current === selected.quoteId) setBusy(false);
    }
  }

  function selectFile(file: File | undefined) {
    if (!file || busy || disabled) return;
    if (!file.size || file.size > MAX_BYTES) {
      setError("Choose a non-empty mockup no larger than 4MB.");
      if (picker.current) picker.current.value = "";
      return;
    }
    if (!ALLOWED_TYPES.has(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setError("Use a PNG, JPG or WEBP image.");
      if (picker.current) picker.current.value = "";
      return;
    }
    const selected = { file, quoteId, side, requestId: crypto.randomUUID() };
    attempt.current = selected;
    void upload(selected);
  }

  const hasMockup = mockups.some(mockup => mockup.adminUploaded);
  const uploadLabel = hasMockup ? "Replace / add" : "Upload final mockup";

  return <section className={styles.mockupUploadBar} aria-label="Final mockup upload">
    <div className={styles.mockupUploadCopy}>
      <strong>Final mockup</strong>
      <span data-state={hasMockup ? "uploaded" : "needed"}>{hasMockup && <CheckCircle2 size={13} aria-hidden="true" />}{hasMockup ? "Mockup uploaded — replace it or add the other side." : "Attach the approved design so Tanvi can see it on this order."}</span>
    </div>
    <div className={styles.mockupUploadControls}>
      <div className={styles.mockupSideChoice} role="group" aria-label="Mockup side">
        {(["front", "back"] as const).map((value) => <button key={value} type="button" aria-pressed={side === value} disabled={disabled || busy} onClick={() => chooseSide(value)}>{value === "front" ? "Front" : "Back"}</button>)}
      </div>
      <input ref={picker} hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" disabled={disabled || busy} aria-label={`${side === "front" ? "Front" : "Back"} final mockup file`} onChange={(event) => selectFile(event.target.files?.[0])} />
      <button type="button" className={styles.mockupUploadButton} disabled={disabled || busy} onClick={() => attempt.current ? void upload(attempt.current) : picker.current?.click()}>
        {busy ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : success ? <CheckCircle2 size={16} aria-hidden="true" /> : <ImageUp size={16} aria-hidden="true" />}
        {busy ? "Uploading…" : attempt.current ? "Retry upload" : uploadLabel}
      </button>
    </div>
    {(error || success) && <p className={styles.mockupUploadNotice} role={error ? "alert" : "status"}>{error || success}</p>}
  </section>;
}
