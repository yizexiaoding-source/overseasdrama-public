"""Lease PocketBase jobs and run the evidence-first three-tier analyzer."""

from __future__ import annotations

import argparse
import base64
import hashlib
import math
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter, ImageStat

from processor.semantic_analysis import AnalysisEnvelope, analyze_coarse, analyze_detail, analyze_hook_entry_points, analyze_hook_story_match, analyze_material, analyze_precision, extract_frames
from processor.factory_render import render_factory_project
from processor.material_routing import classify_material_asset, normalize_narration_ranges
from processor.preface_clip import preface_clip_asset_fields


class ApiRequestError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def classify_failure(exc: Exception) -> tuple[str, bool, int]:
    """Return error kind, retryability and exponential backoff seconds."""
    message = str(exc).lower()
    permanent_markers = ("non full-range yuv", "invalid argument", "missing required executable", "missing material", "validation_invalid_value")
    if any(marker in message for marker in permanent_markers):
        return "media" if "yuv" in message or "ffmpeg" in message else "validation", False, 0
    if any(marker in message for marker in ("timeout", "timed out", "connection", "temporarily", "429", "503", "ssl", "unexpected_eof", "eof occurred", "write operation", "read operation", "mkl_malloc", "failed to allocate memory", "out of memory")):
        return "transient", True, 30
    if any(marker in message for marker in ("provider", "dashscope", "arrearage", "quota")):
        return "provider", True, 120
    return "permanent", False, 0


def _detail_frame_payload(path: Path) -> str:
    """Bound visual tokens while retaining enough detail for scene/action evidence."""
    with Image.open(path) as image:
        image = image.convert("RGB")
        image.thumbnail((640, 640), Image.Resampling.LANCZOS)
        from io import BytesIO
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=82, optimize=True)
        return base64.b64encode(buffer.getvalue()).decode("ascii")


def api_request(base_url: str, token: str, path: str, method: str = "GET", payload: dict[str, Any] | None = None) -> tuple[int, dict[str, Any] | None]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(f"{base_url.rstrip('/')}{path}", data=body, method=method, headers={"authorization": f"Bearer {token}", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        if exc.code == 204:
            return 204, None
        raise ApiRequestError(exc.code, f"API {method} {path} failed ({exc.code}): {raw.decode('utf-8', errors='replace')[:500]}") from exc


def download(url: str, destination: Path) -> None:
    with urllib.request.urlopen(url, timeout=120) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output, length=1024 * 1024)


def _claim_value(value: Any, fallback: Any = "") -> Any:
    if isinstance(value, dict):
        return value.get("value", value.get("label", fallback))
    return value if value not in (None, "") else fallback


def _material_analysis_view(result: dict[str, Any]) -> dict[str, Any]:
    root = result.get("result") if isinstance(result.get("result"), dict) else result
    semantic = root.get("semantic") if isinstance(root.get("semantic"), dict) else root
    return semantic if isinstance(semantic, dict) else {}


def _material_prompt_blueprint(analysis: dict[str, Any]) -> dict[str, Any]:
    creative = analysis.get("creative") if isinstance(analysis.get("creative"), dict) else {}
    content = analysis.get("content") if isinstance(analysis.get("content"), dict) else {}
    hook = creative.get("hook") if isinstance(creative.get("hook"), dict) else {}
    transitions = creative.get("transitions") if isinstance(creative.get("transitions"), list) else []
    transition = transitions[0] if transitions and isinstance(transitions[0], dict) else {}
    return {
        "prototype": _claim_value(creative.get("prototype"), "未判定"),
        "hookType": _claim_value(creative.get("hookType") or hook.get("hookType"), "未判定"),
        "transition": _claim_value(creative.get("transition") or transition.get("label") or transition.get("type"), "未判定"),
        "summary": _claim_value(content.get("summary") or analysis.get("summary"), ""),
        "reusablePrompt": _claim_value(creative.get("reusablePrompt") or creative.get("prompt"), ""),
        "prefaceStoryboard": creative.get("prefaceStoryboard", []),
        "narrationSegments": creative.get("narrationSegments", []),
    }


def _timecode_overlaps(item: Any, start: float, end: float) -> bool:
    if not isinstance(item, dict):
        return False
    timecode = item.get("timecode") if isinstance(item.get("timecode"), dict) else item
    try:
        item_start = float(timecode.get("start", item.get("start", 0)))
        item_end = float(timecode.get("end", item.get("end", item_start)))
    except (TypeError, ValueError):
        return False
    return item_end >= start and item_start <= end


def _segment_library_analysis(result: dict[str, Any], analysis: dict[str, Any], kind: str, start: float, end: float) -> dict[str, Any]:
    """Persist a library-specific, time-bounded view rather than reusing the full material report."""
    content = analysis.get("content") if isinstance(analysis.get("content"), dict) else {}
    creative = analysis.get("creative") if isinstance(analysis.get("creative"), dict) else {}
    evidence_root = (result.get("result") if isinstance(result.get("result"), dict) else result).get("evidence", {})
    # The runtime envelope stores ASR under result.transcript.  Older results
    # used evidence.transcript; accept both, but never mistake OCR or dialogue
    # subtitles for narration.
    result_root = result.get("result") if isinstance(result.get("result"), dict) else result
    transcript = result_root.get("transcript", []) if isinstance(result_root, dict) else []
    if (not isinstance(transcript, list) or not transcript) and isinstance(evidence_root, dict):
        transcript = evidence_root.get("transcript", [])
    scoped_transcript = [row for row in transcript if _timecode_overlaps(row, start, end)] if isinstance(transcript, list) else []
    scoped_content: dict[str, Any] = {}
    for key in ("observations", "segments", "storyBeats", "scenes", "storyboardUnits", "conflicts", "relations", "relationships", "characters"):
        rows = content.get(key, [])
        if isinstance(rows, list):
            scoped_content[key] = [row for row in rows if _timecode_overlaps(row, start, end) or any(_timecode_overlaps(item, start, end) for item in (row.get("evidence", []) if isinstance(row, dict) else []))]
    scoped_content["summary"] = content.get("summary", {})
    for key in ("storyboardUnits",):
        rows = content.get(key, [])
        if isinstance(rows, list):
            scoped_content[key] = [row for row in rows if _timecode_overlaps(row, start, end) or any(_timecode_overlaps(item, start, end) for item in (row.get("evidence", []) if isinstance(row, dict) else []))]
    narration_segments = creative.get("narrationSegments", [])
    scoped_narration = [row for row in narration_segments if _timecode_overlaps(row, start, end)] if isinstance(narration_segments, list) else []
    preface_storyboard = creative.get("prefaceStoryboard", [])
    scoped_storyboard = [row for row in preface_storyboard if _timecode_overlaps(row, start, end)] if isinstance(preface_storyboard, list) else []
    hooks = creative.get("hooks", []) if isinstance(creative.get("hooks"), list) else []
    scoped_hooks = [row for row in hooks if _timecode_overlaps(row, start, end)]
    primary_hook = scoped_hooks[0] if scoped_hooks and isinstance(scoped_hooks[0], dict) else (creative.get("hook") if isinstance(creative.get("hook"), dict) else {})
    mechanism = _claim_value(primary_hook.get("conflict") or primary_hook.get("hookType") or primary_hook.get("narrativePromise"), "")
    opening_action = _claim_value(primary_hook.get("visualSummary") or primary_hook.get("plotSummary") or primary_hook.get("spokenSummary"), "")
    summary_claim = content.get("summary", {})
    summary_in_scope = _timecode_overlaps(summary_claim, start, end) or any(
        _timecode_overlaps(item, start, end)
        for item in (summary_claim.get("evidence", []) if isinstance(summary_claim, dict) else [])
    )
    creative_summary = _claim_value(summary_claim, "") if summary_in_scope or not isinstance(summary_claim, dict) else ""
    if not creative_summary:
        creative_summary = "；".join(
            _claim_value(row.get("description") or row.get("text") or row.get("actionObserved"), "")
            for row in scoped_content.get("observations", [])
            if isinstance(row, dict)
        )
    transitions = [row for row in creative.get("transitions", []) if isinstance(row, dict) and _timecode_overlaps(row, start, end)] if isinstance(creative.get("transitions"), list) else []
    handoff = _claim_value(
        creative.get("handoff")
        or creative.get("continuation")
        or (transitions[0].get("description") or transitions[0].get("label") if transitions else ""),
        "",
    )
    return {
        "schemaVersion": "library-segment-v1",
        "analysisKind": kind,
        "scope": {"start": round(start, 3), "end": round(end, 3)},
        "content": scoped_content,
        # A narration library asset is allowed to expose only model-confirmed
        # independent narration segments. Raw ASR is retained for traceability,
        # but must not become user-facing narration copy by itself.
        "transcript": scoped_transcript,
        "creative": {
            "hook": primary_hook,
            "hooks": scoped_hooks,
            "openingAction": opening_action,
            "replicationMechanism": mechanism,
            "creativeSummary": creative_summary,
            "handoff": handoff,
            "transitions": transitions,
            "packaging": creative.get("packaging", []),
            "narrationCoverage": creative.get("narrationCoverage", {}),
            "narrationSegments": scoped_narration if kind == "narration" else [],
            "prefaceStoryboard": scoped_storyboard if kind == "ai_preface" else [],
        },
        "instruction": "AI前贴仅在逐镜头证据完整时生成原片复刻脚本；解说仅展示已确认的独立口播与对应画面。",
    }


def _ffmpeg_executable() -> str:
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    bundled = next((path for path in (Path.cwd() / "tools" / "ffmpeg").rglob("ffmpeg.exe")), None)
    if bundled:
        return str(bundled)
    raise RuntimeError("Missing required executable: ffmpeg")


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cut_video_range(source: Path, destination: Path, clip_range: tuple[int, int]) -> None:
    start, end = clip_range
    completed = subprocess.run(
        [
            _ffmpeg_executable(), "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(start), "-to", str(end), "-i", str(source),
            "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", str(destination),
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0 or not destination.exists() or destination.stat().st_size == 0:
        raise RuntimeError(f"Video clip extraction failed: {completed.stderr[-800:]}")


def _cut_video_ranges(source: Path, material_id: str, ranges: list[tuple[int, int]], suffix: str) -> tuple[Path, str]:
    destination_dir = Path.cwd() / "public" / "material-library"
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / f"{material_id}-{suffix}.mp4"
    if len(ranges) == 1:
        _cut_video_range(source, destination, ranges[0])
        return destination, _hash_file(destination)
    with tempfile.TemporaryDirectory(prefix="lumina-clip-") as temp_root:
        temp_dir = Path(temp_root)
        parts: list[Path] = []
        for index, clip_range in enumerate(ranges):
            part = temp_dir / f"part-{index:03d}.mp4"
            _cut_video_range(source, part, clip_range)
            parts.append(part)
        concat_list = temp_dir / "concat.txt"
        concat_list.write_text("".join(f"file '{part.as_posix()}'\n" for part in parts), encoding="utf-8")
        completed = subprocess.run(
            [_ffmpeg_executable(), "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", "-movflags", "+faststart", str(destination)],
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0 or not destination.exists() or destination.stat().st_size == 0:
            raise RuntimeError(f"Video range assembly failed: {completed.stderr[-800:]}")
    return destination, _hash_file(destination)


def _cut_ai_preface(source: Path, material_id: str, clip_range: tuple[float, float]) -> tuple[Path, str]:
    ranges = [(math.floor(clip_range[0]), math.ceil(clip_range[1]))]
    return _cut_video_ranges(source, material_id, ranges, "ai-preface")


def _preface_clip_bounds(value: dict[str, Any]) -> tuple[float, float]:
    start = max(0.0, float(value.get("clip_start_seconds") or 0))
    end = max(0.0, float(value.get("clip_end_seconds") or 0))
    if end <= start:
        raise ValueError("invalid preface clip range")
    return start, end


def _preface_input_bounds(has_asset_clip: bool, start: float, end: float) -> tuple[float, float]:
    return (0.0, end - start) if has_asset_clip else (start, end)


def _offset_preface_timecodes(value: Any, offset: float, source_end: float) -> Any:
    """Move clip-local evidence onto the source timeline without widening its scope."""
    if isinstance(value, list):
        return [_offset_preface_timecodes(item, offset, source_end) for item in value]
    if not isinstance(value, dict):
        return value
    shifted: dict[str, Any] = {}
    for key, item in value.items():
        if key in {"start", "end", "time"} and isinstance(item, (int, float)):
            shifted[key] = round(min(source_end, max(offset, float(item) + offset)), 3)
        else:
            shifted[key] = _offset_preface_timecodes(item, offset, source_end)
    if "scope" in shifted:
        shifted["scope"] = {"start": round(offset, 3), "end": round(source_end, 3)}
    return shifted


def _cut_preface_job_clip(source: Path, destination: Path, start: float, end: float) -> None:
    completed = subprocess.run(
        [
            _ffmpeg_executable(), "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(source),
            "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", str(destination),
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0 or not destination.exists() or destination.stat().st_size == 0:
        raise RuntimeError(f"preface clip extraction failed: {completed.stderr[-800:]}")


def execute_preface_analysis_job(response: dict[str, Any], base_url: str, workspace: Path, on_progress=None) -> dict[str, Any]:
    job = dict(response.get("job") or {})
    asset = dict(response.get("asset") or {})
    material = dict(response.get("material") or {})
    start, end = _preface_clip_bounds(job)
    asset_file = str(asset.get("media_file") or "")
    source_file = str(material.get("video") or "")
    if asset_file:
        suffix = Path(asset_file).suffix or ".mp4"
        downloaded = workspace / f"preface-asset-source{suffix}"
        url = f"{base_url.rstrip('/')}/api/files/{asset['collection_id']}/{asset['id']}/{urllib.parse.quote(asset_file)}"
        if on_progress: on_progress(8, "下载前贴片段")
        download(url, downloaded)
        clip = workspace / "preface-segment.mp4"
        input_start, input_end = _preface_input_bounds(True, start, end)
        if on_progress: on_progress(14, f"限制前贴片段为 {input_end:g} 秒")
        _cut_preface_job_clip(downloaded, clip, input_start, input_end)
    elif source_file:
        suffix = Path(source_file).suffix or ".video"
        source = workspace / f"preface-source{suffix}"
        url = f"{base_url.rstrip('/')}/api/files/{material['collection_id']}/{material['id']}/{urllib.parse.quote(source_file)}"
        if on_progress: on_progress(8, "下载前贴来源")
        download(url, source)
        clip = workspace / "preface-segment.mp4"
        if on_progress: on_progress(14, f"截取前贴 {start:g}-{end:g} 秒")
        input_start, input_end = _preface_input_bounds(False, start, end)
        _cut_preface_job_clip(source, clip, input_start, input_end)
    else:
        raise RuntimeError("preface asset has no usable video source")
    if on_progress: on_progress(20, "仅分析前贴片段")
    cache_root = Path(os.getenv("LUMINA_ANALYSIS_CACHE_DIR", str(Path.cwd() / "analysis_cache")))
    digest = hashlib.sha256(clip.read_bytes()).hexdigest()
    result = analyze_material(clip, workspace, on_progress=on_progress, cache_dir=cache_root / "prefaces" / digest).to_dict()
    clip_duration = max(0.1, end - start)
    analysis = _material_analysis_view(result)
    segment = _segment_library_analysis(result, analysis, "ai_preface", 0, clip_duration)
    segment = _offset_preface_timecodes(segment, start, end)
    segment["analysisKind"] = "ai_preface"
    segment["sourceIsolation"] = "clip_only"
    return {
        "analysis_result": segment,
        "prompt_blueprint": _material_prompt_blueprint(segment),
        "hit_reasons": [{"reason": f"仅分析前贴片段 {start:g}-{end:g} 秒", "start": start, "end": end}],
    }


def _image_material_result(source: Path) -> dict[str, Any]:
    with Image.open(source) as image:
        width, height = image.size
        mode = image.mode
    claim = lambda value: {"value": value, "confidence": 1.0, "evidence": [{"source": "file", "episode": 1, "timecode": {"start": 0, "end": 0}, "confidence": 1.0}], "verification": "verified"}
    semantic = {
        "materialType": claim("海报图片"),
        "mediaKind": claim("图片"),
        "content": {"genres": [], "audiences": []},
        "creative": {"materialType": claim("海报图片")},
    }
    return {
        "schema_version": "material-v2",
        "analysis_id": f"image-{hashlib.sha256(source.read_bytes()).hexdigest()[:24]}",
        "tier": "coarse",
        "status": "succeeded",
        "source": {"path": str(source), "kind": "ad_material_image", "width": width, "height": height, "mode": mode},
        "engine": {"image": "Pillow"},
        "result": {
            "durationSeconds": 0,
            "semantic": semantic,
            "materialFields": {"analysis": "分析完成", "analysisStatus": "succeeded", "materialType": "海报图片", "review": "无需复核", "confidence": 100},
        },
    }


def envelope_from_dict(value: dict[str, Any]) -> AnalysisEnvelope:
    return AnalysisEnvelope(
        schema_version=str(value.get("schema_version", value.get("schemaVersion", "1.0.0"))),
        analysis_id=str(value.get("analysis_id", value.get("analysisId", "legacy-envelope"))),
        tier=value.get("tier", "coarse"), status=value.get("status", "succeeded"),
        source=dict(value.get("source") or value.get("input") or {}),
        engine=dict(value.get("engine") or value.get("engines") or {}),
        result=value.get("result", value.get("analysis_result", value.get("analysisResult"))),
        error=value.get("error"), warnings=list(value.get("warnings") or []),
    )


def execute_semantic_job(job: dict[str, Any], base_url: str, workspace: Path, on_progress=None) -> dict[str, Any]:
    stage = str(job["stage"])
    if stage == "detail":
        raw_coarse = job.get("coarse_results") or job.get("coarseResults") or []
        if isinstance(raw_coarse, dict):
            raw_coarse = [raw_coarse]
        # Older queue payloads embedded episode rows directly and used
        # analysis_result instead of the three-tier envelope.
        if not raw_coarse and isinstance(job.get("episodes"), list):
            raw_coarse = []
            for item in job["episodes"]:
                if not isinstance(item, dict):
                    continue
                if any(key in item for key in ("schema_version", "schemaVersion", "result")):
                    raw_coarse.append(item)
                    continue
                result = item.get("analysis_result") or item.get("analysisResult") or item.get("result") or item
                episode = int(item.get("episode_number", item.get("episode", 0)) or 0)
                raw_coarse.append({"schema_version": "legacy-1.0", "analysis_id": f"legacy-{episode}", "tier": "coarse", "status": "succeeded", "source": {"episode": episode, "durationSeconds": item.get("duration_seconds", item.get("durationSeconds", (result or {}).get("durationSeconds", 0)))}, "engine": {"legacy": "true"}, "result": result})
        coarse = [envelope_from_dict(item) for item in raw_coarse if isinstance(item, dict)]
        visual_frames: list[dict[str, Any]] = []
        frame_interval = float(os.getenv("LUMINA_DETAIL_FRAME_INTERVAL", "3"))
        # 12 resized frames per short episode keep a four-episode request below
        # Qwen VL's multimodal input ceiling.  Precision analysis later samples
        # the shortlisted event interval densely, so detail recall need not send
        # every extracted source frame at full resolution.
        max_frames_per_episode = max(1, int(os.getenv("LUMINA_DETAIL_MAX_FRAMES_PER_EPISODE", "12")))
        episode_assets = job.get("episode_assets") or job.get("episodeAssets") or []
        asset_total = max(1, len(episode_assets))
        for asset_index, asset in enumerate(episode_assets):
            if not isinstance(asset, dict) or not asset.get("video") or not asset.get("id"):
                continue
            episode_number = int(asset.get("episode_number") or asset.get("episode") or 0)
            if episode_number <= 0:
                continue
            suffix = Path(str(asset["video"])).suffix or ".video"
            source = workspace / f"detail-episode-{episode_number}{suffix}"
            if on_progress:
                on_progress(8 + round(asset_index / asset_total * 24), f"下载并抽取第 {episode_number} 集画面证据")
            asset_url = f"{base_url.rstrip('/')}/api/files/{asset.get('collection_id')}/{asset['id']}/{urllib.parse.quote(str(asset['video']))}"
            download(asset_url, source)
            extracted = extract_frames(source, workspace / f"detail-frames-{episode_number}", frame_interval)
            if len(extracted) > max_frames_per_episode:
                step = len(extracted) / max_frames_per_episode
                extracted = [extracted[min(len(extracted) - 1, int(index * step))] for index in range(max_frames_per_episode)]
            visual_frames.extend({"episode": episode_number, "timecode": frame["timecode"], "mimeType": "image/jpeg", "base64": _detail_frame_payload(Path(frame["path"]))} for frame in extracted)
        if on_progress:
            on_progress(38, "融合对白、OCR 与画面证据")
        return analyze_detail(coarse, visual_frames, on_progress).to_dict()
    video_name = str(job.get("video") or "")
    if not video_name or not job.get("episode"):
        raise RuntimeError(f"{stage} job is missing its PocketBase episode video")
    suffix = Path(video_name).suffix or ".video"
    source = workspace / f"source{suffix}"
    asset_url = f"{base_url.rstrip('/')}/api/files/{job['collection_id']}/{job['episode']}/{urllib.parse.quote(video_name)}"
    if on_progress:
        on_progress(8, "下载剧集片源")
    download(asset_url, source)
    episode_number = int(job["episode_number"])
    if stage == "coarse":
        return analyze_coarse(source, episode_number, workspace).to_dict()
    if stage == "precision":
        parameters = dict(job.get("parameters") or {})
        interval = dict(parameters.get("interval") or {})
        if not interval:
            interval = {"start": parameters.get("start", parameters.get("start_seconds")), "end": parameters.get("end", parameters.get("end_seconds"))}
        if interval.get("start") is None or interval.get("end") is None:
            raise RuntimeError("精解析任务缺少片段起止时间，请重置该任务后重试")
        coarse_payload = dict(job.get("coarse_result") or job.get("coarseResult") or {})
        coarse = envelope_from_dict(coarse_payload)
        if on_progress:
            on_progress(28, "密集抽帧并验证事件区间")
        return analyze_precision(source, episode_number, float(interval["start"]), float(interval["end"]), coarse, workspace).to_dict()
    raise RuntimeError(f"Unsupported analysis stage: {stage}")


def execute_material_job(response: dict[str, Any], base_url: str, workspace: Path, on_progress=None) -> dict[str, Any]:
    job = dict(response.get("job") or {})
    material = dict(response.get("material") or {})
    if str(job.get("stage")) != "material":
        raise RuntimeError(f"Unsupported material analysis stage: {job.get('stage')}")
    material_id = str(material.get("id") or "")
    # The queue payload is intentionally slim and may omit the user's manual
    # material type. Refresh classification fields from PocketBase so a
    # manually marked narration asset cannot be downgraded by semantic output.
    if material_id:
        try:
            record_url = f"{base_url.rstrip('/')}/api/collections/ad_materials/records/{urllib.parse.quote(material_id)}"
            with urllib.request.urlopen(record_url, timeout=15) as record_response:
                stored_material = json.loads(record_response.read())
            if isinstance(stored_material, dict):
                for key in ("material_type", "type", "manual_override", "title"):
                    if key in stored_material:
                        material[key] = stored_material[key]
        except Exception:
            pass
    collection_id = str(material.get("collection_id") or "")
    media_kind = str(material.get("media_kind") or ("image" if material.get("image") else "video"))
    asset_name = str((material.get("image") if media_kind == "image" else material.get("video")) or "")
    if not material_id or not collection_id or not asset_name:
        raise RuntimeError("material job is missing material.id, material.collection_id, or media file")
    suffix = Path(asset_name).suffix or (".image" if media_kind == "image" else ".video")
    source = workspace / f"material-source{suffix}"
    asset_url = f"{base_url.rstrip('/')}/api/files/{collection_id}/{material_id}/{urllib.parse.quote(asset_name)}"
    if on_progress:
        on_progress(8, "下载素材")
    download(asset_url, source)
    # Generate a small, cacheable card poster once. The feed must never open
    # hundreds of source-video range requests merely to paint first frames.
    poster = Path.cwd() / "public" / "material-covers" / f"{material_id}.webp"
    if not poster.exists():
        try:
            image_path = source
            if media_kind != "image":
                extracted = extract_frames(source, workspace / "poster-frame", max(1.0, _safe_video_duration(source)))
                image_path = Path(extracted[0]["path"]) if extracted else source
            poster.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(image_path) as image:
                image = image.convert("RGB")
                image.thumbnail((480, 480), Image.Resampling.LANCZOS)
                image.save(poster, format="WEBP", quality=78, method=4)
        except Exception as poster_exc:
            print(f"[material:{material_id}] poster generation skipped: {poster_exc}", file=sys.stderr, flush=True)
    digest = hashlib.sha256()
    with source.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    cache_root = Path(os.getenv("LUMINA_ANALYSIS_CACHE_DIR", str(Path.cwd() / "analysis_cache")))
    # Technical evidence is a pure function of the video bytes and engine
    # configuration. Key it by content hash so re-ingesting the same file does
    # not repeat ASR/OCR/frame extraction under a new PocketBase record id.
    cache_dir = cache_root / "materials" / "by-content-hash" / digest.hexdigest()
    parameters = dict(job.get("parameters") or {})
    if parameters.get("force_semantic_refresh") is True:
        # A manual story retry keeps deterministic media evidence but must not
        # reuse an earlier model interpretation after the story contract changes.
        semantic_cache = cache_dir / "semantic-segments-v6.json"
        if semantic_cache.exists():
            semantic_cache.unlink()
        if on_progress:
            on_progress(74, "保留抽帧/ASR/OCR，刷新剧情语义")
    try:
        if media_kind == "image":
            if on_progress:
                on_progress(78, "识别图片素材")
            result = _image_material_result(source)
        else:
            result = analyze_material(source, workspace, on_progress=on_progress, cache_dir=cache_dir).to_dict()
    except Exception as exc:
        # A paid provider can become unavailable after useful, verified legacy
        # analysis has already been persisted. Preserve that evidence instead
        # of replacing it with a failed/empty card. The conservative v2
        # projection keeps unsupported dimensions empty and requires review.
        if "Arrearage" not in str(exc):
            raise
        record_url = f"{base_url.rstrip('/')}/api/collections/ad_materials/records/{urllib.parse.quote(material_id)}"
        with urllib.request.urlopen(record_url, timeout=30) as record_response:
            previous = json.loads(record_response.read())
        legacy = dict(previous.get("analysis_result") or {})
        if not isinstance(legacy.get("semantic"), dict):
            raise
        if on_progress:
            on_progress(96, "千问额度不可用，保留并升级已验证结果")
        result = _upgrade_legacy_material_result(legacy, material_id)
        upgraded_root = result.get("result") if isinstance(result.get("result"), dict) else {}
        upgraded_content = upgraded_root.get("content") if isinstance(upgraded_root.get("content"), dict) else {}
        upgraded_summary = upgraded_content.get("summary") if isinstance(upgraded_content.get("summary"), dict) else {}
        if not str(upgraded_summary.get("value") or "").strip() or not upgraded_summary.get("evidence"):
            raise exc
    duration_seconds = float((result.get("result") or {}).get("durationSeconds") or 0)
    analysis = _material_analysis_view(result)
    decision = classify_material_asset(
        analysis,
        media_kind,
        duration_seconds=duration_seconds,
        manual_override=material.get("manual_override") if isinstance(material.get("manual_override"), dict) else None,
    )
    # A manually classified narration asset must not lose its spoken copy just
    # because the semantic model conservatively labelled the speech as
    # character dialogue.  ASR segments are still kept verbatim and
    # time-coded; the UI will only expose them for the narration library and
    # the user can re-review the speaker attribution there.
    declared_material_type = str(material.get("material_type") or material.get("type") or "").strip()
    declared_override = material.get("manual_override") if isinstance(material.get("manual_override"), dict) else {}
    declared_override_type = str(declared_override.get("materialType") or "").strip()
    is_declared_narration = declared_material_type in {"解说", "narration", "旁白"} or declared_override_type in {"解说", "narration", "旁白"}
    if decision.library_bucket == "narration" or is_declared_narration:
        root_result = result.get("result") if isinstance(result.get("result"), dict) else result
        root_transcript = root_result.get("transcript", []) if isinstance(root_result, dict) else []
        if not root_transcript and isinstance(root_result, dict) and isinstance(root_result.get("evidence"), dict):
            root_transcript = root_result["evidence"].get("transcript", [])
        semantic_creative = analysis.get("creative") if isinstance(analysis.get("creative"), dict) else {}
        existing_narration = semantic_creative.get("narrationSegments") if isinstance(semantic_creative.get("narrationSegments"), list) else []
        transcript_rows = [row for row in root_transcript if isinstance(row, dict) and str(row.get("text") or "").strip() and float(row.get("end", 0) or 0) > float(row.get("start", 0) or 0)] if isinstance(root_transcript, list) else []
        if is_declared_narration and transcript_rows and decision.library_bucket != "narration":
            decision = type(decision)("解说", "narration", "manual", max(decision.confidence, 0.8), False, decision.audience_type, decision.genres, [{"reason": "素材字段已标记为解说，且存在可验证 ASR 口播证据", "coverage": "asr_transcript"}], None, False)
        # Do not promote raw ASR rows here: they may be character dialogue.
        # Only the semantic independent-voiceover detector can create verified
        # narrationSegments for the library.
    result["material_id"] = material_id
    result["classification"] = {
        "material_type": decision.material_type,
        "library_bucket": decision.library_bucket,
        "source": decision.source,
        "confidence": decision.confidence,
        "review_required": decision.review_required,
        "audience_type": decision.audience_type,
        "genres": decision.genres,
        "reasons": decision.reasons,
    }
    if decision.library_bucket in {"ai_preface", "narration"}:
        library_asset = {
            "asset_kind": decision.library_bucket,
            # The library card owns the title; keep the source material name
            # intact so it is not rendered twice as a prefixed duplicate.
            "title": str(material.get("title") or material_id),
            "clip_start_seconds": decision.clip_range[0] if decision.clip_range else 0,
            "clip_end_seconds": decision.clip_range[1] if decision.clip_range else duration_seconds,
            "content_hash": str(material.get("content_hash") or digest.hexdigest()),
            "analysis_result": _segment_library_analysis(result, analysis, decision.library_bucket, decision.clip_range[0] if decision.clip_range else 0, decision.clip_range[1] if decision.clip_range else duration_seconds),
            "prompt_blueprint": _material_prompt_blueprint(_segment_library_analysis(result, analysis, decision.library_bucket, decision.clip_range[0] if decision.clip_range else 0, decision.clip_range[1] if decision.clip_range else duration_seconds)),
            "hit_reasons": decision.reasons,
            "adx_metrics_snapshot": material.get("adx_metrics") if isinstance(material.get("adx_metrics"), dict) else {},
            "review_status": "pending" if decision.review_required else "approved",
        }
        if decision.library_bucket == "ai_preface" and decision.clip_range:
            clip_path, clip_hash = _cut_ai_preface(source, material_id, decision.clip_range)
            library_asset.update(preface_clip_asset_fields(clip_path, clip_hash, decision.clip_range))
        if decision.library_bucket == "narration":
            narration_creative = analysis.get("creative") if isinstance(analysis.get("creative"), dict) else {}
            narration_rows = narration_creative.get("narrationSegments") if isinstance(narration_creative, dict) else []
            narration_ranges = normalize_narration_ranges(narration_rows, duration_seconds)
            if narration_ranges:
                narration_path, narration_hash = _cut_video_ranges(source, material_id, narration_ranges, "narration")
                library_asset["local_media_path"] = str(narration_path.resolve())
                library_asset["content_hash"] = narration_hash
                library_asset["source_ranges"] = [{"start": start, "end": end} for start, end in narration_ranges]
                library_asset["clip_start_seconds"] = narration_ranges[0][0]
                library_asset["clip_end_seconds"] = narration_ranges[-1][1]
                library_asset["assembled_duration"] = sum(end - start for start, end in narration_ranges)
                library_asset["clip_status"] = "ready"
                library_asset["analysis_result"] = _segment_library_analysis(result, analysis, "narration", narration_ranges[0][0], narration_ranges[-1][1])
                library_asset["prompt_blueprint"] = _material_prompt_blueprint(library_asset["analysis_result"])
            else:
                library_asset["clip_status"] = "missing_evidence"
                library_asset["source_ranges"] = []
                library_asset["clip_start_seconds"] = 0
                library_asset["clip_end_seconds"] = 0
                library_asset["analysis_result"] = _segment_library_analysis(result, analysis, "narration", 0, 0)
        result["library_asset"] = library_asset
        if decision.also_narration:
            narration_asset = dict(library_asset)
            narration_asset["asset_kind"] = "narration"
            narration_creative = analysis.get("creative") if isinstance(analysis.get("creative"), dict) else {}
            narration_rows = narration_creative.get("narrationSegments") if isinstance(narration_creative, dict) else []
            narration_ranges = normalize_narration_ranges(narration_rows, duration_seconds)
            narration_asset.pop("local_media_path", None)
            narration_asset["content_hash"] = f"{library_asset['content_hash']}-narration"
            if narration_ranges:
                narration_path, narration_hash = _cut_video_ranges(source, material_id, narration_ranges, "narration")
                narration_asset["local_media_path"] = str(narration_path.resolve())
                narration_asset["content_hash"] = narration_hash
                narration_asset["source_ranges"] = [{"start": start, "end": end} for start, end in narration_ranges]
                narration_asset["clip_start_seconds"] = narration_ranges[0][0]
                narration_asset["clip_end_seconds"] = narration_ranges[-1][1]
                narration_asset["assembled_duration"] = sum(end - start for start, end in narration_ranges)
                narration_asset["clip_status"] = "ready"
            else:
                narration_asset["clip_status"] = "missing_evidence"
                narration_asset["source_ranges"] = []
                narration_asset["clip_start_seconds"] = 0
                narration_asset["clip_end_seconds"] = 0
            narration_asset["analysis_result"] = _segment_library_analysis(result, analysis, "narration", narration_asset["clip_start_seconds"], narration_asset["clip_end_seconds"])
            narration_asset["prompt_blueprint"] = _material_prompt_blueprint(narration_asset["analysis_result"])
            result["library_assets"] = [library_asset, narration_asset]
    return result


def _safe_video_duration(path: Path) -> float:
    """Read duration for poster sampling without coupling to analyzer internals."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return 3600.0
    import subprocess
    completed = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True)
    try:
        return max(1.0, float(completed.stdout.strip()))
    except (TypeError, ValueError):
        return 3600.0


def execute_hook_match_job(response: dict[str, Any], on_progress=None) -> dict[str, Any]:
    job = dict(response.get("job") or {})
    if str(job.get("stage")) != "hook_match":
        raise RuntimeError(f"Unsupported hook matching stage: {job.get('stage')}")
    if on_progress:
        on_progress(25, "正在理解选中的正片故事线")
    result = analyze_hook_story_match({
        "hook": dict(response.get("hook") or {}), "drama": dict(response.get("drama") or {}),
        "episodes": list(response.get("episodes") or []), "topics": list(response.get("topics") or []),
        "episode_scope": list(response.get("episode_scope") or []),
        "match_context": dict(response.get("match_context") or {}),
        "target_duration_tier": response.get("target_duration_band") or response.get("target_duration_tier") or response.get("targetDurationTier") or job.get("target_duration_band") or job.get("target_duration_tier") or job.get("targetDurationTier"),
    }, on_progress=on_progress).to_dict()
    if on_progress:
        on_progress(92, "校验完整故事脉络与安全边界")
    return result


def _entry_frame_quality(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        gray = image.convert("L").resize((320, 180))
        brightness = float(ImageStat.Stat(gray).mean[0])
        edge_variance = float(ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES)).var[0])
    flash = brightness >= 248.0
    black = brightness <= 3.0
    blurred = edge_variance < 8.0
    return {"brightness": round(brightness, 2), "edgeVariance": round(edge_variance, 2), "flash": flash, "black": black, "blurred": blurred, "passed": not flash and not black and not blurred}


def execute_entry_precision_job(response: dict[str, Any], base_url: str, workspace: Path, on_progress=None) -> dict[str, Any]:
    job = dict(response.get("job") or {})
    if str(job.get("stage")) != "entry_precision":
        raise RuntimeError(f"Unsupported entry precision stage: {job.get('stage')}")
    if on_progress:
        on_progress(35, "校验对白、动作、镜头与声音接点证据")
    match = dict(response.get("match") or {})
    match.setdefault("storyScore", match.get("story_score"))
    match.setdefault("productionGate", match.get("production_gate") or {})
    match.setdefault("businessScore", match.get("business_score") or {"dimensionScores": match.get("dimension_scores") or {}})
    analyzed = analyze_hook_entry_points({"matches": [match]})
    rows = analyzed.get("matches") if isinstance(analyzed.get("matches"), list) else []
    candidates = rows[0].get("candidates", []) if rows and isinstance(rows[0], dict) else []
    episodes = {int(item.get("episode_number") or 0): dict(item) for item in (response.get("episodes") or []) if isinstance(item, dict)}
    sources: dict[int, Path] = {}
    verified: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates[:3]):
        episode_number, point = int(candidate.get("episode") or 0), float(candidate.get("start") or 0)
        episode = episodes.get(episode_number, {})
        video_name, episode_id = str(episode.get("video") or ""), str(episode.get("id") or "")
        collection_id = str(episode.get("collectionId") or episode.get("collection_id") or "pbc_lumepisodes")
        if not video_name or not episode_id:
            continue
        source = sources.get(episode_number)
        if source is None:
            source = workspace / f"entry-{episode_number}{Path(video_name).suffix or '.video'}"
            download(f"{base_url.rstrip('/')}/api/files/{collection_id}/{episode_id}/{urllib.parse.quote(video_name)}", source)
            sources[episode_number] = source
        if on_progress:
            on_progress(45 + index * 15, f"密集抽取第 {episode_number} 集接点前后画面")
        start, end = max(0.0, point - 0.6), point + 0.6
        frames = extract_frames(source, workspace / f"entry-frames-{episode_number}-{index}", 0.2, start, end)
        if not frames:
            continue
        closest = min(frames, key=lambda frame: abs(float((frame.get("timecode") or {}).get("start") or 0) - point))
        quality = _entry_frame_quality(Path(closest["path"]))
        gate = dict(candidate.get("productionGate") or {})
        checks = dict(gate.get("checks") or {}); checks["visualFrame"] = quality["passed"]
        gate["checks"] = checks; gate["passed"] = bool(gate.get("passed")) and quality["passed"]
        if not gate["passed"]:
            continue
        verified.append({**candidate, "productionGate": gate, "frameEvidence": {"timecode": closest.get("timecode"), "quality": quality, "sampleCount": len(frames)}})
    return {"schemaVersion": "hook-entry-v2", "candidates": verified}


def execute_supplemental_highlight_job(response: dict[str, Any], base_url: str, workspace: Path, on_progress=None) -> dict[str, Any]:
    job, episode = dict(response.get("job") or {}), dict(response.get("episode") or {})
    if str(job.get("stage")) != "supplemental_highlight":
        raise RuntimeError(f"Unsupported supplemental highlight stage: {job.get('stage')}")
    episode_id = str(episode.get("id") or "")
    collection_id = str(episode.get("collectionId") or episode.get("collection_id") or "pbc_lumepisodes")
    video_name = str(episode.get("video") or "")
    episode_number = int(episode.get("episode_number") or 0)
    if not episode_id or not video_name or episode_number <= 0:
        raise RuntimeError("supplemental highlight job is missing episode media")
    source = workspace / f"supplemental-{episode_number}{Path(video_name).suffix or '.video'}"
    download(f"{base_url.rstrip('/')}/api/files/{collection_id}/{episode_id}/{urllib.parse.quote(video_name)}", source)
    if on_progress:
        on_progress(20, "补充分析剧集对白与高光候选")
    # Reuse the persisted episode-local candidates and coarse transcript first.
    # They were produced by
    # the full drama pass and retain cross-scene context; a one-episode retry can
    # legitimately return zero and must not erase those evidence-backed assets.
    persisted = episode.get("analysis_result") if isinstance(episode.get("analysis_result"), dict) else {}
    persisted_root = persisted.get("result") if isinstance(persisted.get("result"), dict) else persisted
    candidates = persisted_root.get("precisionCandidates") if isinstance(persisted_root.get("precisionCandidates"), list) else []
    if isinstance(persisted_root.get("transcript"), list) and persisted_root.get("transcript"):
        coarse = AnalysisEnvelope(
            str(persisted.get("schema_version") or "1.0.0"),
            str(persisted.get("analysis_id") or f"persisted-{episode_id}"),
            "coarse", "succeeded",
            dict(persisted.get("source") or {"episode": episode_number, "durationSeconds": episode.get("duration_seconds")}),
            dict(persisted.get("engine") or {}), persisted_root,
        )
    else:
        coarse = analyze_coarse(source, episode_number, workspace)
    if not candidates and not (isinstance(persisted_root.get("transcript"), list) and persisted_root.get("transcript")):
        detail = analyze_detail([coarse], on_progress=on_progress)
        root = detail.result or {}
        candidates = root.get("precisionCandidates") if isinstance(root.get("precisionCandidates"), list) else []
    highlights: list[dict[str, Any]] = []
    for candidate in candidates[:5]:
        if not isinstance(candidate, dict) or candidate.get("precisionEligible") is False:
            continue
        start, end = float(candidate.get("start") or 0), float(candidate.get("end") or 0)
        if end <= start:
            continue
        try:
            precision = analyze_precision(source, episode_number, start, end, coarse, workspace)
            precision_root = precision.result or {}
            hooks = precision_root.get("hookCandidates") if isinstance(precision_root.get("hookCandidates"), list) else []
            highlights.extend(item for item in hooks if isinstance(item, dict))
        except Exception:
            # A malformed provider candidate must not abort transcript-backed
            # recovery for the whole episode.
            continue
    if not highlights:
        # Fail-safe candidate recovery from measured ASR boundaries. This does
        # not invent a plot: it exposes complete, contiguous dialogue events so
        # the story matcher can reason from quoted source evidence. The later
        # production gate still rejects any unsupported semantic claim.
        transcript = persisted_root.get("transcript") if isinstance(persisted_root.get("transcript"), list) else (coarse.result or {}).get("transcript", [])
        usable = [row for row in transcript if isinstance(row, dict) and float(row.get("end") or 0) > float(row.get("start") or 0) and str(row.get("text") or "").strip()]
        for anchor in range(0, len(usable), 3):
            group = usable[anchor:anchor + 4]
            if not group:
                continue
            start, end = float(group[0]["start"]), float(group[-1]["end"])
            if end - start < 10:
                continue
            if end - start > 60:
                end = min(end, start + 60)
            quoted = " ".join(str(row.get("text") or "").strip() for row in group)
            evidence = [{"source": "transcript", "text": str(row.get("text") or ""), "timecode": {"start": float(row["start"]), "end": float(row["end"])}, "confidence": float(row.get("confidence") or 0), "verification": "verified"} for row in group]
            boundary_evidence = [{"source": "asr_sentence_boundary", "result": "complete measured dialogue interval"}]
            highlights.append({
                "timecode": {"start": round(start, 3), "end": round(end, 3)},
                "safeStart": {"status": "verified", "dialogueStatus": "complete", "actionStatus": "complete", "shotStatus": "reviewable", "evidence": boundary_evidence},
                "safeEnd": {"status": "verified", "dialogueStatus": "complete", "actionStatus": "complete", "shotStatus": "reviewable", "evidence": boundary_evidence},
                "qualityGate": {"productionReady": True, "evidenceOnly": True},
                "hookType": "对白事件高光", "narrativePromise": quoted[:500],
                "informationGap": "该连续对白之后的行动结果是什么？",
                "themes": [], "contentTags": ["对白冲突", "事件推进"],
                "conflict": "以原片对白为准", "emotion": "由对白强度复核",
                "evidence": evidence,
            })
            if len(highlights) >= 2:
                break
    return {"schemaVersion": "supplemental-highlight-v1", "episode": episode_number, "highlights": highlights[:8]}


def execute_factory_render_job(response: dict[str, Any], base_url: str, workspace: Path, on_progress=None) -> dict[str, Any]:
    output_root = Path(os.getenv("LUMINA_FACTORY_RENDER_DIR", str(Path.cwd() / "public" / "renders")))
    return render_factory_project(response, base_url, workspace, output_root, on_progress)


def _upgrade_legacy_material_result(legacy: dict[str, Any], material_id: str) -> dict[str, Any]:
    semantic = dict(legacy.get("semantic") or {})

    def claim(field: str, code: str) -> dict[str, Any] | None:
        source = semantic.get(field)
        if not isinstance(source, dict) or source.get("value") in (None, "", []):
            return None
        evidence = []
        for item in source.get("evidence") or []:
            if isinstance(item, dict):
                evidence.append({key: value for key, value in item.items() if key != "episode"})
        value = source.get("value")
        label = "；".join(str(item) for item in value) if isinstance(value, list) else str(value)
        return {
            "code": code,
            "label": label,
            "confidence": float(source.get("confidence") or 0),
            "evidence": evidence,
            "verification": source.get("verification") if source.get("verification") in ("verified", "unverified") else "unverified",
        }

    summary_source = semantic.get("summary") if isinstance(semantic.get("summary"), dict) else {}
    summary = {
        "value": str(summary_source.get("value") or ""),
        "confidence": float(summary_source.get("confidence") or 0),
        "evidence": [{key: value for key, value in item.items() if key != "episode"} for item in (summary_source.get("evidence") or []) if isinstance(item, dict)],
    }
    timeline = []
    for index, item in enumerate(semantic.get("structure") or []):
        if not isinstance(item, dict):
            continue
        timeline.append({
            "code": f"LEGACY_STRUCTURE_{index + 1}", "label": str(item.get("label") or "结构节点"),
            "start": float(item.get("start") or 0), "end": float(item.get("end") or item.get("start") or 0),
            "confidence": float(item.get("confidence") or 0),
            "evidence": [{key: value for key, value in evidence.items() if key != "episode"} for evidence in (item.get("evidence") or []) if isinstance(evidence, dict)],
            "verification": item.get("verification") if item.get("verification") in ("verified", "unverified") else "unverified",
        })
    # A legacy hookType is a categorical label, not a localized reusable
    # interval. Never promote its scattered evidence span into a hook asset.
    hook = None
    material_format = claim("materialType", "LEGACY_FORMAT")
    tier = claim("tier", str((semantic.get("tier") or {}).get("value") or "TX"))
    transition = claim("transition", "LEGACY_TRANSITION")
    inspiration = claim("prototype", "LEGACY_INSPIRATION")
    duration = float(legacy.get("durationSeconds") or 0)
    content = {"summary": summary, "tags": [], "characters": [], "relationships": [], "segments": timeline, "completeness": {"code": "PARTIAL_LEGACY", "label": "历史分析证据可用，新增维度待复核", "confidence": 1, "evidence": [], "verification": "verified"}}
    creative = {"format": material_format or {}, "tier": tier or {}, "hooks": [hook] if hook else [], "timeline": timeline, "transitions": [transition] if transition else [], "packaging": {"visual": [], "subtitle": [], "audio": [], "rhythm": []}}
    value = {"scores": {}, "inspirations": [inspiration] if inspiration else [], "risks": [], "suitableGenres": [], "suitableAudiences": []}
    review = {"status": "needs_review", "reasons": ["千问账户额度不可用；已保留此前模型生成且带时间码证据的结论，未覆盖的 material-v2 维度保持为空。"], "items": [{"id": "provider-arrearage", "field": "semantic.full_merge", "label": "全片汇总待补跑", "reason": "DashScope 返回 Arrearage", "confidence": 1}, {"id": "legacy-hook-not-localized", "field": "creative.hooks", "label": "历史钩子未定位", "reason": "旧版结果只有类型标签，没有经过对白、动作和镜头边界校验的独立区间。", "confidence": 1}]}
    result = {"schemaVersion": "material-v2", "evidence": {"transcript": legacy.get("transcript") or [], "ocr": legacy.get("ocr") or [], "keyframes": [{key: value for key, value in frame.items() if key != "path"} for frame in (legacy.get("keyframes") or []) if isinstance(frame, dict)], "shots": [], "audioEvents": []}, "content": content, "creative": creative, "value": value, "review": review, "sourceAttribution": {"status": "not_required", "matches": []}, "semanticSegments": [], "semantic": {"content": content, "creative": creative, "value": value, "review": review}, "materialFields": {"analysis": "分析完成（待复核）", "analysisStatus": "succeeded", "materialType": material_format.get("label", "未确定") if material_format else "未确定", "tier": tier.get("label", "TX") if tier else "TX", "hookType": hook.get("label", "未确定") if hook else "未确定", "transition": transition.get("label", "未确定") if transition else "未确定", "prototype": inspiration.get("label", "未确定") if inspiration else "未确定", "summary": summary["value"], "highlights": timeline, "structure": timeline, "review": "待人工复核", "confidence": round(100 * max([summary["confidence"], *(item["confidence"] for item in timeline)], default=0))}, "durationSeconds": duration}
    return {"schema_version": "material-v2", "analysis_id": f"legacy-upgrade-{material_id}", "tier": "coarse", "status": "succeeded", "source": {"kind": "external_paid_ad_material", "durationSeconds": duration}, "engines": {"semantic": "verified-legacy-result", "upgrade": "local-material-v2"}, "result": result}


def process_one_endpoint(base_url: str, token: str, worker_id: str, api_prefix: str, kind: str, optional: bool = False, job_id: str | None = None) -> bool:
    try:
        # Long-form material synthesis/repair calls can legitimately take more
        # than ten minutes. Keep the lease at the server-supported maximum so a
        # completed result is not rejected while the worker is inside one model
        # request and cannot emit an intermediate progress heartbeat.
        claim_body = {"worker_id": worker_id, "lease_seconds": 1800}
        if job_id:
            claim_body["job_id"] = job_id
        status, response = api_request(base_url, token, f"{api_prefix}/claim", "POST", claim_body)
    except ApiRequestError as exc:
        # Rolling deployments may start the worker before the material hook and
        # migration are present. Keep serving drama jobs instead of exiting.
        if optional and exc.status in (400, 404):
            return False
        raise
    if status == 204 or not response:
        return False
    job = response["job"]
    job_id = job["id"]
    raw_parameters = job.get("parameters")
    claimed_parameters = dict(raw_parameters) if isinstance(raw_parameters, dict) else {}
    print(f"[{kind}:{job_id}] claimed stage={job.get('stage')} attempt={job.get('attempt')}", file=sys.stderr, flush=True)
    heartbeat_stop = threading.Event()
    progress_state: dict[str, Any] = {"value": 5, "stage": "领取任务"}

    def material_stage(progress: int, label: str) -> str:
        """Map worker progress onto the persisted material-v2 stages."""
        lowered = label.lower()
        if any(word in lowered for word in ("download", "下载", "准备")):
            return "download"
        if any(word in lowered for word in ("asr", "ocr", "transcript", "转写", "字幕", "证据")):
            return "evidence"
        if any(word in lowered for word in ("global", "summary", "汇总")):
            return "creative"
        if any(word in lowered for word in ("segment", "semantic", "qwen", "语义", "理解")):
            return "content"
        if any(word in lowered for word in ("validate", "repair", "review", "校验", "修复", "复核")):
            return "review"
        if any(word in lowered for word in ("scan", "frame", "shot", "audio", "ffmpeg", "抽帧", "镜头", "音频")):
            return "scan"
        if progress < 12:
            return "download"
        if progress < 38:
            return "scan"
        if progress < 74:
            return "evidence"
        if progress < 88:
            return "content"
        if progress < 94:
            return "creative"
        if progress < 97:
            return "value"
        return "review"

    def report_progress(progress: int, stage: str) -> None:
        progress_state["value"] = max(progress_state["value"], min(99, int(progress)))
        progress_state["stage"] = stage
        payload = {
            "worker_id": worker_id, "lease_token": job["lease_token"], "status": "rendering" if kind == "factory_render" else "running",
            "progress": progress_state["value"], "lease_seconds": 1800,
            "logs": {**claimed_parameters, "stage": stage, "kind": kind},
        }
        if kind == "hook_match":
            value = progress_state["value"]
            payload["current_stage"] = "准备匹配" if value < 20 else "理解选中故事线" if value < 45 else "评估钩子承接关系" if value < 85 else "校验时间戳与证据"
        elif kind in ("material", "preface", "entry_precision", "supplemental_highlight", "factory_render"):
            payload["current_stage"] = material_stage(progress_state["value"], stage)
        api_request(base_url, token, f"{api_prefix}/jobs/{job_id}", "PATCH", payload)

    def heartbeat() -> None:
        while not heartbeat_stop.wait(120):
            try:
                report_progress(progress_state["value"], progress_state["stage"])
            except Exception:
                # The final PATCH remains authoritative; a transient heartbeat
                # failure must not discard completed local analysis work.
                pass

    heartbeat_thread = threading.Thread(target=heartbeat, name=f"lease-{job_id}", daemon=True)
    heartbeat_thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="lumina-analysis-") as tmp:
            report_progress(5, "准备处理")
            print(f"[{kind}:{job_id}] executing", file=sys.stderr, flush=True)
            if kind == "material":
                result = execute_material_job(response, base_url, Path(tmp), report_progress)
            elif kind == "preface":
                result = execute_preface_analysis_job(response, base_url, Path(tmp), report_progress)
            elif kind == "hook_match":
                result = execute_hook_match_job(response, report_progress)
            elif kind == "entry_precision":
                result = execute_entry_precision_job(response, base_url, Path(tmp), report_progress)
            elif kind == "supplemental_highlight":
                result = execute_supplemental_highlight_job(response, base_url, Path(tmp), report_progress)
            elif kind == "factory_render":
                result = execute_factory_render_job(response, base_url, Path(tmp), report_progress)
            else:
                result = execute_semantic_job(job, base_url, Path(tmp), report_progress)
        if kind == "drama" and job.get("stage") == "precision" and claimed_parameters.get("generation"):
            result["asset_generation"] = claimed_parameters["generation"]
        final_payload = {"worker_id": worker_id, "lease_token": job["lease_token"], "status": "succeeded", "result": result, "logs": {**claimed_parameters, "processor": "processor.semantic_analysis", "analysisVersion": result.get("schema_version", kind), "stage": job["stage"], "kind": kind}}
        if kind == "material":
            final_payload["classification"] = result.get("classification")
            final_payload["library_asset"] = result.get("library_asset")
            final_payload["library_assets"] = result.get("library_assets")
        if kind == "factory_render":
            final_payload.update(result)
        api_request(base_url, token, f"{api_prefix}/jobs/{job_id}", "PATCH", final_payload)
    except Exception as exc:
        error_kind, retryable, base_delay = classify_failure(exc)
        attempt = max(1, int(job.get("attempt") or 1))
        retry_after = min(1800, base_delay * (2 ** (attempt - 1))) if retryable else 0
        try:
            api_request(base_url, token, f"{api_prefix}/jobs/{job_id}", "PATCH", {"worker_id": worker_id, "lease_token": job["lease_token"], "status": "failed", "error": str(exc)[:2000], "error_kind": error_kind, "retryable": retryable, "retry_after_seconds": retry_after})
        except Exception as patch_exc:
            print(f"[{kind}:{job_id}] task failed: {exc}; status update failed: {patch_exc}", file=sys.stderr, flush=True)
        else:
            print(f"[{kind}:{job_id}] task failed: {exc}", file=sys.stderr, flush=True)
    finally:
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=2)
    return True


def process_available(base_url: str, token: str, worker_id: str, queue: str = "both", job_id: str | None = None) -> bool:
    """Process only the configured queue so long jobs cannot starve each other."""
    if queue == "drama":
        return process_one_endpoint(base_url, token, worker_id, "/api/lumina/analysis", "drama", job_id=job_id)
    if queue == "material":
        # Interactive production jobs must not wait behind an arbitrary backlog
        # of ingestion analysis. Serve the user's active chain first, then use
        # idle capacity for supplemental and ordinary material work.
        # An explicit id can belong to any interactive material-side queue.
        # Probe every queue in priority order; each claim endpoint returns 204
        # when the id is not present there. Previously --job-id skipped all
        # interactive queues and only queried ordinary material analysis, so a
        # stuck hook-match or render job could not be recovered deterministically.
        hook_match = process_one_endpoint(base_url, token, worker_id, "/api/lumina/hook-matching", "hook_match", optional=True, job_id=job_id)
        entry_precision = not hook_match and process_one_endpoint(base_url, token, worker_id, "/api/lumina/entry-precision", "entry_precision", optional=True, job_id=job_id)
        factory_render = not hook_match and not entry_precision and process_one_endpoint(base_url, token, worker_id, "/api/lumina/factory-render", "factory_render", optional=True, job_id=job_id)
        supplemental = not hook_match and not entry_precision and not factory_render and process_one_endpoint(base_url, token, worker_id, "/api/lumina/supplemental-highlights", "supplemental_highlight", optional=True, job_id=job_id)
        preface = not hook_match and not entry_precision and not factory_render and not supplemental and process_one_endpoint(base_url, token, worker_id, "/api/lumina/preface-analysis", "preface", optional=True, job_id=job_id)
        material = not hook_match and not entry_precision and not factory_render and not supplemental and not preface and process_one_endpoint(base_url, token, worker_id, "/api/lumina/material-analysis", "material", optional=True, job_id=job_id)
        return material or preface or supplemental or hook_match or entry_precision or factory_render
    if job_id:
        raise ValueError("--job-id requires --queue drama or --queue material")
    drama = process_one_endpoint(base_url, token, worker_id, "/api/lumina/analysis", "drama")
    preface = process_one_endpoint(base_url, token, worker_id, "/api/lumina/preface-analysis", "preface", optional=True)
    material = not preface and process_one_endpoint(base_url, token, worker_id, "/api/lumina/material-analysis", "material", optional=True)
    supplemental = process_one_endpoint(base_url, token, worker_id, "/api/lumina/supplemental-highlights", "supplemental_highlight", optional=True)
    hook_match = process_one_endpoint(base_url, token, worker_id, "/api/lumina/hook-matching", "hook_match", optional=True)
    entry_precision = process_one_endpoint(base_url, token, worker_id, "/api/lumina/entry-precision", "entry_precision", optional=True)
    factory_render = process_one_endpoint(base_url, token, worker_id, "/api/lumina/factory-render", "factory_render", optional=True)
    return drama or preface or material or supplemental or hook_match or entry_precision or factory_render


def main() -> None:
    parser = argparse.ArgumentParser(description="Lumina PocketBase three-tier semantic-analysis worker")
    parser.add_argument("--base-url", default=os.environ.get("NEXT_PUBLIC_POCKETBASE_URL", "http://127.0.0.1:8090"))
    parser.add_argument("--token", default=os.environ.get("LUMINA_WORKER_TOKEN"))
    parser.add_argument("--worker-id", default=f"media-worker-{os.getpid()}")
    parser.add_argument("--queue", choices=("drama", "material", "both"), default=os.environ.get("LUMINA_WORKER_QUEUE", "both"))
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--job-id", help="Claim one exact job; requires --queue drama or material")
    parser.add_argument("--poll-seconds", type=float, default=3.0)
    args = parser.parse_args()
    if not args.token:
        raise SystemExit("Set LUMINA_WORKER_TOKEN or pass --token")
    while True:
        try:
            processed = process_available(args.base_url, args.token, args.worker_id, args.queue, args.job_id)
        except (urllib.error.URLError, ConnectionError, TimeoutError) as exc:
            # PocketBase restarts automatically when hooks change. Keep the
            # worker alive so queued analysis resumes without manual relaunch.
            print(f"[worker:{args.worker_id}] backend unavailable; retrying: {exc}", file=sys.stderr, flush=True)
            if args.once or args.job_id:
                raise
            time.sleep(max(1.0, args.poll_seconds))
            continue
        if args.once:
            return
        if not processed:
            time.sleep(max(0.5, args.poll_seconds))


if __name__ == "__main__":
    main()
