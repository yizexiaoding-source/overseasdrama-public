import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type QwenVideoInput = {
  videoDataUrl?: string;
  videoFrames?: string[];
  videoFramesPerSecond?: number;
  frameTimeline?: Array<{ index: number; atSeconds: number }>;
};

type Options = {
  url?: string;
  contentHash?: string;
  sourceContentHash?: string;
  startSeconds?: number;
  endSeconds?: number;
  inlineMaxBytes?: number;
  maxFrames?: number;
};

type FrameManifestRow = {
  path?: unknown;
  timecode?: { start?: unknown; end?: unknown };
};

const INLINE_VIDEO_BYTES = 6_500_000;
const MAX_FRAMES = 32;
const CACHE_ROOT = path.resolve(process.cwd(), "analysis_cache", "materials", "by-content-hash");

function boundedNumber(value: unknown, fallback: number, minimum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function safeHash(value: unknown) {
  const hash = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

function selectEvenly<T>(items: T[], wanted: number) {
  if (items.length <= wanted) return items;
  return Array.from({ length: wanted }, (_, index) => items[Math.round(index * (items.length - 1) / (wanted - 1))]);
}

async function loadCachedFrames(options: Options): Promise<QwenVideoInput | undefined> {
  const hashes = [safeHash(options.contentHash), safeHash(options.sourceContentHash)].filter((hash, index, all) => hash && all.indexOf(hash) === index);
  if (!hashes.length) return undefined;

  const startSeconds = Math.max(0, boundedNumber(options.startSeconds, 0, 0));
  const requestedEnd = boundedNumber(options.endSeconds, startSeconds + 15, startSeconds + 0.1);
  const endSeconds = Math.max(startSeconds + 0.1, requestedEnd);
  const maxFrames = Math.max(4, Math.min(64, Math.floor(boundedNumber(options.maxFrames, MAX_FRAMES, 4))));

  for (const hash of hashes) {
    try {
      const assetRoot = path.resolve(CACHE_ROOT, hash);
      if (!assetRoot.startsWith(`${CACHE_ROOT}${path.sep}`)) continue;
      const manifestPath = path.join(assetRoot, "frames-v2.json");
      if (!existsSync(manifestPath)) continue;
      const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as { data?: unknown };
      if (!Array.isArray(parsed.data)) continue;

      const candidates = (parsed.data as FrameManifestRow[])
        .map((frame) => ({
          atSeconds: Number(frame.timecode?.start),
          filePath: path.resolve(assetRoot, String(frame.path || "")),
        }))
        .filter((frame) => Number.isFinite(frame.atSeconds)
          && frame.atSeconds >= startSeconds - 0.12
          && frame.atSeconds <= endSeconds + 0.12
          && frame.filePath.startsWith(`${assetRoot}${path.sep}`)
          && existsSync(frame.filePath));
      const selected = selectEvenly(candidates, maxFrames);
      const frames: string[] = [];
      const frameTimeline: Array<{ index: number; atSeconds: number }> = [];
      for (const frame of selected) {
        const bytes = await readFile(frame.filePath);
        if (!bytes.length) continue;
        frames.push(`data:image/jpeg;base64,${bytes.toString("base64")}`);
        frameTimeline.push({ index: frames.length, atSeconds: Number(frame.atSeconds.toFixed(3)) });
      }
      if (frames.length >= 4) {
        return {
          videoFrames: frames,
          videoFramesPerSecond: Math.min(2, Math.max(0.1, frames.length / Math.max(1, endSeconds - startSeconds))),
          frameTimeline,
        };
      }
    } catch {
      // A stale cache is non-fatal; the caller will return a clear analysis error.
    }
  }
  return undefined;
}

/**
 * Qwen allows only a <10 MB Base64 video string. For a larger local video,
 * reuse the analysis worker's ordered keyframe evidence as a video sequence.
 * This is compatible with the server runtime, which cannot spawn FFmpeg.
 */
export async function prepareQwenVideoInput(options: Options): Promise<QwenVideoInput | undefined> {
  const inlineMaxBytes = boundedNumber(options.inlineMaxBytes, INLINE_VIDEO_BYTES, 1);
  if (options.url) {
    try {
      const head = await fetch(options.url, { method: "HEAD", cache: "no-store" });
      const advertisedBytes = Number(head.headers.get("content-length") || 0);
      if (!Number.isFinite(advertisedBytes) || advertisedBytes <= inlineMaxBytes) {
        const response = await fetch(options.url, { cache: "no-store" });
        if (response.ok) {
          const media = Buffer.from(await response.arrayBuffer());
          if (media.length && media.length <= inlineMaxBytes) {
            const mime = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
            return { videoDataUrl: `data:${mime};base64,${media.toString("base64")}` };
          }
        }
      }
    } catch {
      // Fall through to evidence already produced by the local analysis worker.
    }
  }
  return loadCachedFrames(options);
}
