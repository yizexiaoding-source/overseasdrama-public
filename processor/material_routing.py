from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import math

from processor.preface_boundary import resolve_preface_boundary


@dataclass(frozen=True)
class ClassificationDecision:
    material_type: str
    library_bucket: str
    source: str
    confidence: float
    review_required: bool
    audience_type: str = "undetermined"
    genres: list[str] = field(default_factory=list)
    reasons: list[dict[str, Any]] = field(default_factory=list)
    clip_range: tuple[float, float] | None = None
    also_narration: bool = False


def normalize_narration_ranges(rows: list[dict[str, Any]], duration_seconds: float = 0.0) -> list[tuple[int, int]]:
    """Return verified narration intervals as integer-second, merged ranges."""
    candidates: list[tuple[int, int]] = []
    limit = max(0, int(math.ceil(float(duration_seconds or 0))))
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict) or row.get("verification") != "verified" or not str(row.get("text") or "").strip():
            continue
        try:
            start = max(0, math.floor(float(row.get("start") or 0)))
            end = math.ceil(float(row.get("end") or 0))
        except (TypeError, ValueError):
            continue
        if limit:
            start, end = min(start, limit), min(end, limit)
        if end > start:
            candidates.append((start, end))
    merged: list[tuple[int, int]] = []
    for start, end in sorted(candidates):
        if merged and start <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _label(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("label") or value.get("value") or "").strip()
    return str(value or "").strip()


def _confidence(value: Any, fallback: float = 0.0) -> float:
    if isinstance(value, dict):
        value = value.get("confidence", fallback)
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return fallback


def _number_value(value: Any, fallback: float = 0.0) -> float:
    if isinstance(value, dict):
        value = value.get("value", fallback)
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return fallback


def _opening_hook(creative: dict[str, Any]) -> dict[str, Any]:
    direct = _object(creative.get("hook"))
    if direct:
        return direct
    hooks = creative.get("hooks")
    if not isinstance(hooks, list):
        return {}
    candidates = [item for item in hooks if isinstance(item, dict)]
    if not candidates:
        return {}
    return min(candidates, key=lambda item: float(item.get("start", 10**9) or 0))


def _claim_has_verified_evidence(claim: Any, minimum_confidence: float = 0.7) -> bool:
    """A model label is never enough to assert a generated opening."""
    if not isinstance(claim, dict):
        return False
    if _confidence(claim, 0.0) < minimum_confidence:
        return False
    if str(claim.get("verification") or "").strip().lower() != "verified":
        return False
    return any(isinstance(item, dict) for item in claim.get("evidence", []))


def _has_confirmed_ai_preface(creative: dict[str, Any]) -> bool:
    """Return true only for a positively evidenced AI-generated opening.

    A dramatic cold-open, a title card, a watermark, fast cutting, a same-drama
    highlight montage, or a hard cut are all editing choices.  They must never
    be treated as evidence that the footage itself is AI generated.
    """
    candidates = (
        creative.get("openingAssetOrigin"),
        creative.get("prefaceOrigin"),
        creative.get("prefaceGenerationEvidence"),
    )
    accepted = {"ai生成前贴", "ai生成", "生成式前贴", "generated_ai_preface", "ai_generated_preface"}
    for claim in candidates:
        label = _label(claim).lower()
        if label in accepted and _claim_has_verified_evidence(claim):
            return True
    return False


def _has_unresolved_opening_origin(creative: dict[str, Any]) -> bool:
    """A separately bounded but unresolved opening must not be called original compilation."""
    candidates = (
        creative.get("openingAssetOrigin"),
        creative.get("prefaceOrigin"),
        creative.get("prefaceGenerationEvidence"),
    )
    unresolved = {"来源未知", "非原剧实拍前贴", "外搭来源待确认", "origin-unverified", "unknown"}
    return any(
        _label(claim).lower() in unresolved and _claim_has_verified_evidence(claim)
        for claim in candidates
    )


def _has_original_drama_body(creative: dict[str, Any], explicit_type: str) -> bool:
    """Original footage may be sequentially edited or mixed from several scenes."""
    if explicit_type == "原剧拼接":
        return True
    format_label = _label(creative.get("format"))
    if format_label in {"正片剧集拼接", "原剧拼接", "正片内容"}:
        return True
    return _label(creative.get("bodyFormat") or creative.get("bodyType")) in {"正片主导", "原剧拼接", "正片内容"}


def _has_later_drama_body(creative: dict[str, Any], hook_end: float, duration_seconds: float) -> bool:
    body_format = _label(creative.get("bodyFormat") or creative.get("bodyType"))
    if body_format not in {"正片主导", "混合", "原剧拼接", "正片内容"}:
        return False
    transition = _object(creative.get("bodyTransition"))
    try:
        transition_time = float(transition.get("start", transition.get("time", hook_end)) or hook_end)
    except (TypeError, ValueError):
        transition_time = hook_end
    if transition_time + 1 < hook_end:
        return False
    # Require a meaningful body after the preface. This prevents a video made
    # entirely of non-drama ad content from being routed as preface + drama.
    return duration_seconds <= 0 or duration_seconds - max(hook_end, transition_time) >= 3.0


def _verified_narration_profile(
    creative: dict[str, Any], duration_seconds: float, explicit_type: str
) -> tuple[bool, bool, float, list[dict[str, Any]]]:
    """Evaluate independent voice-over from time-coded evidence, not language.

    A single global coverage threshold misses short hooks and non-Chinese voice-over.
    Conversely, raw ASR cannot be promoted because it may be character dialogue.
    """
    raw_segments = creative.get("narrationSegments")
    segments = raw_segments if isinstance(raw_segments, list) else []
    verified: list[dict[str, Any]] = []
    total_seconds = 0.0
    languages: list[str] = []
    for raw in segments:
        if not isinstance(raw, dict) or str(raw.get("verification") or "").lower() != "verified":
            continue
        text = str(raw.get("text") or "").strip()
        try:
            start = max(0.0, float(raw.get("start", 0) or 0))
            end = max(start, float(raw.get("end", start) or start))
        except (TypeError, ValueError):
            continue
        evidence = raw.get("evidence") if isinstance(raw.get("evidence"), list) else []
        if not text or end <= start or not any(isinstance(item, dict) for item in evidence):
            continue
        total_seconds += end - start
        language = str(raw.get("language") or "").strip()
        if language and language not in languages:
            languages.append(language)
        verified.append(raw)

    claim = _object(creative.get("narrationCoverage"))
    coverage = _number_value(claim)
    if duration_seconds > 0 and total_seconds > 0:
        coverage = max(coverage, min(1.0, total_seconds / duration_seconds))
    claim_verified = _claim_has_verified_evidence(claim, 0.55)
    body_format = _label(creative.get("bodyFormat") or creative.get("bodyType"))

    has_narration = bool(verified) and (
        explicit_type == "解说"
        or total_seconds >= 2.5
        or len(verified) >= 2
        or (claim_verified and coverage >= 0.15)
    )
    uncertain = not has_narration and (
        bool(segments)
        or (claim_verified and coverage >= 0.08)
        or body_format in {"解说主导", "混合"}
        or explicit_type == "解说"
    )
    reasons = []
    if verified:
        reasons.append({
            "reason": "检测到与角色对白分离的已验证口播片段",
            "segments": len(verified),
            "seconds": round(total_seconds, 3),
            "coverage": round(coverage, 4),
            "languages": languages,
        })
    elif uncertain:
        reasons.append({"reason": "疑似存在独立解说，但说话人归因或时间证据不足，需人工复核"})
    return has_narration, uncertain, coverage, reasons


def _canonical_type(value: Any) -> str:
    raw = _label(value)
    return {
        "原剧拼接": "原剧拼接",
        "正片剧集拼接": "原剧拼接",
        "original_compilation": "原剧拼接",
        "解说": "解说",
        "正片剧集解说": "解说",
        "narration": "解说",
        "AI前贴": "AI前贴",
        "AI 前贴": "AI前贴",
        "ai_preface": "AI前贴",
    }.get(raw, "未判定")


def _genres(analysis: dict[str, Any]) -> list[str]:
    content = _object(analysis.get("content"))
    output: list[str] = []
    candidates = content.get("genres") or content.get("themes") or content.get("tags") or []
    for item in candidates if isinstance(candidates, list) else [candidates]:
        label = _label(item)
        if label and label not in output and label not in {"未知", "待分析", "剧情", "广告"}:
            output.append(label)
    return output[:6]


def _audience(analysis: dict[str, Any]) -> str:
    content = _object(analysis.get("content"))
    value = _object(analysis.get("value"))
    candidates = content.get("audiences") or content.get("audience") or value.get("suitableAudiences") or analysis.get("audiences") or []
    raw = " ".join(_label(item) for item in candidates) if isinstance(candidates, list) else _label(candidates)
    if "女频" in raw or "female" in raw.lower():
        return "female"
    if "男频" in raw or "male" in raw.lower():
        return "male"
    if raw:
        return "general"
    return "undetermined"


def classify_material_asset(
    analysis: dict[str, Any],
    media_kind: str,
    *,
    duration_seconds: float = 0,
    manual_override: dict[str, Any] | None = None,
) -> ClassificationDecision:
    if str(media_kind).lower() in {"image", "图片"}:
        return ClassificationDecision("海报图片", "running", "import", 1.0, False, genres=_genres(analysis), reasons=[{"reason": "媒体文件为图片"}])

    creative = _object(analysis.get("creative"))
    override = _object(manual_override)
    has_preface_override = str(override.get("hasPreface") or "").strip().lower()
    has_narration_override = str(override.get("hasNarration") or "").strip().lower()
    if override and has_preface_override in {"yes", "no", "uncertain"} and has_narration_override in {"yes", "no", "uncertain"}:
        if "uncertain" in {has_preface_override, has_narration_override}:
            return ClassificationDecision(
                "未判定", "running", "manual", 0.0, True,
                _audience(analysis), _genres(analysis),
                [{"reason": "人工复核标记证据不足，等待补充证据或重新分析"}],
            )

        has_preface = has_preface_override == "yes"
        has_narration = has_narration_override == "yes"
        material_type = "AI前贴" if has_preface else "解说" if has_narration else "原剧拼接"
        bucket = "ai_preface" if has_preface else "narration" if has_narration else "running"
        clip_range = None
        if has_preface:
            boundary = resolve_preface_boundary(analysis, duration_seconds)
            if not boundary.valid:
                return ClassificationDecision(
                    "未判定", "running", "manual", 0.6, True,
                    _audience(analysis), _genres(analysis),
                    [{"reason": "人工确认存在前贴，但缺少可执行边界；不会使用完整原片代替前贴"}],
                    None, has_narration,
                )
            clip_range = (boundary.start, boundary.end)
        reasons = [
            {"reason": "人工确认存在独立前贴" if has_preface else "人工确认不存在独立前贴"},
            {"reason": "人工确认存在独立解说口播" if has_narration else "人工确认不存在独立解说口播"},
        ]
        note = str(override.get("note") or "").strip()
        if note:
            reasons.append({"reason": note, "evidence": "复核说明"})
        return ClassificationDecision(
            material_type, bucket, "manual", 1.0, False,
            _audience(analysis), _genres(analysis), reasons, clip_range, has_preface and has_narration,
        )
    if override:
        material_type = _canonical_type(override.get("materialType"))
        bucket = "ai_preface" if material_type == "AI前贴" else "narration" if material_type == "解说" else "running"
        return ClassificationDecision(material_type, bucket, "manual", 1.0, material_type == "未判定", _audience(analysis), _genres(analysis), [{"reason": "用户人工确认"}])

    hook = _opening_hook(creative)
    explicit_type = _canonical_type(creative.get("materialType") or creative.get("format"))
    type_confidence = _confidence(creative.get("materialType") or creative.get("format"), 0.75 if explicit_type != "未判定" else 0.0)
    narration_coverage = _number_value(creative.get("narrationCoverage"))
    has_narration, narration_uncertain, narration_coverage, narration_reasons = _verified_narration_profile(
        creative, duration_seconds, explicit_type
    )

    has_confirmed_ai_preface = _has_confirmed_ai_preface(creative)
    has_unresolved_opening_origin = _has_unresolved_opening_origin(creative)
    boundary = resolve_preface_boundary(analysis, duration_seconds)
    start, end = boundary.start, boundary.end
    valid_boundary = boundary.valid

    later_drama_body = _has_later_drama_body(creative, end, duration_seconds)
    original_drama_body = _has_original_drama_body(creative, explicit_type)

    if has_confirmed_ai_preface and valid_boundary and later_drama_body:
        return ClassificationDecision("AI前贴", "ai_preface", "ai", max(type_confidence, 0.8), narration_uncertain, _audience(analysis), _genres(analysis), [{"reason": "开头片段具备经验证的 AI 生成证据，已按边界切分", "start": start, "end": end}, *narration_reasons], (start, end), has_narration)
    if has_narration:
        return ClassificationDecision("解说", "narration", "ai", max(type_confidence, narration_coverage, 0.72), False, _audience(analysis), _genres(analysis), narration_reasons or [{"reason": "已验证独立解说口播主导叙事", "coverage": narration_coverage}])
    if has_confirmed_ai_preface:
        return ClassificationDecision("未判定", "running", "ai", max(type_confidence, 0.55), True, _audience(analysis), _genres(analysis), [{"reason": "检测到 AI 前贴证据，但尚未确认前贴与正片的有效边界，禁止降级为原剧拼接"}])
    if has_unresolved_opening_origin and valid_boundary and later_drama_body:
        return ClassificationDecision("未判定", "running", "ai", max(type_confidence, 0.55), True, _audience(analysis), _genres(analysis), [{"reason": "开头存在独立前贴边界，但来源仍为未知或非原剧实拍，禁止降级为原剧拼接，需人工确认是否为 AI 生成"}], (start, end))
    if narration_uncertain:
        return ClassificationDecision("未判定", "running", "ai", max(type_confidence, 0.5), True, _audience(analysis), _genres(analysis), narration_reasons)
    if original_drama_body:
        reason = "正片内容为主体；顺剪或原剧高光混剪均归入原剧拼接"
        if valid_boundary and not has_confirmed_ai_preface:
            reason = "开头仅发现营销剪辑/高光混剪边界，缺少 AI 生成证据，按原剧拼接处理"
        return ClassificationDecision("原剧拼接", "running", "ai", max(type_confidence, 0.65), False, _audience(analysis), _genres(analysis), [{"reason": reason}])
    if valid_boundary and later_drama_body:
        return ClassificationDecision("未判定", "running", "ai", min(max(type_confidence, 0.45), 0.65), True, _audience(analysis), _genres(analysis), [{"reason": "存在开头切分，但没有可验证的 AI 生成或原剧来源证据，需要人工复核", "start": start, "end": end}])
    return ClassificationDecision("未判定", "running", "ai", type_confidence, True, _audience(analysis), _genres(analysis), [{"reason": "分类证据不足或边界无效"}])
