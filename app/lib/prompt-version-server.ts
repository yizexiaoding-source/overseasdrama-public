export async function savePromptVersion<T extends Record<string, unknown>>(
  pocketBaseUrl: string,
  assetId: string,
  kind: "script" | "replication_script" | "narration_script" | "preface_fission" | "narration_fission" | "preface_adaptation" | "narration_adaptation",
  value: T,
): Promise<T & { version: number; createdAt: string }> {
  const response = await fetch(
    `${pocketBaseUrl}/api/lumina/material-library-assets/${encodeURIComponent(assetId)}/prompt-versions`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "X-Lumina-Ui": "local" },
      body: JSON.stringify({ kind, value }),
    },
  );
  const payload = await response.json().catch(() => null) as
    | (T & { version: number; createdAt: string; message?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.message || `版本保存失败（HTTP ${response.status}）`);
  }
  return payload;
}
