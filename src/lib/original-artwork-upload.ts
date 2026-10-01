import type { AutomaticBackgroundRemovalResult } from "./automatic-background-removal";
import { uploadPublicArtwork } from "./public-artwork-upload";

export type BackgroundRemovalMethod = AutomaticBackgroundRemovalResult["method"];
export type OriginalArtworkSource = Readonly<{ file: File }>;
export type ArtworkSelection = {
  source: OriginalArtworkSource;
  file: File;
  backgroundRemovalMethod?: BackgroundRemovalMethod;
};
export type ArtworkUploadCache = Map<File, ReturnType<typeof uploadPublicArtwork>>;

// A new source identity invalidates every result from the previous selection,
// including when the same File object is selected again.
export function selectOriginalArtwork(file: File): ArtworkSelection {
  return { source: Object.freeze({ file }), file };
}

export function applyArtworkResult(
  current: ArtworkSelection | null,
  source: OriginalArtworkSource,
  file: File,
  method?: BackgroundRemovalMethod
): ArtworkSelection | null {
  if (!current || current.source !== source) return current;
  return { source, file, ...(file !== source.file && method ? { backgroundRemovalMethod: method } : {}) };
}

export function validateArtworkUploadBatch(selections: ArtworkSelection[], extraFiles: File[] = []) {
  if (selections.length + extraFiles.length > 12) {
    throw new Error("Too many files. Send up to 12 artwork attachments.");
  }
  const files = new Set([...selections.flatMap(({ source, file }) => [source.file, file]), ...extraFiles]);
  let totalBytes = 0;
  for (const file of files) {
    if (!file.size || file.size > 5 * 1024 * 1024) {
      throw new Error("Artwork files must be non-empty and no larger than 5MB each.");
    }
    totalBytes += file.size;
  }
  if (totalBytes > 15 * 1024 * 1024) {
    throw new Error("Original and prepared artwork files exceed 15MB in total. Use smaller files and try again.");
  }
}

export async function uploadArtworkWithOriginal(input: {
  selection: ArtworkSelection;
  sessionId: string;
  maxBytes: number;
  uploadCache?: ArtworkUploadCache;
}) {
  const { selection, maxBytes, sessionId } = input;
  const originalFile = selection.source.file;
  for (const file of [originalFile, selection.file]) {
    if (!file.size || file.size > maxBytes) {
      throw new Error(`Artwork files must be non-empty and no larger than ${maxBytes / 1024 / 1024}MB.`);
    }
  }
  // Keep the untouched source even when processing failed or was never requested.
  const upload = (file: File) => {
    const cached = input.uploadCache?.get(file);
    if (cached) return cached;
    const pending = uploadPublicArtwork({ file, filename: file.name, sessionId });
    input.uploadCache?.set(file, pending);
    return pending;
  };
  const original = (await upload(originalFile)).attachment;
  const displayed = selection.file === originalFile ? original : (await upload(selection.file)).attachment;
  return {
    url: displayed.url,
    filename: displayed.name,
    contentType: displayed.contentType,
    size: displayed.size,
    originalUrl: original.url,
    originalFilename: original.name,
    originalContentType: original.contentType,
    originalSize: original.size,
    originalProvenance: "client-upload" as const,
    ...(selection.file !== originalFile && selection.backgroundRemovalMethod
      ? { backgroundRemovalMethod: selection.backgroundRemovalMethod }
      : {}),
  };
}
