type PocketBaseFieldError = { code?: string; message?: string };
type PocketBaseErrorPayload = { message?: string; data?: Record<string, PocketBaseFieldError> } | null;

const fieldLabels: Record<string, string> = {
  clip_start_seconds: "片段起始时间",
  clip_end_seconds: "片段结束时间",
};

function localizedFieldMessage(field: string, error: PocketBaseFieldError) {
  const label = fieldLabels[field] || field;
  if (error.code === "validation_required" || error.message === "Cannot be blank.") return `${label}不能为空`;
  return `${label}：${error.message || "数据无效"}`;
}

export function pocketBaseFailureMessage(payload: PocketBaseErrorPayload, status: number, fallback: string) {
  const fields = payload?.data ? Object.entries(payload.data) : [];
  if (fields.length) return `分析任务数据校验失败：${fields.map(([field, error]) => localizedFieldMessage(field, error)).join("；")}`;
  const message = String(payload?.message || "").trim();
  if (message && message !== "Something went wrong while processing your request.") return message;
  return `${fallback}（HTTP ${status}）`;
}
