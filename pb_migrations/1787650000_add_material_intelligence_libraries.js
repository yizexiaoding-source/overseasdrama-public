/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const materials = app.findCollectionByNameOrId("ad_materials");
  materials.fields.add(new SelectField({ name: "media_kind", maxSelect: 1, values: ["image", "video"] }));
  materials.fields.add(new SelectField({ name: "material_type", maxSelect: 1, values: ["undetermined", "original_compilation", "narration", "ai_preface", "poster_image"] }));
  materials.fields.add(new SelectField({ name: "audience_type", maxSelect: 1, values: ["male", "female", "general", "undetermined"] }));
  materials.fields.add(new JSONField({ name: "genre_tags", maxSize: 100000 }));
  materials.fields.add(new JSONField({ name: "adx_metrics", maxSize: 200000 }));
  materials.fields.add(new SelectField({ name: "classification_source", maxSelect: 1, values: ["import", "ai", "manual"] }));
  materials.fields.add(new JSONField({ name: "manual_override", maxSize: 200000 }));
  materials.fields.add(new SelectField({ name: "library_bucket", maxSelect: 1, values: ["running", "ai_preface", "narration"] }));
  materials.fields.add(new NumberField({ name: "classification_confidence", min: 0, max: 1 }));
  materials.fields.add(new JSONField({ name: "classification_reasons", maxSize: 500000 }));
  materials.fields.add(new FileField({ name: "image", maxSelect: 1, maxSize: 52428800, mimeTypes: ["image/jpeg", "image/png", "image/webp"] }));
  const video = materials.fields.getByName("video");
  video.required = false;
  materials.indexes = [
    ...materials.indexes,
    "CREATE INDEX idx_ad_material_facets ON ad_materials (media_kind, material_type, audience_type, platform)",
    "CREATE INDEX idx_ad_material_library_bucket ON ad_materials (library_bucket, analysis_status)",
  ];
  app.save(materials);

  const assets = new Collection({
    id: "pbc_lummatlib01",
    name: "material_library_assets",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: "",
    fields: [
      { type: "relation", name: "source_material", required: true, maxSelect: 1, collectionId: materials.id, cascadeDelete: true },
      { type: "select", name: "asset_kind", required: true, maxSelect: 1, values: ["ai_preface", "narration"] },
      { type: "text", name: "title", required: true, max: 500 },
      { type: "number", name: "clip_start_seconds", min: 0 },
      { type: "number", name: "clip_end_seconds", min: 0 },
      { type: "file", name: "media_file", maxSelect: 1, maxSize: 536870912, mimeTypes: ["video/*"] },
      { type: "text", name: "content_hash", max: 64 },
      { type: "json", name: "analysis_result", maxSize: 5000000 },
      { type: "json", name: "prompt_blueprint", maxSize: 1000000 },
      { type: "json", name: "hit_reasons", maxSize: 1000000 },
      { type: "json", name: "adx_metrics_snapshot", maxSize: 200000 },
      { type: "select", name: "review_status", maxSelect: 1, values: ["pending", "approved", "rejected"] },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_material_library_hash ON material_library_assets (content_hash) WHERE content_hash != ''",
      "CREATE INDEX idx_material_library_source ON material_library_assets (source_material, asset_kind)",
    ],
  });
  app.save(assets);

  const plans = new Collection({
    id: "pbc_lumprompt01",
    name: "prompt_fission_plans",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: "",
    fields: [
      { type: "relation", name: "source_asset", required: true, maxSelect: 1, collectionId: assets.id, cascadeDelete: true },
      { type: "json", name: "preserved_mechanisms", required: true, maxSize: 1000000 },
      { type: "json", name: "variable_dimensions", required: true, maxSize: 1000000 },
      { type: "json", name: "variants", maxSize: 3000000 },
      { type: "text", name: "model", max: 200 },
      { type: "text", name: "schema_version", max: 40 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["generating", "succeeded", "failed"] },
    ],
    indexes: ["CREATE INDEX idx_prompt_fission_source ON prompt_fission_plans (source_asset)"],
  });
  return app.save(plans);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("prompt_fission_plans"));
  app.delete(app.findCollectionByNameOrId("material_library_assets"));
  const materials = app.findCollectionByNameOrId("ad_materials");
  materials.indexes = materials.indexes.filter((value) => !value.includes("idx_ad_material_facets") && !value.includes("idx_ad_material_library_bucket"));
  ["media_kind", "material_type", "audience_type", "genre_tags", "adx_metrics", "classification_source", "manual_override", "library_bucket", "classification_confidence", "classification_reasons", "image"].forEach((name) => materials.fields.removeByName(name));
  const video = materials.fields.getByName("video");
  video.required = true;
  return app.save(materials);
});
