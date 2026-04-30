"use client";

import {
  Download,
  Eraser,
  FileImage,
  ImageDown,
  LoaderCircle,
  RefreshCw,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { Config } from "@imgly/background-removal";

type ProcessState = "idle" | "ready" | "processing" | "done" | "error";

const MAX_IMAGE_SIZE = 18 * 1024 * 1024;

const SAMPLE_CHECKER =
  "bg-[linear-gradient(45deg,#d7dee8_25%,transparent_25%),linear-gradient(-45deg,#d7dee8_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d7dee8_75%),linear-gradient(-45deg,transparent_75%,#d7dee8_75%)] bg-[length:22px_22px] bg-[position:0_0,0_11px,11px_-11px,-11px_0]";

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getDownloadName(file: File | null) {
  const base = file?.name.replace(/\.[^.]+$/, "") || "mo-background-removed";
  return `${base}-transparent.png`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export default function BackgroundRemoverPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [processState, setProcessState] = useState<ProcessState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Select an image");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [previewUrl, resultUrl]);

  const fileMeta = useMemo(() => {
    if (!selectedFile) return "PNG, JPG, WebP, or HEIC";
    return `${selectedFile.name} - ${formatFileSize(selectedFile.size)}`;
  }, [selectedFile]);

  const canProcess = selectedFile && processState !== "processing";
  const canDownload = Boolean(resultBlob && resultUrl);

  const clearResult = useCallback(() => {
    setResultBlob(null);
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  const resetTool = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    clearResult();
    setProcessState("idle");
    setProgress(0);
    setStatusText("Select an image");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [clearResult]);

  const loadFile = useCallback(
    (file: File) => {
      setError(null);

      if (!isImageFile(file)) {
        setProcessState("error");
        setStatusText("Unsupported file");
        setError("Choose an image file.");
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setProcessState("error");
        setStatusText("File too large");
        setError("Choose an image under 18 MB.");
        return;
      }

      clearResult();
      setSelectedFile(file);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      setProcessState("ready");
      setProgress(0);
      setStatusText("Ready to remove background");
    },
    [clearResult]
  );

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  async function removeBackground() {
    if (!selectedFile) return;

    setProcessState("processing");
    setError(null);
    setProgress(0.05);
    setStatusText("Loading background remover");
    clearResult();

    try {
      const { removeBackground: imglyRemoveBackground } = await import("@imgly/background-removal");
      const config: Config = {
        model: "isnet_quint8",
        output: {
          format: "image/png",
          quality: 1,
        },
        progress: (key, current, total) => {
          const ratio = total > 0 ? current / total : 0;
          setProgress(Math.max(0.06, Math.min(0.92, ratio)));
          setStatusText(key.includes("model") ? "Downloading model" : "Processing image");
        },
      };

      const blob = await imglyRemoveBackground(selectedFile, config);
      const objectUrl = URL.createObjectURL(blob);

      setResultBlob(blob);
      setResultUrl(objectUrl);
      setProgress(1);
      setProcessState("done");
      setStatusText("Background removed");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Background removal failed.";
      setProcessState("error");
      setStatusText("Could not remove background");
      setError(message);
      setProgress(0);
    }
  }

  function downloadResult() {
    if (!resultUrl) return;
    const anchor = document.createElement("a");
    anchor.href = resultUrl;
    anchor.download = getDownloadName(selectedFile);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        <div className="grid gap-0 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="border-b border-slate-200 p-5 sm:p-6 lg:border-r lg:border-b-0 dark:border-slate-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-600 dark:text-cyan-300">
                  <Eraser className="h-4 w-4" />
                  MO Studio Tool
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl dark:text-white">
                  Background Remover
                </h1>
              </div>
              <button
                type="button"
                onClick={resetTool}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Reset"
                title="Reset"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            <label
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`mt-6 flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed p-6 text-center transition ${
                isDragging
                  ? "border-rose-500 bg-rose-50 dark:border-cyan-300 dark:bg-cyan-400/10"
                  : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-600"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onInputChange}
              />
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <UploadCloud className="h-7 w-7" />
              </span>
              <span className="mt-5 text-base font-semibold text-slate-950 dark:text-white">
                Drop image or click to upload
              </span>
              <span className="mt-2 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
                {fileMeta}
              </span>
            </label>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {statusText}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    First run downloads the image model in the browser.
                  </div>
                </div>
                <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {Math.round(progress * 100)}%
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-300 dark:bg-cyan-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              {error ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200">
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={removeBackground}
                disabled={!canProcess}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              >
                {processState === "processing" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Remove Background
              </button>
              <button
                type="button"
                onClick={downloadResult}
                disabled={!canDownload}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
              >
                <Download className="h-4 w-4" />
                Download PNG
              </button>
            </div>
          </div>

          <div className="grid min-h-[640px] gap-0 md:grid-cols-2">
            <PreviewPanel
              title="Original"
              icon={<FileImage className="h-4 w-4" />}
              imageUrl={previewUrl}
              emptyLabel="Upload image"
            />
            <PreviewPanel
              title="Transparent PNG"
              icon={<ImageDown className="h-4 w-4" />}
              imageUrl={resultUrl}
              emptyLabel="Run remover"
              checker
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewPanel({
  title,
  icon,
  imageUrl,
  emptyLabel,
  checker = false,
}: {
  title: string;
  icon: React.ReactNode;
  imageUrl: string | null;
  emptyLabel: string;
  checker?: boolean;
}) {
  return (
    <section className="flex min-h-[320px] flex-col border-t border-slate-200 md:border-t-0 md:border-l dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {icon}
          {title}
        </div>
      </div>
      <div
        className={`flex flex-1 items-center justify-center p-4 ${
          checker ? SAMPLE_CHECKER : "bg-slate-50 dark:bg-slate-950"
        }`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[520px] w-full max-w-full object-contain"
          />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-sm font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-500">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}
