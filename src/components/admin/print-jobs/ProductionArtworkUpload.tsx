"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import styles from "./tanvi-workflow.module.css";

const MAX_BYTES = 4 * 1024 * 1024;
type Props = {
  quoteId: string; expectedVersion: number; packetFingerprint: string; disabled: boolean;
  onUploaded: () => void; onBusyChange?: (busy: boolean) => void;
};
type Attempt = { requestId: string; file: File; quoteId: string; expectedVersion: number; packetFingerprint: string };

/** Small, explicit source upload control; deliberately safe to nest inside a form. */
export default function ProductionArtworkUpload(props: Props) {
  const [file, setFile] = useState<File | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null), attempt = useRef<Attempt | null>(null), locked = useRef(false), mounted = useRef(false);
  const current = useRef(props);
  current.current = props;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current.onBusyChange?.(false); }; }, []);
  const matches = (value: Attempt) => mounted.current && current.current.quoteId === value.quoteId && current.current.expectedVersion === value.expectedVersion && current.current.packetFingerprint === value.packetFingerprint;

  async function upload() {
    if (locked.current || props.disabled || !file || !confirmed) return;
    if (!file.size || file.size > MAX_BYTES) { setError("Choose a non-empty print file no larger than 4MB."); return; }
    if (!/\.(png|jpe?g|webp|pdf)$/i.test(file.name) || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) { setError("Use PNG, JPG, WEBP or a flattened PDF."); return; }
    if (attempt.current && (attempt.current.file !== file || !matches(attempt.current))) {
      setError("The job changed during this upload. Reload and review its files before adding another."); return;
    }
    const selected = attempt.current || { file, quoteId: props.quoteId, expectedVersion: props.expectedVersion, packetFingerprint: props.packetFingerprint, requestId: crypto.randomUUID() };
    attempt.current = selected;
    locked.current = true; setBusy(true); setError(""); props.onBusyChange?.(true);
    const form = new FormData();
    form.set("file", selected.file); form.set("role", "print-artwork");
    form.set("requestId", selected.requestId); form.set("expectedVersion", String(selected.expectedVersion)); form.set("packetFingerprint", selected.packetFingerprint);
    try {
      const response = await fetch(`/api/admin/print-jobs/${encodeURIComponent(selected.quoteId)}/artwork`, { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (matches(selected) && [400, 401, 403, 404, 413, 415].includes(response.status)) attempt.current = null;
        throw new Error(data?.error || "The upload was not confirmed. Retry the same file or reload and review the job.");
      }
      if (data?.ok !== true || data.quoteId !== selected.quoteId || data.requestId !== selected.requestId || typeof data.uploadId !== "string" || !data.uploadId || !/^file-[a-f0-9]{24}$/.test(data.fileKey) || !Number.isSafeInteger(data.version) || data.version <= selected.expectedVersion || !/^[a-f0-9]{64}$/.test(data.packetFingerprint)) throw new Error("The upload response could not be verified. Reload and review this job's files.");
      if (!matches(selected)) return;
      attempt.current = null; setFile(null); setConfirmed(false);
      if (picker.current) picker.current.value = "";
      current.current.onUploaded();
    } catch (failure) {
      if (matches(selected)) setError(failure instanceof Error ? failure.message : "The upload could not be confirmed. Reload and review this job.");
    } finally {
      locked.current = false;
      if (mounted.current) { setBusy(false); current.current.onBusyChange?.(false); }
    }
  }

  return <fieldset className={styles.packetArtwork} disabled={props.disabled || busy}>
    <legend>Add print file</legend>
    <p className={styles.packetHelp}>Add the original artwork supplied for this job. It stays unchanged. After uploading, save its placement and dimensions and renew the client price confirmation.</p>
    <label className={styles.field}>Original print file<input ref={picker} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" disabled={props.disabled || busy || Boolean(attempt.current)} onChange={(event) => { setFile(event.target.files?.[0] || null); setConfirmed(false); setError(""); }} /><span>PNG, JPG, WEBP or flattened PDF, up to 4MB. Existing originals stay saved.</span></label>
    {file && <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={props.disabled || busy || Boolean(attempt.current)} onChange={(event) => setConfirmed(event.target.checked)} /><span>This is print artwork for this job, not a mockup or payment document</span></label>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button type="button" className={styles.secondary} disabled={props.disabled || busy || !file || !confirmed} onClick={() => void upload()}><Upload size={15} />{busy ? "Adding print file…" : attempt.current ? "Retry same upload" : "Add print file"}</button>
  </fieldset>;
}
