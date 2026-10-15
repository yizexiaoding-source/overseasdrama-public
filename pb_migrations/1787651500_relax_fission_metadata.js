migrate((app) => {
  const collection = app.findCollectionByNameOrId("prompt_fission_plans");
  collection.fields.getByName("preserved_mechanisms").required = false;
  collection.fields.getByName("variable_dimensions").required = false;
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("prompt_fission_plans");
  collection.fields.getByName("preserved_mechanisms").required = true;
  collection.fields.getByName("variable_dimensions").required = true;
  app.save(collection);
});
