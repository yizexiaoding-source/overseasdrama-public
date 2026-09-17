import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStoryboardTimeline,
  storyboardCoverageIssues,
  storyboardRepairIntervals,
} from "../app/lib/preface-storyboard-timeline.ts";

test("repairs small gaps and overlaps deterministically", () => {
  const repaired = normalizeStoryboardTimeline([
    { start: 0, end: 2.9, body: "A" },
    { start: 3.1, end: 6.8, body: "B" },
    { start: 6.7, end: 9.0, body: "C" },
  ], 9.067);

  assert.deepEqual(repaired.map(({ start, end }) => [start, end]), [
    [0, 3], [3, 6.75], [6.75, 9.067],
  ]);
  assert.deepEqual(storyboardCoverageIssues(repaired, 9.067), []);
});

test("reports only large gaps for targeted repair", () => {
  const shots = normalizeStoryboardTimeline([
    { start: 0, end: 3, body: "A" },
    { start: 6, end: 9, body: "B" },
  ], 9);

  assert.deepEqual(storyboardRepairIntervals(shots, 9), [{ start: 3, end: 6 }]);
});
