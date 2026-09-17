/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess((e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  if ((e.record.getString("video") || e.record.getString("image")) && e.record.getString("analysis_status") === "queued") helpers.createJob(e.app, e.record);
  e.next();
}, "ad_materials");

routerAdd("POST", "/api/lumina/material-analysis/claim", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorize(e);
  const body = e.requestInfo().body;
  const workerId = String(body.worker_id || "").trim();
  const requestedJobId = String(body.job_id || "").trim();
  const leaseSeconds = Math.max(30, Math.min(1800, Number(body.lease_seconds || 300)));
  if (!workerId) throw new BadRequestError("worker_id is required");
  let claimed = null;
  e.app.runInTransaction((tx) => {
    const candidates = tx.findRecordsByFilter("material_analysis_jobs", "status = 'queued' || status = 'running' || status = 'failed'", "-priority,id", 200, 0).filter(Boolean);
    const now = Date.now();
    const job = candidates.find((item) => {
      if (requestedJobId && item.id !== requestedJobId) return false;
      if (item.getString("status") === "queued") return true;
      if (item.getString("status") === "failed") {
        if (["permanent", "media", "validation"].includes(item.getString("error_kind"))) return false;
        const nextAttempt = Date.parse(item.getString("next_attempt_at"));
        return item.getInt("attempt") < item.getInt("max_attempts") && (!nextAttempt || nextAttempt <= now);
      }
      const lease = Date.parse(item.getString("lease_until"));
      return !lease || lease <= now;
    });
    if (!job) return;
    const token = $security.randomString(40);
    job.set("status", "running");
    job.set("progress", Math.max(1, job.getInt("progress")));
    job.set("attempt", job.getInt("attempt") + 1);
    job.set("worker_id", workerId);
    job.set("lease_token", token);
    job.set("lease_until", new Date(now + leaseSeconds * 1000).toISOString());
    job.set("error", "");
    job.set("result", null);
    job.set("result_schema_version", "material-v2");
    job.set("current_stage", "download");
    tx.save(job);
    const material = tx.findRecordById("ad_materials", job.getString("material"));
    material.set("analysis_status", "running");
    material.set("analysis_progress", job.getInt("progress"));
    material.set("analysis_error", "");
    material.set("analysis_schema_version", "material-v2");
    material.set("analysis_stage", "download");
    tx.save(material);
    claimed = {
      job: {
        id: job.id,
        stage: job.getString("stage"),
        lease_token: token,
        lease_until: job.getString("lease_until"),
        attempt: job.getInt("attempt"),
        analysis_version: "material-v2",
        result_contract: "material-v2",
        parameters: job.get("logs") || {}
      },
      material: {
        id: material.id,
        collection_id: material.collection().id,
        video: material.getString("video"),
        image: material.getString("image"),
        media_kind: material.getString("media_kind"),
        title: material.getString("title"),
        original_name: material.getString("original_name"),
        mime_type: material.getString("mime_type"),
        language: material.getString("language"),
        platform: material.getString("platform"),
        content_hash: material.getString("content_hash"),
        adx_metrics: material.get("adx_metrics") || {},
        manual_override: material.get("manual_override") || {}
      }
    };
  });
  if (!claimed) return e.noContent(204);
  return e.json(200, claimed);
});

routerAdd("PATCH", "/api/lumina/material-analysis/jobs/{id}", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  const taxonomy = require(`${__hooks}/short_drama_taxonomy.js`);
  helpers.authorize(e);
  const body = e.requestInfo().body;
  const workerId = String(body.worker_id || "");
  const leaseToken = String(body.lease_token || "");
  const nextStatus = String(body.status || "running");
  if (!["running", "succeeded", "failed"].includes(nextStatus)) throw new BadRequestError("invalid status");
  const jobId = e.request.pathValue("id");
  e.app.runInTransaction((tx) => {
    const job = tx.findRecordById("material_analysis_jobs", jobId);
    if (job.getString("status") === nextStatus && nextStatus !== "running") return;
    if (job.getString("worker_id") !== workerId || job.getString("lease_token") !== leaseToken) throw new ForbiddenError("lease ownership mismatch");
    if (job.getString("status") !== "running") throw new BadRequestError("job is not running");
    const leaseUntil = Date.parse(job.getString("lease_until"));
    if (!leaseUntil || leaseUntil <= Date.now()) throw new ForbiddenError("lease expired");
    const progress = nextStatus === "succeeded" ? 100 : Math.max(1, Math.min(99, Number(body.progress || job.getInt("progress"))));
    job.set("status", nextStatus);
    job.set("progress", progress);
    job.set("error", nextStatus === "failed" ? String(body.error || "analysis failed").slice(0, 4000) : "");
    if (nextStatus === "failed") {
      const errorKind = String(body.error_kind || "permanent");
      job.set("error_kind", errorKind);
      const retryable = body.retryable === true && !["permanent", "media", "validation"].includes(errorKind);
      const delay = Math.max(0, Math.min(1800, Number(body.retry_after_seconds || 0)));
      job.set("next_attempt_at", retryable && delay ? new Date(Date.now() + delay * 1000).toISOString() : "");
      if (!retryable) job.set("max_attempts", job.getInt("attempt"));
    } else {
      job.set("error_kind", "");
      job.set("next_attempt_at", "");
    }
    if (body.result != null) job.set("result", body.result);
    if (body.logs != null) job.set("logs", body.logs);
    const reportedStage = String(body.current_stage || body.stage_name || "");
    const currentStage = nextStatus === "succeeded" ? "completed" : helpers.normalizeStage(reportedStage, job.getString("current_stage") || "scan");
    job.set("current_stage", currentStage);
    if (nextStatus === "running") job.set("lease_until", new Date(Date.now() + Math.max(30, Math.min(1800, Number(body.lease_seconds || 300))) * 1000).toISOString());
    else { job.set("lease_until", ""); job.set("lease_token", ""); }
    tx.save(job);

    const material = tx.findRecordById("ad_materials", job.getString("material"));
    material.set("analysis_status", nextStatus);
    material.set("analysis_progress", progress);
    material.set("analysis_error", job.getString("error"));
    material.set("analysis_stage", currentStage);
    if (nextStatus === "succeeded" && body.result != null) {
      const materialResult = body.material_result != null ? body.material_result : (body.result.result != null ? body.result.result : body.result);
      const materialFields = materialResult && materialResult.materialFields ? materialResult.materialFields : materialResult;
      material.set("analysis_result", materialResult);
      const projection = helpers.projectMaterialResult(materialResult, material.getString("review_status"));
      job.set("result_schema_version", projection.schemaVersion);
      job.set("segment_count", projection.segmentCount);
      tx.save(job);
      material.set("analysis_schema_version", projection.schemaVersion);
      material.set("segment_count", projection.segmentCount);
      material.set("hook_count", projection.hookCount);
      material.set("creative_tier", projection.tier);
      material.set("material_format", projection.format);
      material.set("type", projection.format);
      material.set("review_flags", projection.reviewFlags);
      material.set("prototype_inputs", projection.prototypeInputs);
      material.set("source_attribution", projection.sourceAttribution);
      material.set("ontology_tags", projection.ontologyTags);
      const detectedLanguage = String(helpers.resultValue(materialResult, ["detectedLanguage", "language"], helpers.resultValue(materialFields, ["detectedLanguage", "language"], "")) || "");
      if (detectedLanguage) material.set("language", detectedLanguage.slice(0, 80));
      material.set("production_gate", projection.productionGate);
      material.set("prototype", String(body.prototype || helpers.resultValue(materialFields, ["prototype", "hookPrototype", "hook_prototype"], material.getString("prototype")) || ""));
      material.set("review_status", String(body.review_status || projection.reviewStatus || helpers.resultValue(materialFields, ["reviewStatus", "review_status"], "pending")));
      const duration = Number(helpers.resultValue(materialResult, ["durationSeconds", "duration_seconds"], 0));
      if (duration > 0) material.set("duration_seconds", duration);
      const classification = body.classification && typeof body.classification === "object" ? body.classification : {};
      const materialType = {
        "未判定": "undetermined", "未确定": "undetermined", "原剧拼接": "original_compilation",
        "正片剧集拼接": "original_compilation", "解说": "narration", "正片剧集解说": "narration",
        "AI前贴": "ai_preface", "海报图片": "poster_image"
      }[String(classification.material_type || "")] || "undetermined";
      material.set("material_type", materialType);
      material.set("type", { undetermined: "未判定", original_compilation: "原剧拼接", narration: "解说", ai_preface: "AI前贴", poster_image: "海报图片" }[materialType]);
      material.set("library_bucket", ["running", "ai_preface", "narration"].includes(String(classification.library_bucket)) ? String(classification.library_bucket) : "running");
      material.set("classification_source", ["import", "ai", "manual"].includes(String(classification.source)) ? String(classification.source) : "ai");
      material.set("classification_confidence", Math.max(0, Math.min(1, Number(classification.confidence || 0))));
      material.set("classification_reasons", Array.isArray(classification.reasons) ? classification.reasons : []);
      material.set("taxonomy_version", "short-drama-taxonomy-v1");
      material.set("genre_tags", taxonomy.normalizeGenres(classification.genres));
      const taxonomyPayload = classification.taxonomy && typeof classification.taxonomy === "object" ? classification.taxonomy : {};
      material.set("worldview_tags", taxonomyPayload.worldview && typeof taxonomyPayload.worldview === "object" ? taxonomyPayload.worldview : {});
      material.set("setting_tags", taxonomyPayload.settings && typeof taxonomyPayload.settings === "object" ? taxonomyPayload.settings : {});
      material.set("classification_v2", taxonomyPayload);
      material.set("audience_type", ["male", "female", "general", "undetermined"].includes(String(classification.audience_type)) ? String(classification.audience_type) : "undetermined");
      if (classification.review_required === true) material.set("review_status", "pending");
      const assets = tx.findCollectionByNameOrId("material_library_assets");
      const assetInputs = Array.isArray(body.library_assets) ? body.library_assets : [body.library_asset];
      const desiredAssetKinds = new Set(
        assetInputs
          .filter((assetInput) => assetInput && typeof assetInput === "object")
          .map((assetInput) => String(assetInput.asset_kind || ""))
          .filter((kind) => ["ai_preface", "narration"].includes(kind))
      );
      const canonicalAssets = new Map();
      for (const assetInput of assetInputs) {
      if (assetInput && typeof assetInput === "object" && ["ai_preface", "narration"].includes(String(assetInput.asset_kind))) {
        const hash = String(assetInput.content_hash || "").slice(0, 64);
        let asset = null;
        const assetKind = String(assetInput.asset_kind);
        try { asset = tx.findFirstRecordByFilter(assets, "source_material = {:source} && asset_kind = {:kind}", { source: material.id, kind: assetKind }); } catch (_) {}
        if (hash) {
          if (!asset) { try { asset = tx.findFirstRecordByFilter(assets, "content_hash = {:hash}", { hash }); } catch (_) {} }
        }
        if (!asset) asset = new Record(assets);
        asset.set("source_material", material.id);
        asset.set("asset_kind", assetKind);
        asset.set("title", String(assetInput.title || material.getString("title") || "未命名素材").slice(0, 500));
        const clipStart = Math.max(0, Number(assetInput.clip_start_seconds || 0));
        const clipEnd = Math.max(0, Number(assetInput.clip_end_seconds || 0));
        const localMediaPath = String(assetInput.local_media_path || "");
        const physicalPrefaceReady = assetKind !== "ai_preface" || (
          String(assetInput.clip_status || "") === "ready"
          && clipEnd > clipStart
          && /[\\\/]public[\\\/]material-library[\\\/][^\\\/]+\.mp4$/i.test(localMediaPath)
        );
        asset.set("clip_start_seconds", physicalPrefaceReady ? clipStart : 0);
        asset.set("clip_end_seconds", physicalPrefaceReady ? clipEnd : 0);
        if (Array.isArray(assetInput.source_ranges)) asset.set("source_ranges", assetInput.source_ranges);
        if (assetInput.assembled_duration != null) asset.set("assembled_duration", Math.max(0, Number(assetInput.assembled_duration || 0)));
        if (assetInput.clip_status || assetKind === "ai_preface") asset.set("clip_status", physicalPrefaceReady ? (["ready", "missing_evidence", "pending", "failed"].includes(String(assetInput.clip_status)) ? String(assetInput.clip_status) : "pending") : "missing_evidence");
        asset.set("content_hash", hash);
        asset.set("analysis_result", assetInput.analysis_result || {});
        asset.set("prompt_blueprint", assetInput.prompt_blueprint || {});
        asset.set("hit_reasons", Array.isArray(assetInput.hit_reasons) ? assetInput.hit_reasons : []);
        asset.set("adx_metrics_snapshot", assetInput.adx_metrics_snapshot || {});
        asset.set("review_status", ["pending", "approved", "rejected"].includes(String(assetInput.review_status)) ? String(assetInput.review_status) : "pending");
        if (physicalPrefaceReady && localMediaPath && /[\\\/]public[\\\/]material-library[\\\/][^\\\/]+\.mp4$/i.test(localMediaPath)) {
          asset.set("media_file", $filesystem.fileFromPath(localMediaPath));
        } else if (String(assetInput.clip_status || "") === "missing_evidence") {
          asset.set("media_file", null);
        }
        tx.save(asset);
        canonicalAssets.set(assetKind, asset.id);
      }
      }
      // Reanalysis is authoritative for library membership. Without this
      // reconciliation, an asset once classified as AI preface remains in the
      // preface library even after the latest result says it is narration-only.
      // A genuine AI-preface + narration result sends both kinds, so both are
      // retained and updated.
      tx.findRecordsByFilter(
        assets,
        "source_material = {:source}",
        "id",
        100,
        0,
        { source: material.id }
      ).filter(Boolean).forEach((existingAsset) => {
        const kind = existingAsset.getString("asset_kind");
        if (!desiredAssetKinds.has(existingAsset.getString("asset_kind")) || (canonicalAssets.has(kind) && canonicalAssets.get(kind) !== existingAsset.id)) tx.delete(existingAsset);
      });
      helpers.syncMaterialHookAssets(tx, material, materialResult, projection);
    } else if (body.prototype != null) {
      material.set("prototype", String(body.prototype));
    }
    if (body.review_status != null) material.set("review_status", String(body.review_status));
    tx.save(material);
  });
  return e.json(200, { id: jobId, status: nextStatus });
});

routerAdd("POST", "/api/lumina/material-analysis/jobs/{id}/retry", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorize(e);
  const job = e.app.findRecordById("material_analysis_jobs", e.request.pathValue("id"));
  const status = job.getString("status");
  const leaseUntil = Date.parse(job.getString("lease_until"));
  const staleRunning = status === "running" && (!leaseUntil || leaseUntil <= Date.now());
  if (status !== "failed" && !staleRunning) throw new BadRequestError("only failed or lease-expired running jobs can be retried");
  job.set("status", "queued");
  job.set("progress", 0);
  job.set("attempt", 0);
  job.set("worker_id", "");
  job.set("lease_token", "");
  job.set("lease_until", "");
  job.set("error", "");
  job.set("result", null);
  job.set("current_stage", "queued");
  e.app.save(job);
  const material = e.app.findRecordById("ad_materials", job.getString("material"));
  material.set("analysis_status", "queued");
  material.set("analysis_progress", 0);
  material.set("analysis_error", "");
  material.set("analysis_stage", "queued");
  e.app.save(material);
  return e.json(200, { id: job.id, status: "queued", attempt: 0 });
});

routerAdd("POST", "/api/lumina/material-analysis/materials/{id}/reproject", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const material = e.app.findRecordById("ad_materials", e.request.pathValue("id"));
  const decodeJson = (value) => {
    let decodedValue = value;
    for (let index = 0; index < 3 && typeof decodedValue === "string"; index++) decodedValue = JSON.parse(decodedValue || "{}");
    return typeof decodedValue === "object" && decodedValue ? JSON.parse(JSON.stringify(decodedValue)) : {};
  };
  const requestBody = e.requestInfo().body || {};
  let storedResult = requestBody.analysis_result || material.getString("analysis_result");
  let decoded = decodeJson(storedResult);
  if (!decoded || !decoded.creative) {
    const job = e.app.findFirstRecordByFilter("material_analysis_jobs", "material = {:material}", { material: material.id });
    storedResult = job.getString("result");
    const envelope = decodeJson(storedResult);
    decoded = decodeJson(envelope && envelope.result ? envelope.result : envelope);
  }
  const result = decoded;
  if (!result || typeof result !== "object") throw new BadRequestError("material has no analysis result");
  const creative = result.creative && typeof result.creative === "object" ? result.creative : {};
  const bodyFormat = helpers.resultValue({ result: creative.bodyFormat || {} }, ["value", "label", "code"], "");
  const narrationCoverage = Number(helpers.resultValue({ result: creative.narrationCoverage || {} }, ["value"], NaN));
  const hookSourceStatus = helpers.resultValue({ result: creative.hookSourceStatus || {} }, ["value", "label", "code"], "");
  const hookAssemblyType = helpers.resultValue({ result: creative.hookAssemblyType || {} }, ["value", "label", "code"], "");
  const hasPreface = ["同剧外搭", "跨剧外搭", "外搭来源待确认"].includes(String(hookAssemblyType));
  let format = "未确定";
  if (hasPreface || ["疑似外搭", "已确认外搭"].includes(String(hookSourceStatus))) format = "外搭钩子＋本剧正片";
  else if (String(bodyFormat) === "解说主导") format = "正片剧集解说";
  else if (String(bodyFormat) === "正片主导") format = "正片剧集拼接";
  else if (String(bodyFormat) === "混合" && Number.isFinite(narrationCoverage)) format = narrationCoverage >= .5 ? "正片剧集解说" : "正片剧集拼接";
  const basis = hasPreface ? creative.hookAssemblyType : ["疑似外搭", "已确认外搭"].includes(String(hookSourceStatus)) ? creative.hookSourceStatus : creative.bodyFormat;
  creative.format = {
    code: { "正片剧集拼接": "EPISODE_SPLICE", "正片剧集解说": "EPISODE_NARRATION", "外搭钩子＋本剧正片": "EXTERNAL_HOOK_BODY", "未确定": "UNDETERMINED" }[format],
    label: format,
    value: format,
    confidence: basis && typeof basis.confidence === "number" ? basis.confidence : 0,
    evidence: basis && Array.isArray(basis.evidence) ? basis.evidence : [],
    verification: basis && basis.verification ? basis.verification : "unverified"
  };
  result.creative = creative;
  if (result.semantic && typeof result.semantic === "object") result.semantic.creative = creative;
  material.set("analysis_result", result);
  const projection = helpers.projectMaterialResult(result, material.getString("review_status"));
  material.set("material_format", projection.format);
  material.set("type", projection.format);
  material.set("creative_tier", ["T0", "T1", "T2", "T3", "TX"].includes(projection.tier) ? projection.tier : "TX");
  material.set("segment_count", projection.segmentCount);
  material.set("hook_count", projection.hookCount);
  material.set("review_flags", projection.reviewFlags);
  material.set("ontology_tags", projection.ontologyTags);
  material.set("production_gate", projection.productionGate);
  material.set("analysis_status", "succeeded");
  material.set("analysis_progress", 100);
  material.set("analysis_stage", "completed");
  material.set("analysis_error", "");
  const hookAssetIds = helpers.syncMaterialHookAssets(e.app, material, result, projection);
  e.app.save(material);
  return e.json(200, { id: material.id, material_format: projection.format, creative_tier: material.getString("creative_tier"), hook_asset_ids: hookAssetIds });
});

routerAdd("POST", "/api/lumina/materials/{id}/classification", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const material = e.app.findRecordById("ad_materials", e.request.pathValue("id"));
  const body = e.requestInfo().body || {};
  const requested = String(body.material_type || body.materialType || "").trim();
  const canonical = {
    "未判定": ["undetermined", "running"], "未确定": ["undetermined", "running"],
    "原剧拼接": ["original_compilation", "running"], "解说": ["narration", "narration"],
    "AI前贴": ["ai_preface", "ai_preface"], "海报图片": ["poster_image", "running"]
  }[requested];
  if (!canonical) throw new BadRequestError("invalid material type");
  if (material.getString("media_kind") === "image" && requested !== "海报图片") throw new BadRequestError("图片素材只能分类为海报图片");
  material.set("material_type", canonical[0]);
  material.set("type", requested === "未确定" ? "未判定" : requested);
  material.set("library_bucket", canonical[1]);
  material.set("classification_source", "manual");
  material.set("classification_confidence", 1);
  material.set("classification_reasons", [{ reason: "用户人工确认" }]);
  material.set("manual_override", { materialType: requested === "未确定" ? "未判定" : requested, updatedAt: new Date().toISOString() });
  e.app.save(material);
  return e.json(200, { id: material.id, material_type: canonical[0], library_bucket: canonical[1], classification_source: "manual" });
});

routerAdd("POST", "/api/lumina/materials/{id}/type-review", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const material = e.app.findRecordById("ad_materials", e.request.pathValue("id"));
  const body = e.requestInfo().body || {};
  const hasPreface = String(body.has_preface || "uncertain");
  const hasNarration = String(body.has_narration || "uncertain");
  const action = String(body.action || "confirm");
  const note = String(body.note || "").trim().slice(0, 2000);
  if (!["yes", "no", "uncertain"].includes(hasPreface) || !["yes", "no", "uncertain"].includes(hasNarration)) {
    throw new BadRequestError("invalid type review decision");
  }
  if (!["confirm", "insufficient"].includes(action)) throw new BadRequestError("invalid type review action");
  if (material.getString("media_kind") === "image") throw new BadRequestError("image materials do not require video type review");
  if (action === "confirm" && (hasPreface === "uncertain" || hasNarration === "uncertain")) {
    throw new BadRequestError("both preface and narration decisions are required");
  }
  if (action === "insufficient" && !note) throw new BadRequestError("review note is required when evidence is insufficient");

  const decodeJson = (value) => {
    let decoded = value;
    for (let index = 0; index < 3 && typeof decoded === "string"; index++) {
      try { decoded = JSON.parse(decoded || "{}"); } catch (_) { return {}; }
    }
    return decoded && typeof decoded === "object" && !Array.isArray(decoded) ? JSON.parse(JSON.stringify(decoded)) : {};
  };
  const result = decodeJson(material.get("analysis_result") || material.getString("analysis_result"));
  const creative = result.creative && typeof result.creative === "object" ? result.creative : {};
  const now = new Date().toISOString();
  const conclusive = action === "confirm";
  const resolvedPreface = conclusive && hasPreface === "yes";
  const resolvedNarration = conclusive && hasNarration === "yes";
  const materialType = !conclusive ? "未判定" : resolvedPreface ? "AI前贴" : resolvedNarration ? "解说" : "原剧拼接";
  const materialTypeCode = { "未判定": "undetermined", "AI前贴": "ai_preface", "解说": "narration", "原剧拼接": "original_compilation" }[materialType];
  const libraryKinds = !conclusive ? [] : [resolvedPreface ? "ai_preface" : "", resolvedNarration ? "narration" : ""].filter(Boolean);
  const reasons = [
    { reason: hasPreface === "yes" ? "人工确认存在独立前贴" : hasPreface === "no" ? "人工确认不存在独立前贴" : "独立前贴证据不足", evidence: "人工复核" },
    { reason: hasNarration === "yes" ? "人工确认存在独立解说口播" : hasNarration === "no" ? "人工确认不存在独立解说口播" : "独立解说证据不足", evidence: "人工复核" },
  ];
  if (note) reasons.push({ reason: note, evidence: "复核说明" });

  result.typeReview = {
    status: conclusive ? "approved" : "needs_review",
    hasPreface,
    hasNarration,
    materialType,
    libraryKinds,
    note,
    reviewedAt: now,
  };
  material.set("analysis_result", result);
  material.set("material_type", materialTypeCode);
  material.set("type", materialType);
  material.set("material_format", !conclusive ? "未确定" : resolvedPreface ? "外搭钩子＋本剧正片" : resolvedNarration ? "正片剧集解说" : "正片剧集拼接");
  material.set("library_bucket", resolvedPreface ? "ai_preface" : resolvedNarration ? "narration" : "running");
  material.set("classification_source", "manual");
  material.set("classification_confidence", conclusive ? 1 : 0);
  material.set("classification_reasons", reasons);
  material.set("manual_override", { materialType, hasPreface, hasNarration, note, updatedAt: now });
  material.set("review_status", conclusive ? "已修改" : "needs_review");

  const assets = e.app.findCollectionByNameOrId("material_library_assets");
  const existing = e.app.findRecordsByFilter(assets, "source_material = {:source}", "id", 100, 0, { source: material.id }).filter(Boolean);
  const duration = Math.max(0, material.getFloat("duration_seconds"));
  const prefaceBoundary = helpers.resolvePrefaceBoundary(result, duration);
  const prefaceEnd = prefaceBoundary.valid ? prefaceBoundary.end : 0;
  const narrationRanges = (Array.isArray(creative.narrationSegments) ? creative.narrationSegments : [])
    .map((segment) => ({ start: Math.max(0, Number(segment.start || 0)), end: Math.min(duration || Number(segment.end || 0), Number(segment.end || 0)) }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((left, right) => left.start - right.start);
  const narrationStart = narrationRanges.length ? narrationRanges[0].start : 0;
  const narrationEnd = narrationRanges.length ? narrationRanges[narrationRanges.length - 1].end : 0;
  for (const kind of libraryKinds) {
    let asset = existing.find((value) => value.getString("asset_kind") === kind);
    if (!asset) asset = new Record(assets);
    asset.set("source_material", material.id);
    asset.set("asset_kind", kind);
    asset.set("title", material.getString("title") || "未命名素材");
    const ranges = kind === "narration" ? narrationRanges : (prefaceEnd > 0 ? [{ start: 0, end: Math.max(1, Math.ceil(prefaceEnd)) }] : []);
    asset.set("clip_start_seconds", kind === "narration" ? narrationStart : 0);
    asset.set("clip_end_seconds", kind === "narration" ? Math.ceil(narrationEnd) : (prefaceEnd > 0 ? Math.ceil(prefaceEnd) : 0));
    asset.set("clip_status", ranges.length ? "pending" : "missing_evidence");
    asset.set("source_ranges", ranges);
    asset.set("assembled_duration", ranges.reduce((total, range) => total + Math.max(0, range.end - range.start), 0));
    asset.set("media_file", null);
    if (!asset.getString("content_hash")) asset.set("content_hash", `manual-${material.id}-${kind}`);
    asset.set("analysis_result", result);
    if (!asset.get("prompt_blueprint")) asset.set("prompt_blueprint", {});
    asset.set("hit_reasons", reasons);
    asset.set("adx_metrics_snapshot", material.get("adx_metrics") || {});
    asset.set("review_status", "approved");
    e.app.save(asset);
  }
  existing.forEach((asset) => {
    if (!libraryKinds.includes(asset.getString("asset_kind"))) e.app.delete(asset);
  });
  e.app.save(material);
  const jobs = e.app.findRecordsByFilter("material_analysis_jobs", "material = {:material}", "-id", 1, 0, { material: material.id }).filter(Boolean);
  const job = jobs[0];
  if (job) {
    job.set("status", "queued"); job.set("progress", 0); job.set("attempt", 0); job.set("worker_id", ""); job.set("lease_token", ""); job.set("lease_until", ""); job.set("error", ""); job.set("current_stage", "queued");
    e.app.save(job);
    material.set("analysis_status", "queued"); material.set("analysis_progress", 0); material.set("analysis_error", ""); material.set("analysis_stage", "queued"); e.app.save(material);
  } else if (conclusive && material.getString("video")) {
    helpers.createJob(e.app, material);
  }
  return e.json(200, { id: material.id, material_type: materialType, library_kinds: libraryKinds, review_status: material.getString("review_status"), analysis_status: conclusive ? "queued" : material.getString("analysis_status") });
});

routerAdd("POST", "/api/lumina/prompt-fission-plans", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const body = e.requestInfo().body || {};
  const sourceAssetId = String(body.source_asset || "");
  const mechanisms = Array.isArray(body.preserved_mechanisms) ? body.preserved_mechanisms.map(String).filter(Boolean) : [];
  const dimensions = Array.isArray(body.variable_dimensions) ? body.variable_dimensions.map(String).filter(Boolean) : [];
  const variants = Array.isArray(body.variants) ? body.variants : [];
  if (!sourceAssetId || !mechanisms.length || !dimensions.length || variants.length !== 5) throw new BadRequestError("invalid prompt fission plan");
  const asset = e.app.findRecordById("material_library_assets", sourceAssetId);
  if (asset.getString("asset_kind") !== "ai_preface") throw new BadRequestError("source asset must be an AI preface");
  for (const variant of variants) {
    const preserved = variant && Array.isArray(variant.preservedMechanisms) ? variant.preservedMechanisms.map(String) : [];
    const storyboard = variant && Array.isArray(variant.storyboard) ? variant.storyboard : [];
    if (storyboard.length < 3 || storyboard.length > 8 || mechanisms.some((item) => !preserved.includes(item))) throw new BadRequestError("prompt fission variant violates locked mechanisms");
  }
  const collection = e.app.findCollectionByNameOrId("prompt_fission_plans");
  const record = new Record(collection);
  record.set("source_asset", sourceAssetId);
  record.set("preserved_mechanisms", mechanisms);
  record.set("variable_dimensions", dimensions);
  record.set("variants", variants);
  record.set("model", String(body.model || "").slice(0, 200));
  record.set("schema_version", String(body.schema_version || "prompt-fission-v1").slice(0, 40));
  record.set("status", "succeeded");
  e.app.save(record);
  return e.json(201, { id: record.id, created: record.getString("created") });
});

routerAdd("POST", "/api/lumina/preface-creative-templates", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const body = e.requestInfo().body || {};
  const idea = body.idea && typeof body.idea === "object" ? body.idea : {};
  const title = String(idea.title || "未命名前贴创意").trim().slice(0, 500);
  const script = String(idea.script || "").trim();
  if (!script) throw new BadRequestError("前贴创意缺少完整脚本");
  let saved = null;
  e.app.runInTransaction((tx) => {
    const material = new Record(tx.findCollectionByNameOrId("ad_materials"));
    material.set("title", title);
    material.set("type", "AI前贴创意模板");
    material.set("source", "preface-creative-center");
    material.set("platform", String(body.platform || "海外短剧投放"));
    material.set("market", String(body.market || "海外"));
    material.set("language", "英语对白／中文说明");
    material.set("theme", String(idea.storyModel || idea.hookType || "前贴创意"));
    material.set("duration_seconds", 15);
    material.set("analysis_status", "succeeded");
    material.set("analysis_progress", 100);
    material.set("media_kind", "video");
    material.set("material_type", "ai_preface");
    material.set("audience_type", "undetermined");
    material.set("genre_tags", Array.isArray(idea.genreTags) ? idea.genreTags : []);
    material.set("classification_source", "ai");
    material.set("library_bucket", "ai_preface");
    material.set("classification_confidence", 1);
    material.set("analysis_result", { schemaVersion: "preface-creative-v1", creativePlan: idea, content: { genres: idea.genreTags || [] } });
    tx.save(material);

    const asset = new Record(tx.findCollectionByNameOrId("material_library_assets"));
    asset.set("source_material", material.id);
    asset.set("asset_kind", "ai_preface");
    asset.set("title", title);
    asset.set("clip_start_seconds", 0);
    asset.set("clip_end_seconds", 15);
    asset.set("content_hash", `creative-${material.id}`);
    asset.set("analysis_result", material.get("analysis_result"));
    asset.set("prompt_blueprint", { creativePlan: idea, reusableTemplate: idea.reusableTemplate || idea.storyModel || "" });
    asset.set("hit_reasons", [
      { label: "主钩子", reason: String(idea.hookType || "") },
      { label: "表现形式", reason: String(idea.hookFormat || "") },
      { label: "正片承接", reason: String(idea.transitionAnchor || "") }
    ]);
    asset.set("review_status", "approved");
    tx.save(asset);
    saved = { id: asset.id, source_material: material.id, title };
  });
  return e.json(201, saved);
});

routerAdd("POST", "/api/lumina/material-library-assets/{id}/prompt-versions", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const asset = e.app.findRecordById("material_library_assets", e.request.pathValue("id"));
  const body = e.requestInfo().body || {};
  const kind = String(body.kind || "");
  const field = {
    script: "scriptVersions",
    narration_script: "narrationScriptVersions",
    preface_fission: "fissionVersions",
    narration_fission: "narrationFissionVersions",
    preface_adaptation: "prefaceAdaptationVersions",
    narration_adaptation: "narrationAdaptationVersions"
  }[kind];
  if (!field || !body.value || typeof body.value !== "object") throw new BadRequestError("invalid prompt version");
  let blueprint = {};
  // PocketBase exposes JSON fields as a dynamic Go value in hooks. Reading it
  // through getString keeps the full prior object and all historical versions;
  // spreading the dynamic wrapper silently replaced version history.
  try { blueprint = JSON.parse(asset.getString("prompt_blueprint") || "{}"); }
  catch (_) {
    const raw = asset.get("prompt_blueprint");
    blueprint = typeof raw === "string" ? {} : raw || {};
  }
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) blueprint = {};
  const previous = Array.isArray(blueprint[field]) ? blueprint[field] : [];
  const version = previous.reduce((max, item) => Math.max(max, Number(item && item.version || 0)), 0) + 1;
  const saved = { ...body.value, version, createdAt: new Date().toISOString() };
  asset.set("prompt_blueprint", { ...blueprint, [field]: [...previous, saved].slice(-20) });
  e.app.save(asset);
  return e.json(201, saved);
});

routerAdd("POST", "/api/lumina/maintenance/clear-hook-review-data", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const body = e.requestInfo().body || {};
  if (body.confirm !== "CLEAR_HOOKS_AND_REVIEWS") throw new BadRequestError("explicit confirmation is required");
  const hooks = e.app.findRecordsByFilter("hook_assets", "id != ''", "id", 5000, 0);
  for (const hook of hooks) e.app.delete(hook);
  const materials = e.app.findRecordsByFilter("ad_materials", "id != ''", "id", 5000, 0);
  for (const material of materials) {
    let result = {};
    try {
      const stored = material.getString("analysis_result");
      result = stored ? JSON.parse(stored) : {};
      for (let index = 0; index < 2 && typeof result === "string"; index++) result = JSON.parse(result || "{}");
    } catch (_) { result = {}; }
    if (result && typeof result === "object") {
      result.review = { ...(result.review || {}), status: "ready", reviewRequired: false, items: [], reasons: [] };
      if (result.semantic && typeof result.semantic === "object") result.semantic.review = result.review;
      material.set("analysis_result", result);
    }
    material.set("review_status", "已通过");
    material.set("review_flags", []);
    const gate = material.get("production_gate") || {};
    if (gate && typeof gate === "object") material.set("production_gate", { ...gate, reviewRequired: false, reasons: [] });
    e.app.save(material);
  }
  return e.json(200, { deletedHookAssets: hooks.length, clearedMaterialReviews: materials.length });
});

routerAdd("POST", "/api/lumina/material-analysis/jobs/{id}/reset", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorize(e);
  const job = e.app.findRecordById("material_analysis_jobs", e.request.pathValue("id"));
  if (job.getString("status") === "succeeded") throw new BadRequestError("succeeded jobs cannot be reset");
  job.set("status", "queued");
  job.set("progress", 0);
  job.set("attempt", 0);
  job.set("worker_id", "");
  job.set("lease_token", "");
  job.set("lease_until", "");
  job.set("error", "");
  job.set("result", null);
  job.set("current_stage", "queued");
  e.app.save(job);
  const material = e.app.findRecordById("ad_materials", job.getString("material"));
  material.set("analysis_status", "queued");
  material.set("analysis_progress", 0);
  material.set("analysis_error", "");
  material.set("analysis_stage", "queued");
  e.app.save(material);
  return e.json(200, { id: job.id, status: "queued", attempt: 0 });
});

routerAdd("POST", "/api/lumina/material-analysis/materials/{id}/retry", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const body = e.requestInfo().body || {};
  const force = body.force === true;
  const forceSemanticRefresh = body.force_semantic_refresh === true || force;
  const material = e.app.findRecordById("ad_materials", e.request.pathValue("id"));
  if (body.clear_type_review === true) {
    const note = String(body.review_note || "类型证据不足，请重新识别前贴边界与独立解说口播").trim().slice(0, 2000);
    material.set("manual_override", {});
    material.set("material_type", "undetermined");
    material.set("type", "未判定");
    material.set("library_bucket", "running");
    material.set("classification_source", "ai");
    material.set("classification_confidence", 0);
    material.set("classification_reasons", [{ reason: note, evidence: "人工退回重分析" }]);
    material.set("review_status", "pending");
    const currentResult = material.get("analysis_result");
    if (currentResult && typeof currentResult === "object" && !Array.isArray(currentResult)) {
      const nextResult = JSON.parse(JSON.stringify(currentResult));
      nextResult.typeReview = { status: "reanalyzing", note, reviewedAt: new Date().toISOString() };
      material.set("analysis_result", nextResult);
    }
  }
  const jobs = e.app.findRecordsByFilter("material_analysis_jobs", "material = {:material}", "-id", 1, 0, { material: material.id }).filter(Boolean);
  const job = jobs[0];
  if (!job) {
    if (!material.getString("video")) throw new BadRequestError("material has no uploaded video");
    e.app.save(material);
    const created = helpers.createJob(e.app, material);
    return e.json(200, { id: created.id, status: "queued", attempt: 0 });
  }
  if (["queued", "running"].includes(job.getString("status")) && !force) {
    return e.json(200, { id: job.id, status: job.getString("status"), attempt: job.getInt("attempt") });
  }
  job.set("status", "queued");
  job.set("progress", 0);
  job.set("attempt", 0);
  job.set("worker_id", "");
  job.set("lease_token", "");
  job.set("lease_until", "");
  job.set("error", "");
  job.set("result", null);
  job.set("current_stage", "queued");
  const previousLogs = job.get("logs");
  job.set("logs", { ...(previousLogs && typeof previousLogs === "object" ? previousLogs : {}), force_semantic_refresh: forceSemanticRefresh });
  e.app.save(job);
  material.set("analysis_status", "queued");
  material.set("analysis_progress", 0);
  material.set("analysis_error", "");
  material.set("analysis_stage", "queued");
  e.app.save(material);
  return e.json(200, { id: job.id, status: "queued", attempt: 0 });
});

// Server-rendered routes run inside a Cloudflare Worker and cannot read the
// host machine's analysis_cache directory. Expose the compact ASR evidence
// through PocketBase, which runs beside the analysis workers on the host.
routerAdd("GET", "/api/lumina/materials/{id}/speech-evidence", (e) => {
  const helpers = require(`${__hooks}/material_analysis_helpers.js`);
  helpers.authorizeLocalUi(e);
  const material = e.app.findRecordById("ad_materials", e.request.pathValue("id"));
  const contentHash = material.getString("content_hash").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    return e.json(404, { message: "该素材没有可用的音轨证据" });
  }

  const configuredRoot = String($os.getenv("LUMINA_ANALYSIS_CACHE_ROOT") || "").trim();
  const cacheRoot = configuredRoot || $filepath.join($filepath.dir(__hooks), "analysis_cache", "materials", "by-content-hash");
  const evidencePath = $filepath.join(cacheRoot, contentHash, "asr.json");
  let payload;
  try {
    payload = JSON.parse(toString($os.readFile(evidencePath)));
  } catch (_) {
    return e.json(404, { message: "该素材尚未生成音轨证据，请先重新分析" });
  }

  const query = e.requestInfo().query || {};
  const requestedStart = Number(query.start || 0);
  const requestedEnd = Number(query.end || 0);
  const start = Number.isFinite(requestedStart) ? Math.max(0, requestedStart) : 0;
  const end = Number.isFinite(requestedEnd) && requestedEnd > start ? requestedEnd : Number.POSITIVE_INFINITY;
  const rows = Array.isArray(payload && payload.data) ? payload.data : [];
  const segments = [];
  let textLength = 0;
  let truncated = false;
  for (const row of rows) {
    const rowStart = Number(row && row.start);
    const rowEnd = Number(row && row.end);
    const text = String(row && row.text || "").trim();
    if (!text || !Number.isFinite(rowStart) || !Number.isFinite(rowEnd) || rowEnd <= start || rowStart >= end) continue;
    if (segments.length >= 2000 || textLength + text.length > 80000) {
      truncated = true;
      break;
    }
    segments.push({
      start: Math.max(start, rowStart),
      end: Math.min(end, rowEnd),
      text,
      confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : undefined,
    });
    textLength += text.length;
  }
  if (!segments.length) return e.json(404, { message: "所选区间没有可用的音轨证据" });
  return e.json(200, {
    materialId: material.id,
    contentHash,
    language: String(payload && payload.engine && payload.engine.language || material.getString("language") || ""),
    engine: String(payload && payload.engine && payload.engine.backend || ""),
    segments,
    truncated,
  });
});
