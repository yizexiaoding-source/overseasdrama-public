import assert from "node:assert/strict";
import test from "node:test";

import { classifyIntakeMedia, extensionForMime, normalizeAdxMetrics } from "../app/lib/material-intake-domain.ts";

test("classifies only supported image and video MIME types", () => {
  assert.deepEqual(classifyIntakeMedia("image/webp"), { mediaKind: "image", materialType: "poster_image", fileField: "image" });
  assert.deepEqual(classifyIntakeMedia("video/mp4"), { mediaKind: "video", materialType: "undetermined", fileField: "video" });
  assert.equal(classifyIntakeMedia("text/html"), null);
});

test("uses a verified extension instead of forcing every ADX file to mp4", () => {
  assert.equal(extensionForMime("image/png"), ".png");
  assert.equal(extensionForMime("video/webm"), ".webm");
  assert.equal(extensionForMime("video/quicktime"), ".mov");
});

test("preserves missing ADX metrics instead of manufacturing zeroes", () => {
  assert.deepEqual(normalizeAdxMetrics({ spend: 18.6, impressions: 2048, currency: "USD" }), {
    spend: 18.6,
    impressions: 2048,
    currency: "USD",
  });
  assert.deepEqual(normalizeAdxMetrics({ spend: "", clicks: undefined, days: 0 }), { days: 0 });
});

test("rejects negative or non-finite ADX metrics", () => {
  assert.deepEqual(normalizeAdxMetrics({ spend: -1, impressions: Number.NaN, ctr: Number.POSITIVE_INFINITY }), {});
});
