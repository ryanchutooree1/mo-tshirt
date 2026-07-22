import sharp from "sharp";

const MAX_STORED_IMAGE_DIMENSION = 1600;
const OPTIMIZABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function prepareProductImage(file: File) {
  const original = Buffer.from(await file.arrayBuffer());
  const originalContentType = cleanString(file.type) || "application/octet-stream";
  const originalFilename = cleanString(file.name) || "product-image";

  if (!OPTIMIZABLE_IMAGE_TYPES.has(file.type)) {
    return {
      buffer: original,
      contentType: originalContentType,
      filename: originalFilename,
    };
  }

  const optimized = await sharp(original)
    .rotate()
    .resize({
      width: MAX_STORED_IMAGE_DIMENSION,
      height: MAX_STORED_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, alphaQuality: 90, effort: 4 })
    .toBuffer();

  if (optimized.byteLength >= original.byteLength) {
    return {
      buffer: original,
      contentType: originalContentType,
      filename: originalFilename,
    };
  }

  const baseName = originalFilename.replace(/\.[^.]+$/, "");
  return {
    buffer: optimized,
    contentType: "image/webp",
    filename: `${baseName}.webp`,
  };
}
