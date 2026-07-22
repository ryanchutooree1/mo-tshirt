"use client";

import { removeBackgroundAutomatically } from "@/lib/automatic-background-removal";
import type { ShopImageViewKey } from "@/lib/shops";

export type StudioImageViewKey = Extract<ShopImageViewKey, "front" | "back">;

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const STUDIO_OUTPUT_MAX_BYTES = MAX_UPLOAD_BYTES - 128 * 1024;
const STUDIO_CANVAS_SIZES = [1400, 1200, 1000] as const;

export function getStudioImageField(view: StudioImageViewKey) {
  return view === "front" ? "studioPhotoUrl" : "studioBackPhotoUrl";
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create the transparent studio image."));
    }, "image/png");
  });
}

function loadBlobImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the prepared studio image."));
    };
    image.src = url;
  });
}

async function placeOnStudioCanvas(blob: Blob, canvasSize: number) {
  const image = await loadBlobImage(blob);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const context = canvas.getContext("2d");
  if (!context || !sourceWidth || !sourceHeight) {
    throw new Error("Could not standardize the transparent studio image.");
  }

  const maximumGarmentSize = canvasSize * 0.88;
  const scale = Math.min(maximumGarmentSize / sourceWidth, maximumGarmentSize / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  const x = Math.round((canvasSize - width) / 2);
  const y = Math.round((canvasSize - height) / 2);
  context.clearRect(0, 0, canvasSize, canvasSize);
  context.drawImage(image, x, y, width, height);
  return canvasToPngBlob(canvas);
}

function getStudioFilename(filename: string, view: StudioImageViewKey) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "garment";
  return `${base}-${view}-studio-transparent.png`;
}

export async function prepareStudioImageFile(
  source: File,
  view: StudioImageViewKey,
  onProgress: (label: string) => void
) {
  const cutout = await removeBackgroundAutomatically(
    source,
    ({ label }) => onProgress(label.replace(/logo/gi, "garment")),
    { forceAi: true }
  );

  let output = cutout.blob;
  for (const canvasSize of STUDIO_CANVAS_SIZES) {
    onProgress(`Standardizing ${canvasSize}px studio canvas`);
    output = await placeOnStudioCanvas(cutout.blob, canvasSize);
    if (output.size <= STUDIO_OUTPUT_MAX_BYTES) break;
  }
  if (output.size > STUDIO_OUTPUT_MAX_BYTES) {
    throw new Error("The transparent studio image is still larger than 6 MB.");
  }

  return new File([output], getStudioFilename(source.name, view), {
    type: "image/png",
    lastModified: Date.now(),
  });
}

export async function downloadShopImage(url: string, title: string, view: StudioImageViewKey) {
  const resolvedUrl = new URL(url, window.location.origin);
  const downloadUrl =
    resolvedUrl.origin === window.location.origin
      ? resolvedUrl.toString()
      : `/api/admin/shops/image-source?url=${encodeURIComponent(resolvedUrl.toString())}`;
  const response = await fetch(downloadUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Could not download the ${view} photo for ${title}.`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error(`${title} ${view} is not an image.`);
  const pathname = resolvedUrl.pathname;
  const sourceName = decodeURIComponent(pathname.split("/").pop() || `${title}-${view}.png`);
  return new File([blob], sourceName, { type: blob.type, lastModified: Date.now() });
}
