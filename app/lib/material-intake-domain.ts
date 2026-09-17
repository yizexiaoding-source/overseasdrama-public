import type { AdxMetrics } from "./inspiration-material-store";

export type IntakeMedia = {
  mediaKind: "image" | "video";
  materialType: "poster_image" | "undetermined";
  fileField: "image" | "video";
};

const mimeExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

export function classifyIntakeMedia(mimeType: unknown): IntakeMedia | null {
  const mime = typeof mimeType === "string" ? mimeType.toLowerCase().split(";")[0].trim() : "";
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) return { mediaKind: "image", materialType: "poster_image", fileField: "image" };
  if (["video/mp4", "video/quicktime", "video/webm"].includes(mime)) return { mediaKind: "video", materialType: "undetermined", fileField: "video" };
  return null;
}

export function extensionForMime(mimeType: unknown): string {
  const mime = typeof mimeType === "string" ? mimeType.toLowerCase().split(";")[0].trim() : "";
  return mimeExtensions[mime] ?? "";
}

export function normalizeAdxMetrics(input: Record<string, unknown>): AdxMetrics {
  const output: AdxMetrics = {};
  const numericKeys = ["spend", "impressions", "clicks", "ctr", "days"] as const;
  for (const key of numericKeys) {
    const raw = input[key];
    if (raw === "" || raw === null || raw === undefined) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) output[key] = value;
  }
  if (typeof input.currency === "string" && input.currency.trim()) output.currency = input.currency.trim();
  if (typeof input.updatedAt === "string" && input.updatedAt.trim()) output.updatedAt = input.updatedAt.trim();
  return output;
}
