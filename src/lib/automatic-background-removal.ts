"use client";

import type { Config } from "@imgly/background-removal";

type RGB = [number, number, number];

export type BackgroundRemovalProgress = {
  progress: number;
  label: string;
};

export type AutomaticBackgroundRemovalResult = {
  blob: Blob;
  method: "already-transparent" | "solid-color" | "ai";
};

export type AutomaticBackgroundRemovalOptions = {
  forceAi?: boolean;
};

const SOLID_TOLERANCE = 38;
const SOLID_FEATHER = 18;

function colorDistance(left: RGB, right: RGB) {
  const red = left[0] - right[0];
  const green = left[1] - right[1];
  const blue = left[2] - right[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function averageColors(colors: RGB[]) {
  if (!colors.length) return [0, 0, 0] as RGB;
  const total = colors.reduce(
    (sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]],
    [0, 0, 0]
  );
  return total.map((value) => Math.round(value / colors.length)) as RGB;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the transparent PNG."));
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
      reject(new Error("Could not read this logo."));
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
  const colors: RGB[] = [];
  for (let y = startY; y < Math.min(height, startY + sampleSize); y += 1) {
    for (let x = startX; x < Math.min(width, startX + sampleSize); x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 20) continue;
      colors.push([data[index], data[index + 1], data[index + 2]]);
    }
  }
  return averageColors(colors);
}

function inspectImage(imageData: ImageData) {
  const { data, width, height } = imageData;
  const sampleSize = Math.max(4, Math.min(48, Math.round(Math.min(width, height) * 0.05)));
  const corners: RGB[] = [
    getCornerAverage(data, width, height, 0, 0, sampleSize),
    getCornerAverage(data, width, height, width - sampleSize, 0, sampleSize),
    getCornerAverage(data, width, height, 0, height - sampleSize, sampleSize),
    getCornerAverage(data, width, height, width - sampleSize, height - sampleSize, sampleSize),
  ];
  const backgroundColor = averageColors(corners);
  let transparentPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 245) transparentPixels += 1;
  }

  return {
    backgroundColor,
    cornerSpread: Math.max(...corners.map((color) => colorDistance(color, backgroundColor))),
    transparentRatio: transparentPixels / Math.max(1, width * height),
  };
}

async function trimTransparentPixels(blob: Blob, padding = 18) {
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
      if (data[(y * width + x) * 4 + 3] <= 8) continue;
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
  const output = document.createElement("canvas");
  output.width = maxX - minX + 1;
  output.height = maxY - minY + 1;
  const outputContext = output.getContext("2d");
  if (!outputContext) return blob;
  outputContext.drawImage(
    canvas,
    minX,
    minY,
    output.width,
    output.height,
    0,
    0,
    output.width,
    output.height
  );
  return canvasToBlob(output);
}

async function prepareImage(file: File) {
  const isHeic = /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (!isHeic) return file;
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({ blob: file, toType: "image/png", quality: 1 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return new File([blob], `${file.name.replace(/\.(heic|heif)$/i, "") || "logo"}.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

async function removeSolidBackground(file: File) {
  const image = await loadImageFromBlob(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available.");

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const stats = inspectImage(imageData);
  if (stats.transparentRatio > 0.005) {
    return {
      blob: await trimTransparentPixels(await canvasToBlob(canvas)),
      method: "already-transparent" as const,
      cornerSpread: stats.cornerSpread,
    };
  }

  const fadeEnd = SOLID_TOLERANCE + SOLID_FEATHER;
  for (let index = 0; index < imageData.data.length; index += 4) {
    const distance = colorDistance(
      [imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]],
      stats.backgroundColor
    );
    if (distance <= SOLID_TOLERANCE) {
      imageData.data[index + 3] = 0;
    } else if (distance <= fadeEnd) {
      const opacity = (distance - SOLID_TOLERANCE) / SOLID_FEATHER;
      imageData.data[index + 3] = Math.round(imageData.data[index + 3] * opacity);
    }
  }
  context.putImageData(imageData, 0, 0);
  return {
    blob: await trimTransparentPixels(await canvasToBlob(canvas)),
    method: "solid-color" as const,
    cornerSpread: stats.cornerSpread,
  };
}

export function canAutomaticallyRemoveBackground(file: Pick<File, "name" | "type">) {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|svg|heic|heif)$/i.test(file.name)
  );
}

export async function removeBackgroundAutomatically(
  input: File,
  onProgress?: (update: BackgroundRemovalProgress) => void,
  options: AutomaticBackgroundRemovalOptions = {}
): Promise<AutomaticBackgroundRemovalResult> {
  onProgress?.({ progress: 0.04, label: "Preparing logo" });
  const file = await prepareImage(input);
  onProgress?.({ progress: 0.12, label: "Finding background" });
  const solidResult = await removeSolidBackground(file);
  if (solidResult.method === "already-transparent") {
    onProgress?.({ progress: 1, label: "Already transparent" });
    return { blob: solidResult.blob, method: solidResult.method };
  }
  if (!options.forceAi && solidResult.cornerSpread <= 42) {
    onProgress?.({ progress: 1, label: "Transparent PNG ready" });
    return { blob: solidResult.blob, method: solidResult.method };
  }

  onProgress?.({ progress: 0.18, label: "Loading AI cutout" });
  const { removeBackground } = await import("@imgly/background-removal");
  const config: Config = {
    model: "isnet_quint8",
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      const ratio = total > 0 ? current / total : 0;
      onProgress?.({
        progress: Math.max(0.2, Math.min(0.92, 0.2 + ratio * 0.72)),
        label: key.includes("model") ? "Loading AI model" : "Removing background",
      });
    },
  };
  const blob = await removeBackground(file, config);
  onProgress?.({ progress: 0.96, label: "Finishing edges" });
  const trimmed = await trimTransparentPixels(blob);
  onProgress?.({ progress: 1, label: "Transparent PNG ready" });
  return { blob: trimmed, method: "ai" };
}
