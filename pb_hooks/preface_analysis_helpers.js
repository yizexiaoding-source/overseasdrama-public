function objectValue(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function textValue(value) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("、");
  const record = objectValue(value);
  for (const key of ["value", "label", "text", "summary", "description", "event"]) {
    const text = textValue(record[key]);
    if (text) return text;
  }
  return "";
}
function firstValue(analysis, blueprint, keys) {
  const content = objectValue(analysis.content);
  const creative = objectValue(analysis.creative);
  for (const key of keys) {
    const value = textValue(creative[key] !== undefined ? creative[key] : content[key] !== undefined ? content[key] : blueprint[key]);
    if (value) return value;
  }
  return "";
}
function isAnalysisComplete(asset) {
  const analysis = objectValue(asset.get("analysis_result"));
  const blueprint = objectValue(asset.get("prompt_blueprint"));
  const content = objectValue(analysis.content);
  const relations = textValue(content.relations || content.relationships);
  return Boolean(
    relations
    && firstValue(analysis, blueprint, ["summary", "creativeSummary", "storySummary"])
    && firstValue(analysis, blueprint, ["mechanism", "replicationMechanism", "conflict"])
  );
}
function hasMedia(asset, material) { return Boolean(asset.getString("media_file") || material.getString("video")); }
function activeJob(app, assetId) {
  try { return app.findFirstRecordByFilter("preface_analysis_jobs", "asset = {:asset} && (status = 'queued' || status = 'running')", { asset: assetId }); }
  catch (_) { return null; }
}
function enqueue(app, asset, force) {
  if (asset.getString("asset_kind") !== "ai_preface") return { outcome: "not_preface" };
  const material = app.findRecordById("ad_materials", asset.getString("source_material"));
  const start = Math.max(0, asset.getFloat("clip_start_seconds"));
  const end = Math.max(0, asset.getFloat("clip_end_seconds"));
  if (!(end > start)) throw new BadRequestError("前贴片段范围无效");
  if (!hasMedia(asset, material)) {
    asset.set("preface_analysis_status", "no_media");
    asset.set("preface_analysis_error", "没有可用的视频源");
    app.save(asset);
    return { outcome: "no_media", asset: asset.id };
  }
  if (!force && isAnalysisComplete(asset)) return { outcome: "complete", asset: asset.id };
  const active = activeJob(app, asset.id);
  if (active) return { outcome: "already_active", asset: asset.id, job: active.id, status: active.getString("status") };
  let generation = 1;
  try {
    const latest = app.findRecordsByFilter("preface_analysis_jobs", "asset = {:asset}", "-id", 1, 0, { asset: asset.id }).filter(Boolean)[0];
    if (latest) generation = latest.getInt("attempt") + 2;
  } catch (_) {}
  const job = new Record(app.findCollectionByNameOrId("preface_analysis_jobs"));
  job.set("asset", asset.id);
  job.set("material", material.id);
  job.set("status", "queued");
  job.set("clip_start_seconds", start);
  job.set("clip_end_seconds", end);
  job.set("progress", 0);
  job.set("attempt", 0);
  job.set("max_attempts", 3);
  job.set("idempotency_key", `preface:${asset.id}:segment-v1:${generation}`);
  app.save(job);
  asset.set("preface_analysis_status", "queued");
  asset.set("preface_analysis_progress", 0);
  asset.set("preface_analysis_error", "");
  app.save(asset);
  return { outcome: "queued", asset: asset.id, job: job.id, status: "queued" };
}

function enqueueIncomplete(app, assets) {
  const counts = { queued: 0, already_active: 0, complete: 0, no_media: 0, not_preface: 0, failed: 0 };
  const failures = [];
  for (const asset of assets) {
    try {
      const result = enqueue(app, asset, false);
      counts[result.outcome] = Number(counts[result.outcome] || 0) + 1;
    } catch (error) {
      counts.failed += 1;
      failures.push({ asset: asset.id, message: String(error && error.message ? error.message : "补全分析任务创建失败") });
    }
  }
  return { total: assets.length, ...counts, failures };
}

module.exports = { enqueue, enqueueIncomplete, isAnalysisComplete };
