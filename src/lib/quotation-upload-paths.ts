export const QUOTATION_UPLOAD_BASE_PATH = "/api/quotation/uploads";
export const LEGACY_QUOTATION_UPLOAD_BASE_PATH = "/api/ai-assistant/uploads";
export const QUOTATION_UPLOAD_COLLECTION = "quotationUploads";
export const LEGACY_QUOTATION_UPLOAD_COLLECTION = "aiAssistantUploads";

export function normalizeQuotationUploadUrl(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(LEGACY_QUOTATION_UPLOAD_BASE_PATH, QUOTATION_UPLOAD_BASE_PATH);
}

export function getQuotationUploadUrl(uploadId: string) {
  return `${QUOTATION_UPLOAD_BASE_PATH}/${encodeURIComponent(uploadId)}`;
}
