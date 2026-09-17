export type QwenContentPart =
  | { type: "text"; text: string }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "video"; video: string[]; fps: number }
  | { type: "image_url"; image_url: { url: string } };

export function buildQwenMultimodalContent(input: {
  text: string;
  videoDataUrl?: string;
  videoFrames?: string[];
  videoFramesPerSecond?: number;
  imageDataUrl?: string;
}): QwenContentPart[] {
  const parts: QwenContentPart[] = [{ type: "text", text: input.text }];
  if (input.videoDataUrl) parts.push({ type: "video_url", video_url: { url: input.videoDataUrl } });
  else if (input.videoFrames?.length) parts.push({ type: "video", video: input.videoFrames, fps: input.videoFramesPerSecond || 1 });
  if (input.imageDataUrl) parts.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
  return parts;
}

export function pocketBaseFileUrl(
  baseUrl: string,
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  const collectionId = String(record.collectionId || record.collectionName || "");
  const id = String(record.id || "");
  const filename = String(record[field] || "");
  if (!collectionId || !id || !filename) return undefined;
  return `${baseUrl.replace(/\/$/, "")}/api/files/${encodeURIComponent(collectionId)}/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`;
}
