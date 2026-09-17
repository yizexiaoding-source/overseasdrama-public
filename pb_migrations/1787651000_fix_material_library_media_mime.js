/// <reference path="../pb_data/types.d.ts" />

// PocketBase's Windows MIME sniffing can report generated FFmpeg MP4 files as
// application/octet-stream even when the filename ends in .mp4. The worker
// already controls this field and only writes generated video clips, so keep
// the collection permissive and let the source/asset kind contract validate it.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("material_library_assets");
  const media = collection.fields.getByName("media_file");
  media.mimeTypes = [];
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("material_library_assets");
  const media = collection.fields.getByName("media_file");
  media.mimeTypes = ["video/*"];
  return app.save(collection);
});
