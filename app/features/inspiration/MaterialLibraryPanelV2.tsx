"use client";

import { useMemo, useState } from "react";
import {
  createNarrationFission,
  createPromptFission,
  createMaterialAdaptation,
  regenerateNarrationScript,
  regeneratePrefaceStoryboard,
  removeMaterialLibraryAsset,
  type NarrationFissionPlan,
  type PromptFissionPlan,
  type PromptFissionSettings,
  type PrefaceScriptVersion,
  type MaterialLibraryAsset,
  type MaterialAdaptationPlan,
} from "../../lib/material-library-store";
import styles from "./InspirationWorkspace.module.css";
import { SHORT_DRAMA_GENRES } from "../../lib/short-drama-taxonomy";
import { buildPrefaceAnalysisView } from "../../lib/preface-analysis-view-model";
import { creativeMechanisms } from "../../lib/prompt-fission-domain";

type LibraryKind = "ai_preface" | "narration";
type Props = {
  kind: LibraryKind;
  assets: MaterialLibraryAsset[];
  flash: (message: string) => void;
  onDeleted: () => void;
  onSelectForReplication?: (asset: MaterialLibraryAsset) => void;
};
type Module = {
  id: string;
  title: string;
  text: string;
  metric: string;
  evidence: string;
};
const outputLanguageOptions = [
  ["follow_source", "跟随原素材"],
  ["zh-CN", "中文"],
  ["en-US", "英语"],
  ["es-ES", "西班牙语"],
  ["pt-BR", "葡萄牙语"],
  ["ja-JP", "日语"],
  ["ko-KR", "韩语"],
  ["fr-FR", "法语"],
  ["de-DE", "德语"],
  ["it-IT", "意大利语"],
  ["ru-RU", "俄语"],
  ["ar-SA", "阿拉伯语"],
  ["hi-IN", "印地语"],
  ["th-TH", "泰语"],
  ["vi-VN", "越南语"],
  ["id-ID", "印度尼西亚语"],
  ["tr-TR", "土耳其语"],
] as const;
const libraryHookTypes = ["反差", "强冲突", "情绪拉升", "身份揭示", "信息差", "悬念预告"] as const;
const trackLanguageOptions = [
  ["follow_output", "跟随成片语言"],
  ["none", "不使用"],
  ...outputLanguageOptions.filter(([value]) => value !== "follow_source"),
] as const;
const intensityOptions = [["faithful", "同构复刻"], ["light", "保守迭代"], ["deep", "结构裂变"], ["localized", "本地化裂变"]] as const;
const narrationIntensityOptions = intensityOptions.filter(([value]) => value !== "localized");
const prefaceGoalOptions = [["why_happening", "这件异常为何发生？"], ["what_next", "接下来会发生什么？"], ["who_is_true", "谁在说谎／谁才是真的？"], ["will_they_choose", "TA 最终会如何选择？"], ["what_cost", "这样做要付出什么代价？"], ["relationship_reversal", "两人的关系会如何反转？"]] as const;
const prefaceDirectionOptions = [["anomaly_event", "异常事件"], ["role_relationship", "人物关系"], ["identity_contrast", "身份反差"], ["action_causality", "动作因果"], ["reveal_order", "信息揭示顺序"], ["suspense_ending", "悬念结尾"], ["dialogue_voice", "对白／旁白"], ["audiovisual", "视听表达"], ["scene_prop", "场景／道具"], ["localization", "语言与文化本地化"]] as const;
const mechanismOptions = [["gratitude_warning", "弱者报恩预警型"], ["promise_gap", "承诺落差型"], ["identity_reveal", "身份秘密揭露型"], ["threat_countdown", "危险倒计时型"], ["relationship_reversal", "关系反转型"], ["result_first", "结果前置型"]] as const;
const targetGenreOptions = [["wealthy_runaway", "豪门带球跑"], ["revenge", "复仇翻盘"], ["contract_romance", "契约婚恋"], ["mystery", "悬疑秘密"], ["workplace", "职场权力"], ["follow_source", "跟随原素材"]] as const;
const targetRelationshipOptions = [["pregnant_runaway", "怀孕出逃女主 × 豪门家族"], ["heir_family", "继承人 × 家族"], ["wife_husband", "妻子 × 丈夫"], ["enemy_lovers", "对手 × 情感关系"], ["parent_child", "父母 × 子女"], ["follow_source", "跟随原素材"]] as const;
const targetConflictOptions = [["pregnancy_exposed", "怀孕或孩子身份即将暴露"], ["inheritance_secret", "继承与身份秘密"], ["betrayal", "背叛与追责"], ["status_gap", "阶层差与权力压制"], ["danger_escape", "危险追捕与逃离"], ["follow_source", "跟随原素材"]] as const;
const handoffMethodOptions = [["question_answer", "问题 → 正片答案"], ["action_action", "动作 → 动作"], ["dialogue_visual", "台词 → 反差画面"], ["sound_bridge", "声音桥 / J-Cut"], ["visual_match", "视觉匹配"]] as const;
const conflictFreedomOptions = [["none", "只使用目标已知冲突"], ["bounded", "允许补充异常动作"], ["bold", "允许设计新的冲突事件"]] as const;
const storyEngineOptions = [["causal_transfer", "V1 因果同构迁移"], ["result_first", "V2 危险结果前置"], ["misread_reversal", "V3 关系误判反转"], ["anomaly_escalation", "V4 连续异常升级"], ["double_misdirection", "V5 双重误导翻转"]] as const;
const branchOptions = [["A", "现实适配"], ["B", "异常事件"], ["C", "高冲突翻转"]] as const;
const narrationGoalOptions = [["opening", "强化开头口播"], ["clarity", "提高剧情清晰度"], ["suspense", "强化悬念"], ["emotion", "提高情绪强度"], ["pace", "压缩信息节奏"], ["localization", "多语言本地化"]] as const;
const narrationDirectionOptions = [["result_first", "结果前置"], ["question_first", "疑问前置"], ["relationship", "关系切入"], ["conflict", "冲突升级"], ["reveal_order", "重排揭示顺序"], ["tone", "情绪语气"], ["pace", "节奏密度"]] as const;
const mediaUrl = (asset: MaterialLibraryAsset) =>
  asset.mediaUrl ||
  (asset.sourceMediaUrl
    ? `${asset.sourceMediaUrl}#t=${Math.floor(Math.max(0, asset.clipStart))},${Math.ceil(Math.max(asset.clipStart, asset.clipEnd))}`
    : "");
const duration = (asset: MaterialLibraryAsset) =>
  Math.max(1, Math.round(asset.assembledDuration || (asset.clipEnd - asset.clipStart)));
const canonicalLibraryHookType = (asset: MaterialLibraryAsset) => {
  const creative = asset.sourceAnalysis.creative as Record<string, unknown> | undefined;
  const hook = creative?.hook as Record<string, unknown> | undefined;
  const raw = `${asset.promptBlueprint.hookType || ""} ${hook?.hookType || ""} ${asset.hitReasons.map((item) => String(item.label || item.reason || "")).join(" ")}`.toLowerCase();
  if (/cliff|suspense|悬念|危机/.test(raw)) return "悬念预告";
  if (/reveal|identity|身份|真相|揭/.test(raw)) return "身份揭示";
  if (/conflict|confront|outburst|冲突|对抗|争执/.test(raw)) return "强冲突";
  if (/emotion|breakdown|情感|情绪|虐/.test(raw)) return "情绪拉升";
  if (/contrast|反差/.test(raw)) return "反差";
  return "信息差";
};
const wholeRange = (start: number, end: number) => `${Math.floor(start)}–${Math.ceil(end)}秒`;
const values = (asset: MaterialLibraryAsset, key: string) => {
  const content = asset.sourceAnalysis.content as
    | Record<string, unknown>
    | undefined;
  const list = content?.[key];
  return Array.isArray(list)
    ? list
        .map((item) =>
          typeof item === "object" && item
            ? String(
                (item as Record<string, unknown>).label ||
                  (item as Record<string, unknown>).value ||
                  "",
              )
            : typeof item === "string" ? item : "",
        )
        .filter(Boolean)
    : [];
};
const compact = (items: string[], fallback: string) =>
  items.length ? items.slice(0, 3).join("、") : fallback;
const sourceFacts = (asset: MaterialLibraryAsset) => {
  const content = asset.sourceAnalysis.content as
    | Record<string, unknown>
    | undefined;
  const observations = Array.isArray(content?.observations)
    ? (content.observations as Array<Record<string, unknown>>)
    : [];
  return observations
    .filter((item) => Number(item.start ?? 0) < Math.max(20, asset.clipEnd))
    .slice(0, 4)
    .map((item) => {
      const dialogue = item.dialogueObserved || item.dialogue || item.quote;
      return `${Number(item.start ?? 0).toFixed(1)}—${Number(item.end ?? item.start ?? 0).toFixed(1)}秒：${String(item.actorObserved || "人物")} ${String(item.actionObserved || "发生关键动作")}${dialogue ? `；原片对白“${String(dialogue)}”` : ""}${item.resultObserved ? `；结果为${String(item.resultObserved)}` : ""}`;
    });
};
type NarrationSegment = { start: number; end: number; text: string; language: string };
const narrationSegments = (asset: MaterialLibraryAsset): NarrationSegment[] => {
  const creative = asset.sourceAnalysis.creative as Record<string, unknown> | undefined;
  const rows = Array.isArray(creative?.narrationSegments)
    ? (creative.narrationSegments as Array<Record<string, unknown>>)
    : [];
  return rows
    .filter((row) => row.verification === "verified")
    .sort((left, right) => Number(left.start || 0) - Number(right.start || 0))
    .map((row) => ({
      start: Number(row.start || 0),
      end: Number(row.end || row.start || 0),
      text: String(row.text || "").trim(),
      language: String(row.language || asset.language || "语种待定"),
    }))
    .filter((row) => row.text && row.end > row.start);
};
type PrefaceStoryboardUnit = {
  start: number;
  end: number;
  characters: string[];
  scene: string;
  action: string;
  spatialLayout?: string;
  objectState?: string;
  visibleReaction?: string;
  dialogue?: string;
  speaker?: string;
  dialogueType?: string;
  subtitleText?: string;
  speech?: Array<{ speaker?: string; type?: string; text: string }>;
  onScreenText?: Array<{ text: string; position?: string; style?: string }>;
  aspectRatio?: string;
  visualStyle?: string;
  shotSize?: string;
  camera?: string;
  compositionMovement?: string;
  focus?: string;
  sound?: string;
  transition?: string;
  verification: string;
  source: "structured" | "legacy";
};
const storyboardText = (value: unknown) => String(value || "").trim();
const verifiedLabelsInRange = (value: unknown, start: number, end: number) =>
  (Array.isArray(value) ? value : [])
    .map((raw) => raw as Record<string, unknown>)
    .filter((item) => {
      if (storyboardText(item?.verification) !== "verified") return false;
      const evidence = Array.isArray(item.evidence) ? item.evidence as Array<Record<string, unknown>> : [];
      return evidence.some((entry) => {
        const timecode = entry.timecode as Record<string, unknown> | undefined;
        const itemStart = Number(timecode?.start ?? entry.start ?? -1);
        const itemEnd = Number(timecode?.end ?? entry.end ?? itemStart);
        return Number.isFinite(itemStart) && Number.isFinite(itemEnd) && itemStart < end && itemEnd > start;
      });
    })
    .map((item) => storyboardText(item.label))
    .filter(Boolean);
const legacyPrefaceStoryboard = (asset: MaterialLibraryAsset): PrefaceStoryboardUnit[] => {
  const analysis = asset.sourceAnalysis;
  const content = analysis.content as Record<string, unknown> | undefined;
  const creative = analysis.creative as Record<string, unknown> | undefined;
  const scope = analysis.scope as Record<string, unknown> | undefined;
  const start = Number(scope?.start ?? asset.clipStart ?? 0);
  const end = Number(scope?.end ?? asset.clipEnd ?? 0);
  const observations = (Array.isArray(content?.observations) ? content.observations : [])
    .map((item) => item as Record<string, unknown>)
    .filter((item) => storyboardText(item.verification) === "verified")
    .filter((item) => Number(item.start) < end && Number(item.end) > start)
    .sort((left, right) => Number(left.start) - Number(right.start));
  if (!observations.length || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const packaging = creative?.packaging as Record<string, unknown> | undefined;
  return observations.map((observation) => {
    const shotStart = Math.max(start, Number(observation.start));
    const shotEnd = Math.min(end, Number(observation.end));
    const evidence = Array.isArray(observation.evidence) ? observation.evidence as Array<Record<string, unknown>> : [];
    const frameEvidence = evidence.find((item) => storyboardText(item.source) === "frame");
    const sound = verifiedLabelsInRange(packaging?.audio, shotStart, shotEnd)
      .filter((label) => !/(无解说|无旁白|无背景音乐|无音频|纯角色对白)/.test(label))
      .join("；");
    return {
      start: shotStart, end: shotEnd,
      characters: [storyboardText(observation.actorObserved)].filter(Boolean),
      scene: storyboardText(frameEvidence?.text) || storyboardText(observation.objectOrTargetObserved) || "原片场景",
      action: storyboardText(observation.actionObserved) || "原片动作",
      dialogue: storyboardText(observation.dialogueObserved) || undefined,
      visualStyle: verifiedLabelsInRange(packaging?.visual, shotStart, shotEnd).join("；") || undefined,
      transition: verifiedLabelsInRange(creative?.transitions, shotEnd - 0.08, shotEnd + 0.08).join("；") || undefined,
      sound: sound || undefined,
      verification: "verified",
      source: "legacy" as const,
    };
  });
};
const prefaceStoryboard = (asset: MaterialLibraryAsset): PrefaceStoryboardUnit[] => {
  const creative = asset.sourceAnalysis.creative as Record<string, unknown> | undefined;
  const rows = Array.isArray(creative?.prefaceStoryboard)
    ? (creative.prefaceStoryboard as Array<Record<string, unknown>>)
    : [];
  const structured = rows
    .map((row) => ({
      start: Number(row.start), end: Number(row.end),
      characters: Array.isArray(row.characters) ? row.characters.map(String).filter(Boolean) : [],
      scene: storyboardText(row.scene), action: storyboardText(row.action), spatialLayout: storyboardText(row.spatialLayout), objectState: storyboardText(row.objectState), visibleReaction: storyboardText(row.visibleReaction), dialogue: storyboardText(row.dialogue), speaker: storyboardText(row.speaker), dialogueType: storyboardText(row.dialogueType), subtitleText: storyboardText(row.subtitleText), speech: (Array.isArray(row.speech) ? row.speech : []).map((raw) => { const item = raw as Record<string, unknown>; return { speaker: storyboardText(item.speaker), type: storyboardText(item.type), text: storyboardText(item.text) }; }).filter((item) => item.text), onScreenText: (Array.isArray(row.onScreenText) ? row.onScreenText : []).map((raw) => { const item = raw as Record<string, unknown>; return { text: storyboardText(item.text), position: storyboardText(item.position), style: storyboardText(item.style) }; }).filter((item) => item.text),
      aspectRatio: storyboardText(row.aspectRatio), visualStyle: storyboardText(row.visualStyle),
      shotSize: storyboardText(row.shotSize), camera: storyboardText(row.camera),
      compositionMovement: storyboardText(row.compositionMovement), focus: storyboardText(row.focus),
      sound: storyboardText(row.sound), transition: storyboardText(row.transition), verification: storyboardText(row.verification), source: "structured" as const,
    }))
    .filter((unit) => Number.isFinite(unit.start) && Number.isFinite(unit.end) && unit.end > unit.start && unit.verification === "verified")
    .sort((left, right) => left.start - right.start);
  return structured.length ? structured : legacyPrefaceStoryboard(asset);
};
const hasCompleteStoryboardUnit = (unit: PrefaceStoryboardUnit) =>
  unit.source === "legacy" ||
  [unit.scene, unit.action]
    .every((value) => value && value !== "未确认");
const storyboardContinuityIssues = (
  asset: MaterialLibraryAsset,
  units: PrefaceStoryboardUnit[],
) => {
  const scope = asset.sourceAnalysis.scope as Record<string, unknown> | undefined;
  const start = Number(scope?.start ?? asset.clipStart ?? 0);
  const end = Number(scope?.end ?? asset.clipEnd ?? 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return ["前贴边界无效"];
  }
  const issues: string[] = [];
  let cursor = start;
  for (const unit of units) {
    if (unit.start > cursor + 0.08) {
      issues.push(`${wholeRange(cursor, unit.start)}缺少镜头证据`);
    }
    if (unit.start < cursor - 0.08) {
      issues.push(`${wholeRange(unit.start, cursor)}镜头重叠`);
    }
    cursor = Math.max(cursor, unit.end);
  }
  if (cursor < end - 0.08) {
    issues.push(`${wholeRange(cursor, end)}缺少镜头证据`);
  }
  return issues;
};
const analysisModules = (
  asset: MaterialLibraryAsset,
  kind: LibraryKind,
): Module[] => {
  const plot = compact(
    values(asset, "storyBeats"),
    "用人物目标、阻碍和结果线索构成递进",
  );
  if (kind === "narration") {
    const lines = narrationSegments(asset).map((segment) => segment.text);
    return [
      {
        id: "01",
        title: "解说口播与开头",
        text: lines.length
          ? `已提取的口播：${lines.slice(0, 2).join(" / ")}。开头先交代结果、危机或反差，再补足画面中不可见的因果，避免逐帧复述。`
          : "当前素材未提取到解说口播。请重跑分析后再生成制作单，不能用正片剧情摘要冒充解说文案。",
        metric: "",
        evidence: "ASR/字幕时间轴；仅提取解说覆盖区间。",
      },
      {
        id: "02",
        title: "叙事推进与信息节奏",
        text: `口播应围绕“发生什么 → 为什么发生 → 代价/下一步”推进。当前可核对的剧情节点：${plot}。每一段口播必须对应一个新增事实，而非重复描述同一画面。`,
        metric: "",
        evidence: "口播时码、原片剧情节点与画面对应关系。",
      },
      {
        id: "03",
        title: "口播—画面匹配",
        text: `${sourceFacts(asset).join("；") || "暂无带时码的画面证据"}。口播说因果时切结果或人物反应；口播说冲突时切动作完成点，不用无信息空镜填补。`,
        metric: "",
        evidence: "关键帧、镜头边界、ASR 与音频事件。",
      },
      {
        id: "04",
        title: "配音与结尾承诺",
        text: "用短句、口语化、由稳到紧的语气；在冲突词和反转词前留短停顿。结尾只停在尚未兑现的真相、反击或关系结果之前，给正片留下明确承接。",
        metric: "",
        evidence: "口播句段长度、音频节奏与末段剧情状态。",
      },
    ];
  }
  const view = buildPrefaceAnalysisView(asset);
  const evidence = view.evidence.length
    ? view.evidence.slice(0, 4).map((row) => `${wholeRange(row.start, row.end)}：${row.text}`).join("；")
    : "暂无已验证的片段内证据";
  return [
    {
      id: "01",
      title: "创作思路",
      text: view.creativeApproach || "当前片段缺少可验证的创作思路，请先重新分析。",
      metric: "",
      evidence,
    },
    {
      id: "02",
      title: "复刻思路",
      text: view.replicationLines.length
        ? view.replicationLines.map((row) => `${row.label}：${row.value}`).join("\n")
        : "当前片段缺少可复刻机制，请先重新分析。",
      metric: "",
      evidence,
    },
    {
      id: "03",
      title: "衔接正片方向",
      text: view.handoff || "当前片段尚未提取到可靠的正片承接方向，请先重新分析。",
      metric: "",
      evidence,
    },
  ];
};
const prefacePrompt = (asset: MaterialLibraryAsset, variant = "原片复刻") => {
  const units = prefaceStoryboard(asset);
  const incomplete = units.filter((unit) => !hasCompleteStoryboardUnit(unit));
  const continuityIssues = storyboardContinuityIssues(asset, units);
  if (!units.length || incomplete.length) {
    return `【${variant}｜原前贴镜头脚本】\n\n尚未生成新版镜头脚本。点击“重新生成并保存”，系统会直接重新观看原视频、逐镜拆分并在这里流式显示；完整性校验通过后才会保存和开放复制。`;
  }
  if (continuityIssues.length) {
    return `【${variant}｜原前贴镜头脚本】\n\n尚未生成新版镜头脚本。旧分析的镜头时间轴不连续，点击“重新生成并保存”后，系统会直接补扫原视频并流式输出整版脚本；不会把旧缺口提示保存成脚本。`;
  }
  const roles = new Map<string, string>();
  const role = (name: string) => {
    if (!roles.has(name)) roles.set(name, `@人物${roles.size + 1}`);
    return roles.get(name)!;
  };
  const shots = units.map((unit, index) => {
    const people = unit.characters.length ? unit.characters.map(role).join("、") : "@人物1";
    const line = (label: string, value?: string) => value && value !== "未确认" ? `【${label}】${value}` : "";
    const speechLines = (unit.speech || []).map((item) => `${item.type === "voiceover" ? "旁白" : "对白"}${item.speaker ? `（${item.speaker}）` : ""}：“${item.text}”`).join("\n");
    const dialogue = unit.dialogue && !["无对白", "无可确认对白", "未确认"].includes(unit.dialogue)
      ? ` ${unit.dialogueType === "voiceover" ? "旁白" : "对白"}${unit.speaker ? `（${unit.speaker}）` : ""}：“${unit.dialogue}”。`
      : "";
    return [
      `【分镜${index + 1}（${wholeRange(unit.start, unit.end)}）】`,
      line("画面参数", [unit.aspectRatio, unit.visualStyle].filter(Boolean).join("，")),
      line("相机参数", unit.camera),
      line("构图与运镜", unit.compositionMovement),
      line("焦点变换", unit.focus),
      `【画面描述】${unit.scene}。${people}：${unit.action}。${dialogue}`,
      line("空间关系", unit.spatialLayout),
      line("道具状态", unit.objectState),
      line("即时反应", unit.visibleReaction),
      line("原片语音", speechLines),
      line("声音", unit.sound),
      line("镜头衔接", unit.transition),
    ].filter(Boolean).join("\n");
  });
  const legacyNotice = units.some((unit) => unit.source === "legacy")
    ? "\n【历史素材说明】以下按已验证的历史镜头时间段还原；只有原片已识别的字段才会输出。重新分析后可获得更细的真实镜头边界与摄影参数。\n"
    : "";
  return `【${variant}｜原前贴镜头脚本】\n\n【基本信息】\n- 市场：${asset.platform || "手动上传"}\n- 语种：${asset.language || "待识别"}\n- 时长：${duration(asset)} 秒\n- 基本约束：人物仅使用 @人物编号；不得增加原片不存在的人物外貌、剧情、台词、字幕、水印、BGM 或镜头。${legacyNotice}\n【原片分镜】\n${shots.join("\n\n")}`;
};
const stripNonNarrativeScreenText = (value: string) => value
  .split(/\r?\n/)
  .map((line) => {
    const visualText = line.match(/^\s*【(?:画面文字|屏幕文字)】\s*(.+)$/);
    if (!visualText) return line;
    const text = visualText[1].trim();
    return /(?:片名|热播短剧|剧情虚构|AI生成|无不良价值观|画面均为AI生成|请勿模仿|水印|平台角标|扫码|点击下载|广告推广)/i.test(text)
      ? ""
      : `【画面描述】画面中可见文字：“${text}”。`;
  })
  .filter((line) => !/【(?:字幕|水印|片名|角标)】/.test(line))
  .filter((line) => !/^\s*(?:片名|左侧(?:竖排)?|右侧(?:竖排)?|底部(?:字幕)?|字幕|水印|角标)\s*[：:]/.test(line))
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
const narrationPrompt = (asset: MaterialLibraryAsset) => {
  const segments = narrationSegments(asset);
  if (!segments.length) {
    return "当前素材没有通过验证的独立解说口播。请先重新分析或进入人工复核；系统不会用角色对白、字幕或剧情摘要补写解说文案。";
  }
  return `【解说文案】\n\n${segments
    .map((segment) =>
      `【${wholeRange(segment.start, segment.end)}｜${segment.language}】\n${segment.text}`,
    )
    .join("\n\n")}`;
};

export function MaterialLibraryPanelV2({
  kind,
  assets,
  flash,
  onDeleted,
  onSelectForReplication,
}: Props) {
  const [query, setQuery] = useState(""),
    [genreFilter, setGenreFilter] = useState(""),
    [relationFilter, setRelationFilter] = useState(""),
    [hookFilter, setHookFilter] = useState(""),
    [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc"),
    [preview, setPreview] = useState<MaterialLibraryAsset | null>(null),
    [deleting, setDeleting] = useState<MaterialLibraryAsset | null>(null),
    [busy, setBusy] = useState(false);
  const genres = SHORT_DRAMA_GENRES;
  const relations = useMemo(() => [...new Set(assets.flatMap((asset) => [...values(asset, "relations"), ...values(asset, "relationships")]).filter(Boolean))], [assets]);
  const hooks = libraryHookTypes;
  const filtered = useMemo(() => assets.filter((asset) => {
    const content = `${asset.title} ${asset.sourceTitle || ""} ${asset.platform || ""} ${asset.genres.join(" ")}`.toLowerCase();
    const relationValues = [...values(asset, "relations"), ...values(asset, "relationships")];
    const hookValues = [canonicalLibraryHookType(asset)];
    return content.includes(query.toLowerCase()) && (!genreFilter || asset.genres.includes(genreFilter)) && (!relationFilter || relationValues.includes(relationFilter)) && (!hookFilter || hookValues.includes(hookFilter));
  }).sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || "") || 0;
    const rightTime = Date.parse(right.createdAt || "") || 0;
    return sortOrder === "asc" ? leftTime - rightTime : rightTime - leftTime;
  }), [assets, query, genreFilter, relationFilter, hookFilter, sortOrder]);
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await removeMaterialLibraryAsset(deleting.id);
      setDeleting(null);
      flash("素材已从素材库删除");
      onDeleted();
    } catch (error) {
      flash(error instanceof Error ? error.message : "素材删除失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.libraryPanel}>
      <div className={styles.libraryHeading}>
        <label className={styles.librarySearch}>
          <span className="sr-only">搜索素材库</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索资产、来源、平台或题材"
          />
          {query && (
            <button
              type="button"
              aria-label="清空素材库搜索"
              onClick={() => setQuery("")}
            >
              ×
            </button>
          )}
        </label>
        <button type="button" className={styles.librarySortButton} onClick={() => setSortOrder((value) => value === "asc" ? "desc" : "asc")} aria-label={sortOrder === "asc" ? "按入库时间倒序" : "按入库时间正序"} title={sortOrder === "asc" ? "入库时间倒序" : "入库时间正序"}>↕</button>
      </div>
      {kind === "ai_preface" && <div className={styles.libraryFilters}><label><span>题材类型</span><select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}><option value="">全部题材</option>{genres.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>人物关系</span><select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)}><option value="">全部关系</option>{relations.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>钩子类型</span><select value={hookFilter} onChange={(event) => setHookFilter(event.target.value)}><option value="">全部钩子</option>{hooks.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" onClick={() => { setQuery(""); setGenreFilter(""); setRelationFilter(""); setHookFilter(""); }}>清空筛选</button></div>}
      {filtered.length ? (
        <div className={`${styles.libraryGrid} ${kind === "ai_preface" ? styles.prefaceLibraryGrid : kind === "narration" ? styles.narrationLibraryGrid : ""}`}>
          {filtered.map((asset) => {
            const url = mediaUrl(asset);
            const href = `/?tab=${kind === "ai_preface" ? "replicate" : "narrationPreview"}&asset=${encodeURIComponent(asset.id)}`;
            return (
              <article className={`${styles.libraryCard} ${kind === "ai_preface" ? styles.prefaceLibraryCard : kind === "narration" ? styles.narrationLibraryCard : ""}`} key={asset.id}>
                <div
                  className={styles.libraryMediaShell}
                  onMouseEnter={(event) => {
                    const video = event.currentTarget.querySelector("video");
                    if (video) void video.play().catch(() => undefined);
                  }}
                  onMouseLeave={(event) => {
                    const video = event.currentTarget.querySelector("video");
                    if (video) {
                      video.pause();
                      video.currentTime = 0;
                    }
                  }}
                >
                  <button
                    type="button"
                    className={`${styles.libraryPreview} ${kind === "ai_preface" ? styles.prefaceLibraryPreview : kind === "narration" ? styles.narrationLibraryPreview : ""}`}
                    onClick={() => url && setPreview(asset)}
                    aria-label={`播放 ${asset.title}`}
                  >
                    {url ? (
                      <video src={url} muted playsInline preload="metadata" />
                    ) : (
                      <span>暂无片源</span>
                    )}
                    {url && <span className={styles.libraryDurationBadge}>{duration(asset)}秒</span>}
                  </button>
                  {kind === "ai_preface" && (
                    <div className={styles.prefaceCardOverlay} aria-label="卡片操作">
                      {url && (
                        <a href={url} download={asset.title} aria-label={`下载 ${asset.title}`} title="下载">
                          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v10m0 0 4-4m-4 4L6 8M3 16h14" /></svg>
                        </a>
                      )}
                      <button type="button" onClick={() => setDeleting(asset)} aria-label={`删除 ${asset.title}`} title="删除">
                        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12m-9 0v10m6-10v10M8 3h4l1 3H7l1-3Zm-3 3 1 11h8l1-11" /></svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className={styles.libraryCardBody}>
                  {kind !== "ai_preface" && <h3>{asset.title}</h3>}
                  <div className={styles.tags}>
                    {asset.genres.slice(0, 4).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    <span>{asset.audienceType || "受众待定"}</span>
                    <span>{asset.language || "语种待定"}</span>
                  </div>
                  <div className={styles.cardButtons}>
                    {kind !== "ai_preface" && url && (
                      <>
                        <button type="button" onClick={() => setPreview(asset)}>
                          预览
                        </button>
                        <a href={url} download={asset.title}>
                          下载
                        </a>
                      </>
                    )}
                    <a className={styles.primary} href={href}>
                      {kind === "ai_preface" ? "预览" : "预览分析"}
                    </a>
                    {kind === "ai_preface" && onSelectForReplication && (
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={() => onSelectForReplication(asset)}
                      >
                        迭代复刻
                      </button>
                    )}
                    {kind !== "ai_preface" && <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => setDeleting(asset)}
                    >
                      删除
                    </button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.statePanel}>
          <h3>暂无素材</h3>
          <p>分析完成后会自动进入这里。</p>
        </div>
      )}
      {preview && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <section className={styles.videoPreviewModal}>
            <header>
              <b>{preview.title}</b>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="关闭预览"
              >
                ×
              </button>
            </header>
            <video src={mediaUrl(preview)} controls autoPlay playsInline />
          </section>
        </div>
      )}
      {deleting && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <section className={styles.deleteModal}>
            <h3>删除素材？</h3>
            <p>将从素材库移除“{deleting.title}”，此操作不可撤销。</p>
            <footer>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void remove()}
                disabled={busy}
              >
                {busy ? "删除中…" : "确认删除"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function AnalysisCopy({ text }: { text: string }) {
  return (
    <div className={styles.analysisCopy}>
      {text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const divider = line.indexOf("：");
          const label = divider >= 0 ? line.slice(0, divider + 1) : "";
          const value = divider >= 0 ? line.slice(divider + 1) : line;
          return (
            <p key={line}>
              <strong>{label}</strong>
              {value}
            </p>
          );
        })}
    </div>
  );
}

export function LibraryAnalysisPage({
  asset,
  kind,
  allAssets = [asset],
  onBack,
  flash,
  workflow = "analysis",
}: {
  asset: MaterialLibraryAsset;
  kind: LibraryKind;
  allAssets?: MaterialLibraryAsset[];
  onBack: () => void;
  flash: (message: string) => void;
  workflow?: "analysis" | "script" | "fission" | "adapt";
}) {
  const isPreface = kind === "ai_preface";
  const initialFissionVersions = useMemo(() => {
    const stored = asset.promptBlueprint.fissionVersions;
    return (Array.isArray(stored) ? stored : [])
      .map((value) => value as Partial<PromptFissionPlan>)
      .filter((value): value is PromptFissionPlan => Boolean(value.id && value.sourceDiagnosis && value.baseline?.prompt && value.variants?.length))
      .sort((left, right) => Number(left.version || 0) - Number(right.version || 0));
  }, [asset.promptBlueprint]);
  const initialNarrationVersions = useMemo(() => {
    const stored = asset.promptBlueprint.narrationFissionVersions;
    return (Array.isArray(stored) ? stored : [])
      .map((value) => value as Partial<NarrationFissionPlan>)
      .filter((value): value is NarrationFissionPlan => Boolean(value.id && value.baseline?.copy && value.variants?.length))
      .sort((left, right) => Number(left.version || 0) - Number(right.version || 0));
  }, [asset.promptBlueprint]);
  const [fissionVersions, setFissionVersions] = useState<PromptFissionPlan[]>(initialFissionVersions);
  const [fissionPlan, setFissionPlan] = useState<PromptFissionPlan | null>(initialFissionVersions.at(-1) || null);
  const [narrationVersions, setNarrationVersions] = useState<NarrationFissionPlan[]>(initialNarrationVersions);
  const [narrationPlan, setNarrationPlan] = useState<NarrationFissionPlan | null>(initialNarrationVersions.at(-1) || null);
  const [fissionBusy, setFissionBusy] = useState(false);
  const adaptationTargets = useMemo(() => allAssets.filter((item) => item.id !== asset.id), [allAssets, asset.id]);
  const [adaptTargetId, setAdaptTargetId] = useState(adaptationTargets[0]?.id || "");
  const [adaptationBusy, setAdaptationBusy] = useState(false);
  const [adaptationError, setAdaptationError] = useState("");
  const [adaptationPlan, setAdaptationPlan] = useState<MaterialAdaptationPlan | null>(null);
  const [fissionError, setFissionError] = useState("");
  const [fissionSettings, setFissionSettings] = useState<PromptFissionSettings>(() => {
    const saved = initialFissionVersions.at(-1)?.settings;
    const isKnownMode = (value: string | undefined) => intensityOptions.some(([id]) => id === value);
    const isKnownQuestion = (value: string | undefined) => prefaceGoalOptions.some(([id]) => id === value);
    const isKnownDirection = (value: string | undefined) => prefaceDirectionOptions.some(([id]) => id === value);
    return {
      intensity: isKnownMode(saved?.intensity) ? saved!.intensity : "light",
      goal: isKnownQuestion(saved?.goal) ? saved!.goal : "what_next",
      primaryDirection: isKnownDirection(saved?.primaryDirection) ? saved!.primaryDirection : "anomaly_event",
      secondaryDirection: isKnownDirection(saved?.secondaryDirection) ? saved!.secondaryDirection : "suspense_ending",
      outputLanguage: saved?.outputLanguage || "follow_source",
      dialogueLanguage: saved?.dialogueLanguage || "follow_output",
      narrationLanguage: saved?.narrationLanguage || "follow_output",
      onScreenTextLanguage: "none",
      promptLanguage: saved?.promptLanguage || "zh-CN",
      mechanism: saved?.mechanism || "gratitude_warning",
      targetGenre: saved?.targetGenre || "wealthy_runaway",
      targetRelationship: saved?.targetRelationship || "pregnant_runaway",
      targetConflict: saved?.targetConflict || "pregnancy_exposed",
      targetBrief: saved?.targetBrief || "",
      plotSlots: saved?.plotSlots || ["施恩者", "报恩者", "危险", "预警方式", "未完成动作"],
      handoffMethod: saved?.handoffMethod || "question_answer",
      conflictFreedom: saved?.conflictFreedom || "bounded",
    };
  });
  const [narrationSettings, setNarrationSettings] = useState<NarrationFissionPlan["settings"]>(() => {
    const saved = initialNarrationVersions.at(-1)?.settings;
    return {
      intensity: saved?.intensity || "light",
      goal: saved?.goal || "opening",
      primaryDirection: saved?.primaryDirection || "result_first",
      secondaryDirection: saved?.secondaryDirection || "reveal_order",
      outputLanguage: saved?.outputLanguage || "follow_source",
      promptLanguage: saved?.promptLanguage || "zh-CN",
    };
  });
  const initialScriptVersions = useMemo(() => {
    const stored = asset.promptBlueprint[isPreface ? "scriptVersions" : "narrationScriptVersions"];
    return (Array.isArray(stored) ? stored : [])
      .map((value) => value as Partial<PrefaceScriptVersion>)
      .filter((value): value is PrefaceScriptVersion => typeof value.prompt === "string" && Boolean(value.prompt))
      .sort((left, right) => Number(left.version || 0) - Number(right.version || 0));
  }, [asset.promptBlueprint, isPreface]);
  const [scriptVersions, setScriptVersions] = useState<PrefaceScriptVersion[]>(initialScriptVersions);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptError, setScriptError] = useState("");
  const [streamedScript, setStreamedScript] = useState("");
  const [scriptStatus, setScriptStatus] = useState("");
  const modules = analysisModules(asset, kind);
  const generatedScript = scriptVersions.at(-1)?.prompt;
  const cleanedGeneratedScript = generatedScript && isPreface ? stripNonNarrativeScreenText(generatedScript) : generatedScript;
  const prompt = (scriptBusy && streamedScript) || cleanedGeneratedScript || (isPreface ? prefacePrompt(asset) : narrationPrompt(asset));
  const verifiedNarration = isPreface ? [] : narrationSegments(asset);
  const prefaceUnits = isPreface ? prefaceStoryboard(asset) : [];
  const prefaceContinuityIssues = isPreface ? storyboardContinuityIssues(asset, prefaceUnits) : [];
  const canCopyPrefaceScript = !isPreface || (prefaceUnits.length > 0 && prefaceUnits.every(hasCompleteStoryboardUnit) && prefaceContinuityIssues.length === 0);
  const canCopyScript = isPreface
    ? Boolean(generatedScript) || canCopyPrefaceScript
    : Boolean(generatedScript) || verifiedNarration.length > 0;
  const canRegenerateScript = !isPreface || (asset.clipStatus === "ready" && Boolean(asset.mediaUrl));
  const copyText = async (value: string, successMessage = "提示词已复制") => {
    try {
      await navigator.clipboard.writeText(value);
      flash(successMessage);
    } catch {
      flash("复制失败，请手动复制");
    }
  };
  const copy = async (value = prompt) => {
    if (!canCopyScript) {
      flash(isPreface ? "当前素材缺少完整逐镜头证据，请重新分析后再复制" : "当前素材没有通过验证的独立解说口播");
      return;
    }
    await copyText(isPreface ? stripNonNarrativeScreenText(value) : value, isPreface ? "提示词已复制" : "解说文案已复制");
  };
  const workflowHref = (step: "analysis" | "script" | "fission" | "adapt") =>
    `/?tab=${isPreface ? "replicate" : "narrationPreview"}&asset=${encodeURIComponent(asset.id)}&workflow=${step}`;
  const regenerateScript = async () => {
    if (scriptBusy) return;
    setScriptBusy(true);
    setScriptError("");
    setStreamedScript("");
    setScriptStatus(isPreface ? "正在读取原前贴…" : "正在读取音轨…");
    try {
      const generate = isPreface ? regeneratePrefaceStoryboard : regenerateNarrationScript;
      const next = await generate(asset.id, (event) => {
        if (event.type === "reset") {
          setStreamedScript("");
          setScriptStatus(event.status || "正在重新生成完整版本…");
        } else if (event.type === "status") setScriptStatus(event.status);
        else if (event.type === "delta") setStreamedScript((current) => current + event.delta);
      });
      setScriptVersions((current) => [...current, next]);
      setStreamedScript("");
      flash(`已生成并保存${isPreface ? "镜头脚本" : "解说文案"} V${next.version}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `${isPreface ? "镜头脚本" : "解说文案"}重新生成失败`;
      setScriptError(message);
      flash(message);
    } finally {
      setScriptBusy(false);
      setScriptStatus("");
    }
  };
  const generateFission = async () => {
    setFissionBusy(true);
    setFissionError("");
    try {
      if (isPreface) {
        const mechanisms = creativeMechanisms(asset.hitReasons.map((reason) => String(reason.reason || "")));
        const plan = await createPromptFission(
          asset.id,
          mechanisms.slice(0, 3),
          [fissionSettings.primaryDirection, fissionSettings.secondaryDirection],
          fissionSettings,
        );
        setFissionPlan(plan);
        setFissionVersions((current) => [...current.filter((item) => item.id !== plan.id), plan].slice(-10));
        flash(`已生成${plan.version ? `并保存 V${plan.version}` : "（尚未保存）"}：${plan.variants.length} 组前贴剧情分支`);
      } else {
        const plan = await createNarrationFission(asset.id, narrationSettings);
        setNarrationPlan(plan);
        setNarrationVersions((current) => [...current.filter((item) => item.id !== plan.id), plan].slice(-10));
        flash(`已生成并保存 V${plan.version}：V0 + 五组解说文案`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : isPreface ? "前贴裂变失败" : "解说文案裂变失败";
      setFissionError(message);
      flash(message);
    } finally {
      setFissionBusy(false);
    }
  };
  const generateAdaptation = async () => {
    if (!adaptTargetId || adaptationBusy) return;
    setAdaptationBusy(true); setAdaptationError("");
    try {
      const plan = await createMaterialAdaptation(asset.id, adaptTargetId, kind);
      setAdaptationPlan(plan);
      flash(`已保存跨剧适配 V${plan.version}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "跨剧适配失败";
      setAdaptationError(message); flash(message);
    } finally { setAdaptationBusy(false); }
  };
  const updateFissionSetting = <Key extends keyof PromptFissionSettings>(
    key: Key,
    value: PromptFissionSettings[Key],
  ) => {
    setFissionSettings((current) => ({ ...current, [key]: value }));
    setFissionPlan(null);
  };
  const updateNarrationSetting = <Key extends keyof NarrationFissionPlan["settings"]>(
    key: Key,
    value: NarrationFissionPlan["settings"][Key],
  ) => {
    setNarrationSettings((current) => ({ ...current, [key]: value }));
    setNarrationPlan(null);
  };
  const openFissionVersion = (plan: PromptFissionPlan) => {
    setFissionPlan(plan);
    setFissionSettings((current) => ({
      ...current,
      ...plan.settings,
      intensity: intensityOptions.some(([id]) => id === plan.settings.intensity) ? plan.settings.intensity : "light",
      goal: prefaceGoalOptions.some(([id]) => id === plan.settings.goal) ? plan.settings.goal : "what_next",
      primaryDirection: prefaceDirectionOptions.some(([id]) => id === plan.settings.primaryDirection) ? plan.settings.primaryDirection : "anomaly_event",
      secondaryDirection: prefaceDirectionOptions.some(([id]) => id === plan.settings.secondaryDirection) ? plan.settings.secondaryDirection : "suspense_ending",
      onScreenTextLanguage: "none",
    }));
  };
  return (
    <section className={styles.analysisWorkspace}>
      <header className={styles.analysisPageHeader}>
        <button type="button" onClick={onBack}>
          ← 返回{isPreface ? "AI 前贴库" : "解说库"}
        </button>
          <nav className={styles.prefaceWorkflow} aria-label={isPreface ? "AI 前贴工作流" : "解说工作流"}>
            <a
              className={
                workflow === "analysis" ? styles.activeWorkflowStep : ""
              }
              aria-current={workflow === "analysis" ? "page" : undefined}
              href={workflowHref("analysis")}
            >
              <small>01</small>{isPreface ? "前贴素材分析" : "解说素材分析"}
            </a>
            <a
              className={
                workflow === "script" ? styles.activeWorkflowStep : ""
              }
              aria-current={workflow === "script" ? "page" : undefined}
              href={workflowHref("script")}
            >
              <small>02</small>{isPreface ? "原前贴镜头脚本" : "解说文案"}
            </a>
            <a
              className={
                workflow === "fission" ? styles.activeWorkflowStep : ""
              }
              aria-current={workflow === "fission" ? "page" : undefined}
              href={workflowHref("fission")}
            >
              <small>03</small>{isPreface ? "前贴裂变 / 复刻" : "解说文案裂变"}
            </a>
            <a className={workflow === "adapt" ? styles.activeWorkflowStep : ""} aria-current={workflow === "adapt" ? "page" : undefined} href={workflowHref("adapt")}>
              <small>04</small>跨剧适配
            </a>
          </nav>
      </header>
      {workflow === "analysis" && <div className={styles.analysisTop}>
        <aside className={styles.analysisVideo}>
          {mediaUrl(asset) ? (
            <video src={mediaUrl(asset)} controls playsInline />
          ) : (
            <p>暂无可播放视频</p>
          )}
          <h3>基本标签</h3>
          <div className={styles.tags}>
            {asset.genres.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            <span>{asset.audienceType || "受众待定"}</span>
            <span>{asset.language || "语种待定"}</span>
          </div>
        </aside>
        <main className={styles.analysisModules}>
          {modules.map((module) => (
            <article key={module.id}>
              <span>{module.id}</span>
              <div>
                <small>{module.metric}</small>
                <h3>{module.title}</h3>
                <AnalysisCopy text={module.text} />
                <em>依据：{module.evidence}</em>
              </div>
            </article>
          ))}
        </main>
      </div>}
      {workflow === "script" && <section className={styles.replicationPrompt}>
        <div>
          <span className={styles.eyebrow}>
            {isPreface
              ? "READY-TO-GENERATE STORYBOARD"
              : "VERIFIED NARRATION COPY"}
          </span>
          <h2>
            {isPreface ? "原前贴镜头脚本提示词" : "解说文案"}
          </h2>
          <p>
            {isPreface
              ? "完整还原前贴的连续镜头、动作、对白、景别、运镜和声音。"
              : "只保留模型确认的独立解说口播；不混入角色对白、字幕或剧情摘要。"}
          </p>
        </div>
        <div className={styles.scriptActions}>
          <button
            type="button"
            onClick={() => void regenerateScript()}
            disabled={scriptBusy || !canRegenerateScript}
            aria-busy={scriptBusy}
            title={!canRegenerateScript ? "前贴片段尚未完成切割，请先重新分析或人工确认边界" : undefined}
          >
            {scriptBusy ? (isPreface ? "镜头脚本生成中…" : "解说文案生成中…") : "重新生成并保存"}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void copy()}
            disabled={!canCopyScript}
            title={!canCopyScript ? `需要完整且连续的逐镜头证据后才能复制：${prefaceContinuityIssues.join("；")}` : undefined}
          >
            {isPreface ? "复制提示词" : "复制解说文案"}
          </button>
        </div>
        {!canRegenerateScript && <div className={styles.generationError} role="alert"><strong>前贴片段尚未完成切割</strong><span>请先重新分析或在人工复核中确认可执行边界；系统不会再使用完整原片代替前贴。</span></div>}
        {scriptVersions.length > 0 && <div className={styles.scriptVersions} aria-label={isPreface ? "已保存的镜头脚本版本" : "已保存的解说文案版本"}>
          {scriptVersions.map((version) => <button type="button" key={version.id} onClick={() => void copy(version.prompt)} title={version.createdAt}>V{version.version} · 复制已保存版本</button>)}
        </div>}
        {scriptBusy && <div className={styles.scriptStreamStatus} role="status"><span aria-hidden="true" /> <strong>{scriptStatus || "正在生成…"}</strong><small>内容会边生成边显示，完整校验通过后自动保存为新版本。</small></div>}
        {scriptError && <div className={styles.generationError} role="alert"><strong>本次生成未保存</strong><span>{scriptError}</span><small>原有版本没有被覆盖，可以再次点击“重新生成并保存”。</small></div>}
        <pre aria-live="polite" aria-busy={scriptBusy}>{prompt}</pre>
      </section>}
      {workflow === "fission" && (
        <section className={styles.fissionPanel}>
          <header className={styles.fissionIntro}>
            <span className={styles.eyebrow}>{isPreface ? "CONTROLLED PREFACE FISSION" : "CONTROLLED NARRATION FISSION"}</span>
            <h2>{isPreface ? "基于原前贴生成迭代提示词" : "基于原口播生成解说文案裂变"}</h2>
            <p>
              {isPreface
                ? "复刻仍保留原前贴表面；裂变则保留母版因果机制，把人物功能、危险和预警载体映射到新的题材中，再生成 V0 和五组可直接使用的 AIGC 前贴提示词。"
                : "只使用已验证的独立解说口播作为事实边界，生成一份原文基准版和五份可直接配音的完整文案。"}
            </p>
          </header>

          <div className={styles.fissionWorkbench}>
          <aside className={styles.fissionControls} aria-label="裂变参数设置">
          <div className={styles.fissionSourceFlow} aria-label={isPreface ? "前贴裂变来源" : "解说裂变来源"}>
            <article>
              <small>{isPreface ? "钩子母版 · 当前 AI 前贴" : "文案母版 · 当前解说素材"}</small>
              <strong>{asset.title}</strong>
              <p>{isPreface ? "锁定异常事件、人物关系、因果链、剧情承诺与结尾接片姿态。" : `${verifiedNarration.length} 段已验证口播；角色对白不会进入裂变文案。`}</p>
            </article>
            <span aria-hidden="true">→</span>
            <article>
              <small>输出 · 五引擎十五分支</small>
              <strong>{isPreface ? "V0 + V1—V5 × A/B/C" : "V0 + V1—V5"}</strong>
              <p>{isPreface ? "每个故事引擎下提供现实适配、异常事件和高冲突翻转三种完整方案。" : "每版只包含配音正文，不含镜头说明或分析话术。"}</p>
            </article>
          </div>

          <div className={styles.fissionDirectionPanel}>
            <div>
              <span className={styles.eyebrow}>ITERATION CONTROL</span>
              <h3>{isPreface ? "定义前贴的迭代机制" : "选择裂变目标与方向"}</h3>
              <p>{isPreface ? "先确定变化幅度，再确定结尾留给观众的具体问题；主、辅维度只控制制作手段。" : "每次生成都会保存为新版本，可随时复制旧版本。"}</p>
            </div>
            {isPreface ? <>
              <div className={styles.fissionLanguageGrid}>
                <label>母版核心机制<select value={fissionSettings.mechanism} onChange={(event) => updateFissionSetting("mechanism", event.target.value)} disabled={fissionBusy}>{mechanismOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>迭代层级<select value={fissionSettings.intensity} onChange={(event) => updateFissionSetting("intensity", event.target.value)} disabled={fissionBusy}>{intensityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>目标题材与核心冲突<select value={fissionSettings.targetGenre} onChange={(event) => updateFissionSetting("targetGenre", event.target.value)} disabled={fissionBusy}>{targetGenreOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>目标人物关系<select value={fissionSettings.targetRelationship} onChange={(event) => updateFissionSetting("targetRelationship", event.target.value)} disabled={fissionBusy}>{targetRelationshipOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>目标主要危险<select value={fissionSettings.targetConflict} onChange={(event) => updateFissionSetting("targetConflict", event.target.value)} disabled={fissionBusy}>{targetConflictOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>正片接片方式<select value={fissionSettings.handoffMethod} onChange={(event) => updateFissionSetting("handoffMethod", event.target.value)} disabled={fissionBusy}>{handoffMethodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>冲突创作强度<select value={fissionSettings.conflictFreedom} onChange={(event) => updateFissionSetting("conflictFreedom", event.target.value)} disabled={fissionBusy}>{conflictFreedomOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <label className={styles.fullWidthField}>目标题材补充说明<input value={fissionSettings.targetBrief} onChange={(event) => updateFissionSetting("targetBrief", event.target.value)} placeholder="例如：女主怀孕后逃离豪门，家族正在追捕她" disabled={fissionBusy} /></label>
              <label className={styles.fullWidthField}>剧情槽位映射（用“、”分隔）<input value={(fissionSettings.plotSlots || []).join("、")} onChange={(event) => updateFissionSetting("plotSlots", event.target.value.split("、").map((item) => item.trim()).filter(Boolean))} placeholder="施恩者、报恩者、危险、预警方式、未完成动作" disabled={fissionBusy} /></label>
              <p className={styles.controlHint}>系统会生成 V1—V5 五种故事引擎，每个版本再生成 A/B/C 三个剧情分支；人物、动作、背景和关键事件均可重构。</p>
            </> : <div className={styles.fissionLanguageGrid}>
              <label>裂变强度<select value={narrationSettings.intensity} onChange={(event) => updateNarrationSetting("intensity", event.target.value)} disabled={fissionBusy}>{narrationIntensityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>核心目标<select value={narrationSettings.goal} onChange={(event) => updateNarrationSetting("goal", event.target.value)} disabled={fissionBusy}>{narrationGoalOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>主裂变方向<select value={narrationSettings.primaryDirection} onChange={(event) => updateNarrationSetting("primaryDirection", event.target.value)} disabled={fissionBusy}>{narrationDirectionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>辅助方向<select value={narrationSettings.secondaryDirection} onChange={(event) => updateNarrationSetting("secondaryDirection", event.target.value)} disabled={fissionBusy}>{narrationDirectionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>}
          </div>

          <div className={styles.fissionLanguagePanel}>
            <div>
              <span className={styles.eyebrow}>LANGUAGE CONTROL</span>
              <h3>{isPreface ? "分别控制成片、对白和旁白" : "控制解说正文和说明语言"}</h3>
              <p>{isPreface ? "语言不改变钩子结构与剧情事实；画面不生成标题、字幕、水印或平台角标。" : "语言不改变钩子结构与剧情事实；按目标市场自然改写，不逐字翻译。"}</p>
            </div>
            <div className={styles.fissionLanguageGrid}>
              <label>
                成片语言
                <select aria-label={isPreface ? "成片语言" : "解说正文语言"} value={isPreface ? fissionSettings.outputLanguage : narrationSettings.outputLanguage} onChange={(event) => isPreface ? updateFissionSetting("outputLanguage", event.target.value) : updateNarrationSetting("outputLanguage", event.target.value)} disabled={fissionBusy}>
                  {outputLanguageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {isPreface && <label>
                对白语言
                <select aria-label="对白语言" value={fissionSettings.dialogueLanguage} onChange={(event) => updateFissionSetting("dialogueLanguage", event.target.value)} disabled={fissionBusy}>
                  {trackLanguageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>}
              {isPreface && <label>
                旁白语言
                <select aria-label="旁白语言" value={fissionSettings.narrationLanguage} onChange={(event) => updateFissionSetting("narrationLanguage", event.target.value)} disabled={fissionBusy}>
                  {trackLanguageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>}
              <label>
                提示词说明语言
                <select aria-label="提示词说明语言" value={isPreface ? fissionSettings.promptLanguage : narrationSettings.promptLanguage} onChange={(event) => isPreface ? updateFissionSetting("promptLanguage", event.target.value) : updateNarrationSetting("promptLanguage", event.target.value)} disabled={fissionBusy}>
                  <option value="zh-CN">中文</option>
                  <option value="en-US">英语</option>
                </select>
              </label>
            </div>
          </div>

          <div className={styles.fissionActionBar}>
            <p>
              {isPreface ? "不生成视频，只输出可复制到 AI 视频工具的完整分镜提示词。" : "不生成视频，只输出可直接交给配音或剪辑环节的完整解说正文。"}
            </p>
            <button type="button" className={styles.primary} onClick={() => void generateFission()} disabled={fissionBusy || (!isPreface && !verifiedNarration.length)} aria-busy={fissionBusy}>
              {fissionBusy ? "正在生成并校验…" : isPreface ? "生成 V0 + 15 组剧情分支" : "生成 V0 + 五组解说文案"}
            </button>
          </div>
          </aside>

          <main className={styles.fissionOutput} aria-live="polite" aria-busy={fissionBusy}>
            <header className={styles.fissionOutputHeader}>
              <div><span className={styles.eyebrow}>GENERATED VERSIONS</span><h3>{isPreface ? "裂变提示词" : "解说裂变文案"}</h3></div>
              <p>选择历史版本或生成新版本，所有成功结果都会保存在这里。</p>
            </header>

          {(isPreface ? fissionVersions.length : narrationVersions.length) > 0 && (
            <div className={styles.fissionVersions} aria-label={isPreface ? "已保存的前贴裂变版本" : "已保存的解说裂变版本"}>
              <b>已保存版本</b>
              {isPreface ? fissionVersions.map((plan) => (
                <button
                  type="button"
                  key={plan.id}
                  aria-pressed={fissionPlan?.id === plan.id}
                  onClick={() => openFissionVersion(plan)}
                  title={plan.createdAt || ""}
                >
                  V{plan.version} · 前贴提示词
                </button>
              )) : narrationVersions.map((plan) => <button type="button" key={plan.id} aria-pressed={narrationPlan?.id === plan.id} onClick={() => { setNarrationPlan(plan); setNarrationSettings(plan.settings); }} title={plan.createdAt}>V{plan.version} · 解说文案</button>)}
            </div>
          )}

          {fissionBusy && <div className={styles.generationPending} role="status"><strong>正在分析原素材并生成十五个剧情分支</strong><span>模型需要完成机制提取、五个故事引擎、十五个分支和结果校验，通常需要约 1–3 分钟。</span></div>}
          {!fissionBusy && fissionError && <div className={styles.generationError} role="alert"><strong>本次生成失败</strong><span>{fissionError}</span><small>当前参数和已有版本均已保留，可以直接重试。</small></div>}
          {!fissionBusy && !fissionError && !(isPreface ? fissionPlan : narrationPlan) && <div className={styles.fissionEmpty}><strong>尚未生成裂变版本</strong><span>在左侧完成方向和语言选择后，点击生成按钮。</span></div>}

          {isPreface && fissionPlan ? (
            <div className={styles.fissionResults}>
              <section className={styles.fissionCompatibility}>
                <div>
                  <span>钩子基因</span>
                  <strong>已锁定</strong>
                  <em>{fissionPlan.sourceDiagnosis.hookQuestion}</em>
                </div>
                <p>{fissionPlan.sourceDiagnosis.summary}</p>
                <p><b>剧情承诺：</b>{fissionPlan.sourceDiagnosis.narrativePromise}</p>
                <small>锁定项：{fissionPlan.sourceDiagnosis.lockedElements.join("；")}</small>
              </section>
              {(fissionPlan.targetMapping?.length || fissionPlan.handoff) && <section className={styles.fissionCompatibility}>
                <div><span>机制 → 目标槽位</span><strong>{fissionPlan.targetMapping?.length || 0} 项已映射</strong></div>
                {fissionPlan.targetMapping?.map((item) => <p key={item.slot}><b>{item.slot}：</b>{item.targetApplication} <small>依据：{item.evidence}</small></p>)}
                {fissionPlan.handoff && <p><b>正片接片：</b>{fissionPlan.handoff.method}；{fissionPlan.handoff.targetEntry}；{fissionPlan.handoff.bridgeAction}；{fissionPlan.handoff.bridgeAudio}</p>}
              </section>}

              <article className={styles.fissionBaseline}>
                <header>
                  <div>
                    <small>CONTROL · V0</small>
                    <h3>{fissionPlan.baseline.title}</h3>
                  </div>
                  <button type="button" onClick={() => void copyText(fissionPlan.baseline.prompt, "V0 基准版提示词已复制")}>复制 V0 提示词</button>
                </header>
                <p>{fissionPlan.baseline.prompt}</p>
                <details>
                  <summary>查看 V0 分镜与锁定项</summary>
                  <ol>{fissionPlan.baseline.storyboard.map((step, index) => <li key={index}>{step}</li>)}</ol>
                  <small>锁定项：{fissionPlan.baseline.lockedElements.join("；")}</small>
                </details>
              </article>

              {storyEngineOptions.map(([engine, engineLabel], engineIndex) => {
                const engineVariants = fissionPlan.variants.filter((variant, variantIndex) => {
                  const legacyEngine = storyEngineOptions[Math.min(variantIndex, storyEngineOptions.length - 1)]?.[0];
                  return (variant.storyEngine || legacyEngine) === engine;
                });
                return <section key={engine} className={styles.fissionCompatibility}>
                  <div><span>{engineLabel}</span><strong>{engineVariants.length}/3 分支</strong></div>
                  <p>同一故事引擎下，A/B/C 必须使用不同的核心冲突事件。</p>
                  <div className={styles.fissionResults}>
                    {engineVariants.map((variant) => {
                      const branchLabel = branchOptions.find(([value]) => value === variant.branch)?.[1] || variant.branchLabel || "历史版本";
                      return <article key={`${variant.storyEngine || engine}-${variant.branch || "legacy"}-${variant.title}`}>
                        <header>
                          <div>
                            <small>V{engineIndex + 1}-{variant.branch || "旧版"} · {branchLabel}</small>
                            <h3>{variant.title}</h3>
                          </div>
                          <button type="button" onClick={() => void copyText(variant.prompt, `${variant.title} 提示词已复制`)}>复制该版提示词</button>
                        </header>
                        <b>故事引擎：{variant.storyEngine || engine} · 分支：{variant.branchLabel || "历史版本"}</b>
                        <p>{variant.synopsis}</p>
                        <b>变化结构：{variant.changedDimension}</b>
                        {variant.experiment && <small>实验方向：{variant.experiment}</small>}
                        {variant.hypothesis && <small>验证假设：{variant.hypothesis}</small>}
                        <em>{variant.difference}</em>
                        <p>{variant.prompt}</p>
                        <details>
                          <summary>查看完整分镜与变化项</summary>
                          <ol>{variant.storyboard.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
                          <small>变化内容：{variant.changedContent.join("、")}</small>
                          {variant.creativeAdditions?.length ? <small>新增冲突事件：{variant.creativeAdditions.join("、")}</small> : null}
                          {variant.directionTags.length > 0 && <small>方向标签：{variant.directionTags.join("、")}</small>}
                        </details>
                      </article>;
                    })}
                  </div>
                </section>;
              })}
            </div>
          ) : null}
          {!isPreface && narrationPlan ? (
            <div className={styles.fissionResults}>
              <section className={styles.fissionCompatibility}>
                <div><span>原文事实边界</span><strong>已锁定</strong></div>
                <p>{narrationPlan.sourceDiagnosis.summary}</p>
                <small>不可改写事实：{narrationPlan.sourceDiagnosis.lockedFacts.join("；")}</small>
              </section>
              <article className={styles.fissionBaseline}>
                <header><div><small>CONTROL · V0</small><h3>{narrationPlan.baseline.title}</h3></div><button type="button" onClick={() => void copyText(narrationPlan.baseline.copy, "原解说文案已复制")}>复制 V0 文案</button></header>
                <p>{narrationPlan.baseline.copy}</p>
              </article>
              {narrationPlan.variants.map((variant, index) => <article key={`${variant.title}-${index}`}><header><div><small>ITERATION · V{index + 1}</small><h3>{variant.title}</h3></div><button type="button" onClick={() => void copyText(variant.copy, `V${index + 1} 解说文案已复制`)}>复制该版文案</button></header><b>改变：{variant.changedDimension}</b><em>{variant.difference}</em><p>{variant.copy}</p>{variant.tags.length > 0 && <small>标签：{variant.tags.join("、")}</small>}</article>)}
            </div>
          ) : null}
          </main>
          </div>
        </section>
      )}
      {workflow === "adapt" && (
        <section className={styles.fissionPanel}>
          <header className={styles.fissionIntro}>
            <span className={styles.eyebrow}>CROSS-DRAMA ADAPTATION</span>
            <h2>{isPreface ? "把前贴模板接入另一部剧" : "把解说机制迁移到另一部剧"}</h2>
            <p>{isPreface ? "只迁移可复用的钩子机制，不复制原剧人物和剧情。适配方案必须回答：前贴结束后从目标正片哪里切入、用什么动作和声音接上。" : "只迁移叙事结构，所有人物、关系和事实以目标剧证据为准。"}</p>
          </header>
          <div className={styles.fissionWorkbench}>
            <aside className={styles.fissionControls} aria-label="跨剧适配设置">
              <div className={styles.fissionSourceFlow}>
                <article><small>模板母版</small><strong>{asset.title}</strong><p>提取钩子机制、叙事节奏和可迁移结构。</p></article>
                <span aria-hidden="true">→</span>
                <article><small>目标剧</small><select aria-label="选择目标剧" value={adaptTargetId} onChange={(event) => { setAdaptTargetId(event.target.value); setAdaptationPlan(null); }} disabled={adaptationBusy}>
                  <option value="">请选择目标素材</option>
                  {adaptationTargets.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.kind === "ai_preface" ? "前贴" : "解说"}</option>)}
                </select><p>目标剧事实、画面和切入点优先。</p></article>
              </div>
              <div className={styles.fissionDirectionPanel}>
                <div><span className={styles.eyebrow}>TRANSFER RULES</span><h3>先判断能不能迁移</h3><p>模板机制与目标证据逐条映射；人物、台词、关系和结局不得跨剧带入。</p></div>
                <div className={styles.fissionLanguageGrid}><label>适配策略<select disabled={adaptationBusy}><option>优先目标剧事实</option><option>保留模板节奏</option><option>优先目标画面承接</option></select></label><label>输出版本<select disabled={adaptationBusy}><option>V0 + 3 个方案</option></select></label></div>
              </div>
              <div className={styles.fissionActionBar}><p>{adaptationTargets.length ? "生成后会同时给出兼容度、目标映射、禁带信息和接片方案。" : "当前库里还没有可作为目标的其他素材。"}</p><button type="button" className={styles.primary} onClick={() => void generateAdaptation()} disabled={adaptationBusy || !adaptTargetId} aria-busy={adaptationBusy}>{adaptationBusy ? "正在分析并生成…" : "生成跨剧适配方案"}</button></div>
            </aside>
            <main className={styles.fissionOutput} aria-live="polite" aria-busy={adaptationBusy}>
              <header className={styles.fissionOutputHeader}><div><span className={styles.eyebrow}>ADAPTATION OUTPUT</span><h3>目标剧适配结果</h3></div><p>所有成功结果会保存为模板资产的新版本。</p></header>
              {adaptationBusy && <div className={styles.generationPending} role="status"><strong>正在提取机制并寻找目标正片切入点</strong><span>系统会先做兼容度判断，再生成可执行版本。</span></div>}
              {!adaptationBusy && adaptationError && <div className={styles.generationError} role="alert"><strong>本次适配未保存</strong><span>{adaptationError}</span><small>模板版本和目标选择均已保留，可以直接重试。</small></div>}
              {!adaptationBusy && !adaptationError && !adaptationPlan && <div className={styles.fissionEmpty}><strong>尚未生成跨剧适配</strong><span>先选择目标素材，再生成方案。</span></div>}
              {adaptationPlan && <div className={styles.fissionResults}>
                <section className={styles.fissionCompatibility}><div><span>跨剧兼容度</span><strong>{adaptationPlan.compatibility.score}/100 · {adaptationPlan.compatibility.level}</strong></div><p>{adaptationPlan.compatibility.reasons.join("；") || "已完成模板机制与目标证据对照"}</p>{adaptationPlan.compatibility.blockers.length > 0 && <small>阻断项：{adaptationPlan.compatibility.blockers.join("；")}</small>}</section>
                <article className={styles.fissionBaseline}><header><div><small>HANDOFF · 前贴 → 正片</small><h3>切入点与接片方案</h3></div></header><p><b>目标切入：</b>{adaptationPlan.transitionPlan.targetEntry}（{adaptationPlan.transitionPlan.targetEntryTimecode.start.toFixed(1)}—{adaptationPlan.transitionPlan.targetEntryTimecode.end.toFixed(1)} 秒）</p><p><b>动作桥：</b>{adaptationPlan.transitionPlan.bridgeAction}</p><p><b>画面桥：</b>{adaptationPlan.transitionPlan.bridgeVisual}</p><p><b>声音桥：</b>{adaptationPlan.transitionPlan.bridgeAudio}</p><p><b>承接理由：</b>{adaptationPlan.transitionPlan.handoffReason}</p><small>校验：{adaptationPlan.transitionPlan.continuityChecks.join("；")}</small></article>
                <article className={styles.fissionBaseline}><header><div><small>TARGET MAPPING</small><h3>模板机制 → 目标证据</h3></div></header>{adaptationPlan.targetMapping.map((row, index) => <p key={`${row.templateMechanism}-${index}`}><b>{row.templateMechanism}</b> → {row.targetEvidence}（{row.targetTimecode}；{row.transformation}；置信度 {row.confidence}）</p>)}<small>禁止带入：{adaptationPlan.forbiddenCarryover.join("；") || "模板人物、关系、台词与结局"}</small></article>
                <article className={styles.fissionBaseline}><header><div><small>CONTROL · V0</small><h3>{adaptationPlan.baseline.title}</h3></div><button type="button" onClick={() => void copyText(adaptationPlan.baseline.prompt || adaptationPlan.baseline.copy || "", "目标剧 V0 已复制")}>复制 V0</button></header><p>{adaptationPlan.baseline.prompt || adaptationPlan.baseline.copy}</p></article>
                {adaptationPlan.variants.map((variant, index) => <article key={`${variant.title}-${index}`}><header><div><small>ADAPTATION · V{index + 1}</small><h3>{variant.title}</h3></div><button type="button" onClick={() => void copyText(variant.prompt || variant.copy || "", `目标剧 V${index + 1} 已复制`)}>复制该版</button></header><b>改变：{variant.changedDimension}</b><em>{variant.difference}</em><p>{variant.prompt || variant.copy}</p></article>)}
              </div>}
            </main>
          </div>
        </section>
      )}
    </section>
  );
}
