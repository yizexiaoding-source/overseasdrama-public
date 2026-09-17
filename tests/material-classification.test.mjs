import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAudienceType,
  normalizeMaterialType,
  resolveEffectiveClassification,
} from "../app/lib/material-classification.ts";

test("normalizes legacy material labels into the five canonical product types", () => {
  assert.equal(normalizeMaterialType("正片剧集拼接"), "原剧拼接");
  assert.equal(normalizeMaterialType("正片剧集解说"), "解说");
  assert.equal(normalizeMaterialType("外搭钩子＋本剧正片"), "未判定");
  assert.equal(normalizeMaterialType("AI前贴"), "AI前贴");
  assert.equal(normalizeMaterialType("poster_image"), "海报图片");
  assert.equal(normalizeMaterialType("unexpected"), "未判定");
});

test("normalizes audience labels without inventing a gender orientation", () => {
  assert.equal(normalizeAudienceType("male"), "男频");
  assert.equal(normalizeAudienceType("女频"), "女频");
  assert.equal(normalizeAudienceType("general"), "通用");
  assert.equal(normalizeAudienceType(""), "未判定");
});

test("manual classification overrides later AI values while preserving facets", () => {
  const resolved = resolveEffectiveClassification({
    media_kind: "video",
    material_type: "解说",
    audience_type: "male",
    genre_tags: ["狼人", "复仇"],
    classification_source: "ai",
    manual_override: {
      materialType: "原剧拼接",
      audienceType: "女频",
      genres: ["都市情感"],
    },
  });

  assert.deepEqual(resolved, {
    mediaKind: "视频",
    materialType: "原剧拼接",
    audienceType: "女频",
    genres: ["都市情感"],
    source: "人工",
  });
});

test("falls back to legacy fields during migration", () => {
  assert.deepEqual(resolveEffectiveClassification({
    mime_type: "image/webp",
    type: "未确定",
    theme: "甜宠",
  }), {
    mediaKind: "图片",
    materialType: "海报图片",
    audienceType: "未判定",
    genres: ["甜宠"],
    source: "导入",
  });
});
