/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const materials = app.findCollectionByNameOrId("ad_materials");
  materials.fields.add(new TextField({ name: "taxonomy_version", max: 60 }));
  materials.fields.add(new JSONField({ name: "worldview_tags", maxSize: 100000 }));
  materials.fields.add(new JSONField({ name: "setting_tags", maxSize: 100000 }));
  materials.fields.add(new JSONField({ name: "classification_v2", maxSize: 500000 }));
  return app.save(materials);
}, (app) => {
  const materials = app.findCollectionByNameOrId("ad_materials");
  ["taxonomy_version", "worldview_tags", "setting_tags", "classification_v2"].forEach((name) => materials.fields.removeByName(name));
  return app.save(materials);
});
