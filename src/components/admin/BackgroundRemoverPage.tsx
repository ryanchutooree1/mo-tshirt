"use client";

import {
  Check,
  Download,
  Eraser,
  FileImage,
  ImageDown,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
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
type RemovalMode = "smart" | "solid" | "ai";

type SolidBackgroundOptions = {
  tolerance: number;
  feather: number;
  trim: boolean;
};

type ImageStats = {
  width: number;
  height: number;
  backgroundColor: [number, number, number];
  cornerSpread: number;
};

const MAX_IMAGE_SIZE = 24 * 1024 * 1024;
const DEFAULT_TOLERANCE = 38;
const DEFAULT_FEATHER = 18;

const CHECKER_CLASS =
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

function isHeicFile(file: File) {
  return /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function prepareUploadImage(file: File) {
  if (!isHeicFile(file)) return file;

  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/png",
    quality: 1,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const convertedName = file.name.replace(/\.(heic|heif)$/i, "") || "converted-image";

  return new File([blob], `${convertedName}.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

function colorDistance(
  left: [number, number, number],
  right: [number, number, number]
) {
  const red = left[0] - right[0];
  const green = left[1] - right[1];
  const blue = left[2] - right[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function averageColors(colors: [number, number, number][]) {
  const total = colors.reduce(
    (sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]],
    [0, 0, 0]
  );

  return total.map((value) => Math.round(value / Math.max(1, colors.length))) as [
    number,
    number,
    number,
  ];
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export PNG."));
    }, "image/png");
  });
}

function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image."));
    };
    image.src = url;
  });
}

function getCornerAverage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  sampleSize: number
) {
  const colors: [number, number, number][] = [];

  for (let y = startY; y < Math.min(height, startY + sampleSize); y += 1) {
    for (let x = startX; x < Math.min(width, startX + sampleSize); x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 20) continue;
      colors.push([data[index], data[index + 1], data[index + 2]]);
    }
  }

  return averageColors(colors);
}

function getImageStats(imageData: ImageData) {
  const { data, width, height } = imageData;
  const sampleSize = Math.max(4, Math.min(48, Math.round(Math.min(width, height) * 0.05)));
  const cornerColors: [number, number, number][] = [
    getCornerAverage(data, width, height, 0, 0, sampleSize),
    getCornerAverage(data, width, height, width - sampleSize, 0, sampleSize),
    getCornerAverage(data, width, height, 0, height - sampleSize, sampleSize),
    getCornerAverage(data, width, height, width - sampleSize, height - sampleSize, sampleSize),
  ];
  const backgroundColor = averageColors(cornerColors);
  const cornerSpread = Math.max(
    ...cornerColors.map((color) => colorDistance(color, backgroundColor))
  );

  return {
    width,
    height,
    backgroundColor,
    cornerSpread,
  } satisfies ImageStats;
}

async function removeSolidBackground(file: File, options: SolidBackgroundOptions) {
  const image = await loadImageFromBlob(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available.");

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const stats = getImageStats(imageData);
  const { data } = imageData;
  const fadeEnd = options.tolerance + options.feather;

  for (let index = 0; index < data.length; index += 4) {
    const distance = colorDistance(
      [data[index], data[index + 1], data[index + 2]],
      stats.backgroundColor
    );

    if (distance <= options.tolerance) {
      data[index + 3] = 0;
    } else if (distance <= fadeEnd) {
      const opacity = (distance - options.tolerance) / Math.max(1, options.feather);
      data[index + 3] = Math.round(data[index + 3] * opacity);
    }
  }

  context.putImageData(imageData, 0, 0);
  const output = await canvasToBlob(canvas);
  return {
    blob: options.trim ? await trimTransparentPixels(output, 18) : output,
    stats,
  };
}

async function trimTransparentPixels(blob: Blob, padding: number) {
  const image = await loadImageFromBlob(blob);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return blob;

  context.drawImage(image, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) return blob;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = maxX - minX + 1;
  trimmedCanvas.height = maxY - minY + 1;
  const trimmedContext = trimmedCanvas.getContext("2d");
  if (!trimmedContext) return blob;

  trimmedContext.drawImage(
    canvas,
    minX,
    minY,
    trimmedCanvas.width,
    trimmedCanvas.height,
    0,
    0,
    trimmedCanvas.width,
    trimmedCanvas.height
  );

  return canvasToBlob(trimmedCanvas);
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
  const [mode, setMode] = useState<RemovalMode>("smart");
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);
  const [trim, setTrim] = useState(true);
  const [outputMeta, setOutputMeta] = useState("");

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
    setOutputMeta("");
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
    async (file: File) => {
      setError(null);
      setStatusText("Preparing image");

      if (!isImageFile(file) && !isHeicFile(file)) {
        setProcessState("error");
        setStatusText("Unsupported file");
        setError("Choose an image file.");
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setProcessState("error");
        setStatusText("File too large");
        setError("Choose an image under 24 MB.");
        return;
      }

      let preparedFile: File;
      try {
        preparedFile = await prepareUploadImage(file);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Could not convert this image.";
        setProcessState("error");
        setStatusText("Could not read image");
        setError(message);
        return;
      }

      clearResult();
      setSelectedFile(preparedFile);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(preparedFile);
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

  async function runAiRemoval() {
    if (!selectedFile) throw new Error("No image selected.");

    setStatusText("Loading AI model");
    const { removeBackground: imglyRemoveBackground } = await import("@imgly/background-removal");
    const config: Config = {
      model: "isnet_quint8",
      output: {
        format: "image/png",
        quality: 1,
      },
      progress: (key, current, total) => {
        const ratio = total > 0 ? current / total : 0;
        setProgress(Math.max(0.08, Math.min(0.9, ratio)));
        setStatusText(key.includes("model") ? "Downloading model" : "Processing image");
      },
    };
    const blob = await imglyRemoveBackground(selectedFile, config);
    return trim ? trimTransparentPixels(blob, 18) : blob;
  }

  async function removeBackground() {
    if (!selectedFile) return;

    setProcessState("processing");
    setError(null);
    setProgress(0.04);
    setStatusText("Preparing image");
    clearResult();

    try {
      let blob: Blob;
      let meta = "";

      if (mode === "ai") {
        blob = await runAiRemoval();
        meta = "AI cutout";
      } else {
        const solidResult = await removeSolidBackground(selectedFile, {
          tolerance,
          feather: DEFAULT_FEATHER,
          trim,
        });
        blob = solidResult.blob;
        meta = `Solid color - ${solidResult.stats.width} x ${solidResult.stats.height}`;
        setProgress(0.95);

        if (mode === "smart" && solidResult.stats.cornerSpread > 42) {
          blob = await runAiRemoval();
          meta = "Smart AI cutout";
        }
      }

      const objectUrl = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(objectUrl);
      setOutputMeta(`${meta} - ${formatFileSize(blob.size)}`);
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
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white text-slate-950 shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[380px_1fr]">
          <aside className="border-b border-slate-200 p-5 sm:p-6 xl:border-r xl:border-b-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
                  <Eraser className="h-4 w-4" />
                  MO Studio Tool
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
                  Background Remover
                </h1>
              </div>
              <button
                type="button"
                onClick={resetTool}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
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
              className={`mt-6 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed p-5 text-center transition ${
                isDragging
                  ? "border-rose-500 bg-rose-50"
                  : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onInputChange}
              />
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white">
                <UploadCloud className="h-6 w-6" />
              </span>
              <span className="mt-4 text-base font-semibold text-slate-950">
                Drop image or click to upload
              </span>
              <span className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                {fileMeta}
              </span>
            </label>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <SlidersHorizontal className="h-4 w-4" />
                Controls
              </div>

              <div className="mt-4 grid grid-cols-3 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
                {[
                  ["smart", "Smart"],
                  ["solid", "Logo"],
                  ["ai", "Photo"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value as RemovalMode)}
                    className={`rounded-full px-3 py-2 transition ${
                      mode === value
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-950"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="mt-4 block">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <span>Tolerance</span>
                  <span>{tolerance}</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="120"
                  step="1"
                  value={tolerance}
                  disabled={mode === "ai"}
                  onChange={(event) => setTolerance(Number(event.target.value))}
                  className="mt-3 w-full accent-rose-500 disabled:opacity-40"
                />
              </label>

              <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800">
                <span>Trim transparent edges</span>
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                    trim ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white"
                  }`}
                >
                  {trim ? <Check className="h-4 w-4" /> : null}
                </span>
                <input
                  type="checkbox"
                  checked={trim}
                  onChange={(event) => setTrim(event.target.checked)}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {statusText}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {outputMeta || "PNG export with transparent background"}
                  </div>
                </div>
                <div className="font-mono text-xs text-slate-500">
                  {Math.round(progress * 100)}%
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              {error ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <button
                type="button"
                onClick={removeBackground}
                disabled={!canProcess}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
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
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Download PNG
              </button>
            </div>
          </aside>

          <div className="grid min-h-[620px] gap-0 lg:grid-cols-2">
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
    <section className="flex min-h-[310px] flex-col border-t border-slate-200 lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {icon}
          {title}
        </div>
      </div>
      <div
        className={`flex flex-1 items-center justify-center overflow-hidden p-5 ${
          checker ? CHECKER_CLASS : "bg-white"
        }`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[560px] max-w-full object-contain"
          />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-sm font-semibold text-slate-400">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}
