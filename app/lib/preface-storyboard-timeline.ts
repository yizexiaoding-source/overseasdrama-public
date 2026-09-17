export type StoryboardShot = {
  start: number;
  end: number;
  body: string;
};

const round = (value: number) => Math.round(value * 1000) / 1000;
const validShot = (shot: StoryboardShot) =>
  Number.isFinite(shot.start) && Number.isFinite(shot.end) && shot.end > shot.start && Boolean(shot.body.trim());

export function normalizeStoryboardTimeline(shots: StoryboardShot[], duration: number) {
  const ordered = shots
    .filter(validShot)
    .map((shot) => ({ ...shot }))
    .sort((left, right) => left.start - right.start);
  if (!ordered.length) return ordered;
  ordered[0].start = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const left = ordered[index - 1];
    const right = ordered[index];
    const gap = right.start - left.end;
    if (Math.abs(gap) <= 0.5) {
      const boundary = round((right.start + left.end) / 2);
      left.end = boundary;
      right.start = boundary;
    }
  }
  ordered[ordered.length - 1].end = round(duration);
  return ordered.filter(validShot);
}

export function storyboardRepairIntervals(shots: StoryboardShot[], duration: number) {
  const ordered = shots.filter(validShot).slice().sort((left, right) => left.start - right.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const shot of ordered) {
    if (shot.start > cursor + 0.5) gaps.push({ start: round(cursor), end: round(shot.start) });
    cursor = Math.max(cursor, shot.end);
  }
  if (duration > cursor + 0.5) gaps.push({ start: round(cursor), end: round(duration) });
  return gaps;
}

export function storyboardCoverageIssues(shots: StoryboardShot[], duration: number) {
  if (!shots.length) return ["未识别到带起止时间的分镜"];
  const issues: string[] = [];
  const ordered = shots.slice().sort((left, right) => left.start - right.start);
  let cursor = 0;
  for (const shot of ordered) {
    if (shot.start > cursor + 0.12) issues.push(`${cursor.toFixed(2)}-${shot.start.toFixed(2)}秒缺失`);
    if (shot.start < cursor - 0.12) issues.push(`${shot.start.toFixed(2)}-${cursor.toFixed(2)}秒重叠`);
    cursor = Math.max(cursor, shot.end);
  }
  if (duration > 0 && cursor < duration - 0.12) issues.push(`${cursor.toFixed(2)}-${duration.toFixed(2)}秒缺失`);
  if (duration > 0 && cursor > duration + 0.2) issues.push(`末镜超出前贴时长 ${duration.toFixed(2)}秒`);
  return issues;
}

export function parseStoryboardScript(script: string): StoryboardShot[] {
  const pattern = /【分镜\d+[（(]\s*(\d+(?:\.\d+)?)\s*[-–—~至]\s*(\d+(?:\.\d+)?)\s*秒?[）)]】/g;
  const matches = [...script.matchAll(pattern)];
  return matches.map((match, index) => ({
    start: Number(match[1]),
    end: Number(match[2]),
    body: script.slice((match.index || 0) + match[0].length, matches[index + 1]?.index ?? script.length).trim(),
  })).filter(validShot);
}

export function sealStoryboardTimeline(shots: StoryboardShot[], duration: number) {
  const ordered = shots.filter(validShot).map((shot) => ({ ...shot })).sort((left, right) => left.start - right.start);
  if (!ordered.length) return ordered;
  ordered[0].start = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const boundary = round((ordered[index - 1].end + ordered[index].start) / 2);
    ordered[index - 1].end = boundary;
    ordered[index].start = boundary;
  }
  ordered[ordered.length - 1].end = round(duration);
  return ordered.filter(validShot);
}

const time = (value: number) => Number.isInteger(value) ? String(value) : String(round(value));

export function renderStoryboardTimeline(shots: StoryboardShot[]) {
  return shots.map((shot, index) => [
    `【分镜${index + 1}（${time(shot.start)}-${time(shot.end)}秒）】`,
    shot.body,
  ].filter(Boolean).join("\n")).join("\n\n");
}
