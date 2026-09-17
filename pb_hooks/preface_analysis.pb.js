/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/lumina/preface-analysis/assets/{id}/enqueue", (e) => {
  const auth = require(`${__hooks}/material_analysis_helpers.js`);
  const helpers = require(`${__hooks}/preface_analysis_helpers.js`);
  auth.authorizeLocalUi(e);
  const asset = e.app.findRecordById("material_library_assets", e.request.pathValue("id"));
  return e.json(200, helpers.enqueue(e.app, asset, true));
});

routerAdd("POST", "/api/lumina/preface-analysis/enqueue-incomplete", (e) => {
  const auth = require(`${__hooks}/material_analysis_helpers.js`);
  const helpers = require(`${__hooks}/preface_analysis_helpers.js`);
  auth.authorizeLocalUi(e);
  const assets = e.app.findRecordsByFilter("material_library_assets", "asset_kind = 'ai_preface'", "id", 10000, 0).filter(Boolean);
  return e.json(200, helpers.enqueueIncomplete(e.app, assets));
});

routerAdd("POST", "/api/lumina/preface-analysis/claim", (e) => {
  const auth = require(`${__hooks}/material_analysis_helpers.js`);
  auth.authorize(e);
  const body = e.requestInfo().body;
  const workerId = String(body.worker_id || "").trim();
  const requestedJobId = String(body.job_id || "").trim();
  const leaseSeconds = Math.max(30, Math.min(1800, Number(body.lease_seconds || 300)));
  if (!workerId) throw new BadRequestError("worker_id is required");
  let claimed = null;
  e.app.runInTransaction((tx) => {
    const candidates = tx.findRecordsByFilter("preface_analysis_jobs", "status = 'queued' || status = 'running' || status = 'failed'", "id", 200, 0).filter(Boolean);
    const now = Date.now();
    const job = candidates.find((item) => {
      if (requestedJobId && item.id !== requestedJobId) return false;
      if (item.getString("status") === "queued") return true;
      if (item.getString("status") === "failed") return item.getInt("attempt") < item.getInt("max_attempts");
      const lease = Date.parse(item.getString("lease_until"));
      return !lease || lease <= now;
    });
    if (!job) return;
    const asset = tx.findRecordById("material_library_assets", job.getString("asset"));
    const material = tx.findRecordById("ad_materials", job.getString("material"));
    const token = $security.randomString(40);
    job.set("status", "running"); job.set("progress", Math.max(1, job.getInt("progress")));
    job.set("attempt", job.getInt("attempt") + 1); job.set("worker_id", workerId);
    job.set("lease_token", token); job.set("lease_until", new Date(now + leaseSeconds * 1000).toISOString()); job.set("error", "");
    tx.save(job);
    asset.set("preface_analysis_status", "running"); asset.set("preface_analysis_progress", job.getInt("progress")); asset.set("preface_analysis_error", ""); tx.save(asset);
    claimed = {
      job: { id: job.id, stage: "preface", lease_token: token, attempt: job.getInt("attempt"), clip_start_seconds: job.getFloat("clip_start_seconds"), clip_end_seconds: job.getFloat("clip_end_seconds") },
      asset: { id: asset.id, collection_id: asset.collection().id, media_file: asset.getString("media_file"), clip_start_seconds: job.getFloat("clip_start_seconds"), clip_end_seconds: job.getFloat("clip_end_seconds") },
      material: { id: material.id, collection_id: material.collection().id, video: material.getString("video") },
    };
  });
  if (!claimed) return e.noContent(204);
  return e.json(200, claimed);
});

routerAdd("PATCH", "/api/lumina/preface-analysis/jobs/{id}", (e) => {
  const auth = require(`${__hooks}/material_analysis_helpers.js`);
  auth.authorize(e);
  const body = e.requestInfo().body;
  const nextStatus = String(body.status || "running");
  if (!["running", "succeeded", "failed"].includes(nextStatus)) throw new BadRequestError("invalid status");
  const jobId = e.request.pathValue("id");
  e.app.runInTransaction((tx) => {
    const job = tx.findRecordById("preface_analysis_jobs", jobId);
    if (job.getString("worker_id") !== String(body.worker_id || "") || job.getString("lease_token") !== String(body.lease_token || "")) throw new ForbiddenError("lease ownership mismatch");
    const progress = nextStatus === "succeeded" ? 100 : Math.max(1, Math.min(99, Number(body.progress || job.getInt("progress"))));
    job.set("status", nextStatus); job.set("progress", progress); job.set("error", nextStatus === "failed" ? String(body.error || "analysis failed").slice(0, 4000) : "");
    if (body.result != null) job.set("result", body.result);
    if (nextStatus === "running") job.set("lease_until", new Date(Date.now() + Math.max(30, Math.min(1800, Number(body.lease_seconds || 300))) * 1000).toISOString());
    else { job.set("lease_until", ""); job.set("lease_token", ""); }
    tx.save(job);
    const asset = tx.findRecordById("material_library_assets", job.getString("asset"));
    asset.set("preface_analysis_status", nextStatus); asset.set("preface_analysis_progress", progress); asset.set("preface_analysis_error", job.getString("error"));
    if (nextStatus === "succeeded" && body.result) {
      asset.set("analysis_result", body.result.analysis_result || body.result);
      if (body.result.prompt_blueprint) asset.set("prompt_blueprint", body.result.prompt_blueprint);
      if (Array.isArray(body.result.hit_reasons)) asset.set("hit_reasons", body.result.hit_reasons);
    }
    tx.save(asset);
  });
  return e.json(200, { id: jobId, status: nextStatus });
});
