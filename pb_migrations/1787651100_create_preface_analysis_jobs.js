/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const assets = app.findCollectionByNameOrId("material_library_assets");
  const materials = app.findCollectionByNameOrId("ad_materials");
  assets.fields.add(
    new SelectField({ name: "preface_analysis_status", maxSelect: 1, values: ["queued", "running", "succeeded", "failed", "no_media"] }),
    new NumberField({ name: "preface_analysis_progress", onlyInt: true, min: 0, max: 100 }),
    new TextField({ name: "preface_analysis_error", max: 4000 }),
  );
  app.save(assets);

  const jobs = new Collection({
    id: "pbc_lumprefjob1",
    name: "preface_analysis_jobs",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "asset", required: true, maxSelect: 1, collectionId: assets.id, cascadeDelete: true },
      { type: "relation", name: "material", required: true, maxSelect: 1, collectionId: materials.id, cascadeDelete: true },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["queued", "running", "succeeded", "failed"] },
      { type: "number", name: "clip_start_seconds", required: true, min: 0 },
      { type: "number", name: "clip_end_seconds", required: true, min: 0 },
      { type: "number", name: "progress", onlyInt: true, min: 0, max: 100 },
      { type: "number", name: "attempt", onlyInt: true, min: 0 },
      { type: "number", name: "max_attempts", required: true, onlyInt: true, min: 1, max: 20 },
      { type: "text", name: "worker_id", max: 120 },
      { type: "text", name: "lease_token", max: 120, hidden: true },
      { type: "date", name: "lease_until" },
      { type: "text", name: "error", max: 4000 },
      { type: "json", name: "result", maxSize: 5000000 },
      { type: "json", name: "logs", maxSize: 1000000 },
      { type: "text", name: "idempotency_key", required: true, max: 200 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_preface_analysis_idempotency ON preface_analysis_jobs (idempotency_key)",
      "CREATE INDEX idx_preface_analysis_claim ON preface_analysis_jobs (status, id)",
      "CREATE INDEX idx_preface_analysis_asset ON preface_analysis_jobs (asset, id)",
    ],
  });
  return app.save(jobs);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("preface_analysis_jobs"));
  const assets = app.findCollectionByNameOrId("material_library_assets");
  ["preface_analysis_status", "preface_analysis_progress", "preface_analysis_error"].forEach((name) => assets.fields.removeByName(name));
  return app.save(assets);
});
