/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const assets = app.findCollectionByNameOrId("material_library_assets");
  assets.fields.add(new JSONField({ name: "source_ranges", maxSize: 100000 }));
  assets.fields.add(new NumberField({ name: "assembled_duration", min: 0 }));
  assets.fields.add(new SelectField({ name: "clip_status", maxSelect: 1, values: ["ready", "missing_evidence", "pending", "failed"] }));
  return app.save(assets);
}, (app) => {
  const assets = app.findCollectionByNameOrId("material_library_assets");
  ["source_ranges", "assembled_duration", "clip_status"].forEach((name) => assets.fields.removeByName(name));
  return app.save(assets);
});
