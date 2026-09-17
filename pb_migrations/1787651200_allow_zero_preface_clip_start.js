/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const jobs = app.findCollectionByNameOrId("preface_analysis_jobs");
  jobs.fields.getByName("clip_start_seconds").required = false;
  return app.save(jobs);
}, (app) => {
  const jobs = app.findCollectionByNameOrId("preface_analysis_jobs");
  jobs.fields.getByName("clip_start_seconds").required = true;
  return app.save(jobs);
});
