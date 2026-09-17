export function extractStoryboardScript(value: string) {
  const raw = value.trim();
  // Models occasionally return three alternative scripts despite the prompt.
  // Keep the first complete version and cut at the next numbered heading.
  const matches = [...raw.matchAll(/(?:^|\n)\s*分镜脚本\s*(?:\d+\s*)?(?:（[^\n]*）|\([^\n]*\))?[：:]?/g)];
  const marker = matches.find((item) => /分镜脚本\s*\d+/.test(item[0])) || matches[0];
  if (marker?.index !== undefined) {
    const start = marker.index + (marker[0].startsWith("\n") ? 1 : 0);
    const first = raw.slice(start).trim();
    const nextScriptHeading = first.search(/\n\s*分镜脚本\s*(?:\d+\s*)?(?:（[^\n]*）|\([^\n]*\))?[：:]?/);
    const nextAlternativeHeading = first.search(/\n\s*分镜头\s*(?:2|[3-9]\d*)\s*[（(][^\n]*(?:总时长|总长度)[^\n]*[）)]\s*[：:]?/);
    const cutAt = [nextScriptHeading, nextAlternativeHeading].filter((index) => index >= 0).sort((a, b) => a - b)[0];
    return cleanStoryboardBody((cutAt !== undefined ? first.slice(0, cutAt) : first).trim());
  }
  const shotStart = raw.search(/(?:^|\n)分镜头(?:\[|\d)/);
  return cleanStoryboardBody(shotStart >= 0 ? raw.slice(shotStart + (raw[shotStart] === "\n" ? 1 : 0)).trim() : raw);
}

function cleanStoryboardBody(value: string) {
  return value
    // A model may label the four coarse time blocks as 分镜头1…4. They are
    // parts of one 15-second storyboard, not four alternative scripts.
    .replace(/^\s*分镜头\d+\s*[（(]\s*\d+\s*[-—]\s*\d+\s*秒\s*[）)]\s*$/gm, "")
    .replace(/^\s*分镜头\d+\s*[：:]\s*$/gm, "")
    .replace(/^\s*原文案\s*[：:].*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
