import assert from "node:assert/strict";
import test from "node:test";
import { buildQwenMultimodalContent, pocketBaseFileUrl } from "../app/lib/prompt-fission-multimodal.ts";

test("builds one Qwen message with text, video and image evidence", () => {
  const content = buildQwenMultimodalContent({
    text: "分析前贴并生成裂变方案",
    videoDataUrl: "data:video/mp4;base64,AAAA",
    imageDataUrl: "data:image/webp;base64,BBBB",
  });
  assert.deepEqual(content.map(part => part.type), ["text", "video_url", "image_url"]);
  assert.equal(content[1].video_url.url, "data:video/mp4;base64,AAAA");
  assert.equal(content[2].image_url.url, "data:image/webp;base64,BBBB");
});

test("omits unavailable media without inventing placeholders", () => {
  assert.deepEqual(buildQwenMultimodalContent({ text: "仅文本" }), [{ type: "text", text: "仅文本" }]);
});

test("uses an ordered image sequence when a video cannot be sent inline", () => {
  assert.deepEqual(buildQwenMultimodalContent({
    text: "按时间顺序观察画面",
    videoFrames: ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"],
    videoFramesPerSecond: 0.5,
  }), [
    { type: "text", text: "按时间顺序观察画面" },
    { type: "video", video: ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"], fps: 0.5 },
  ]);
});

test("builds a PocketBase file URL from the actual collection and record", () => {
  assert.equal(
    pocketBaseFileUrl("http://127.0.0.1:8090", { collectionId: "assets", id: "abc", media_file: "hook 1.mp4" }, "media_file"),
    "http://127.0.0.1:8090/api/files/assets/abc/hook%201.mp4",
  );
});
