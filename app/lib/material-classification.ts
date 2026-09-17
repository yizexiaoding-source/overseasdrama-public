export const MATERIAL_TYPES = ["未判定", "原剧拼接", "解说", "AI前贴", "海报图片"] as const;
export const MEDIA_KINDS = ["图片", "视频"] as const;
export const AUDIENCE_TYPES = ["男频", "女频", "通用", "未判定"] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type AudienceType = (typeof AUDIENCE_TYPES)[number];
export type ClassificationSource = "AI" | "人工" | "导入";

const materialAliases: Record<string, MaterialType> = {
  undetermined: "未判定",
  unknown: "未判定",
  未确定: "未判定",
  未判定: "未判定",
  original_compilation: "原剧拼接",
  正片剧集拼接: "原剧拼接",
  原剧拼接: "原剧拼接",
  narration: "解说",
  正片剧集解说: "解说",
  解说: "解说",
  ai_preface: "AI前贴",
  "AI 前贴": "AI前贴",
  AI前贴: "AI前贴",
  poster_image: "海报图片",
  海报图片: "海报图片",
  // This legacy label did not prove that the opening was independent of the
  // source drama. It must be re-analysed before entering the AI preface library.
  "外搭钩子＋本剧正片": "未判定",
};

const audienceAliases: Record<string, AudienceType> = {
  male: "男频",
  男频: "男频",
  female: "女频",
  女频: "女频",
  general: "通用",
  通用: "通用",
  undetermined: "未判定",
  unknown: "未判定",
  未确定: "未判定",
  未判定: "未判定",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(text).filter(Boolean))];
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return stringList(parsed);
  } catch {
    // Legacy theme values are plain strings.
  }
  return raw.split(/[、,，/]/).map(item => item.trim()).filter(Boolean);
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function normalizeMaterialType(value: unknown): MaterialType {
  return materialAliases[text(value)] ?? "未判定";
}

export function normalizeAudienceType(value: unknown): AudienceType {
  return audienceAliases[text(value)] ?? "未判定";
}

export function normalizeMediaKind(value: unknown, mimeType?: unknown): MediaKind {
  const raw = text(value).toLowerCase();
  const mime = text(mimeType).toLowerCase();
  return raw === "image" || raw === "图片" || mime.startsWith("image/") ? "图片" : "视频";
}

export function resolveEffectiveClassification(record: Record<string, unknown>): {
  mediaKind: MediaKind;
  materialType: MaterialType;
  audienceType: AudienceType;
  genres: string[];
  source: ClassificationSource;
} {
  const override = object(record.manual_override);
  const mediaKind = normalizeMediaKind(record.media_kind, record.mime_type);
  const hasOverride = Object.keys(override).length > 0;
  const materialType = mediaKind === "图片"
    ? "海报图片"
    : normalizeMaterialType(override.materialType ?? record.material_type ?? record.type);
  const audienceType = normalizeAudienceType(override.audienceType ?? record.audience_type);
  const genres = stringList(override.genres ?? record.genre_tags ?? record.theme);
  const rawSource = text(record.classification_source).toLowerCase();
  const source: ClassificationSource = hasOverride || rawSource === "manual"
    ? "人工"
    : rawSource === "ai"
      ? "AI"
      : "导入";
  return { mediaKind, materialType, audienceType, genres, source };
}
