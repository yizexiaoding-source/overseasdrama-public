from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import re


@dataclass(frozen=True)
class PrefaceBoundaryDecision:
    start: float = 0.0
    end: float = 0.0
    source: str = "missing"
    confidence: float = 0.0
    evidence: tuple[dict[str, Any], ...] = ()

    @property
    def valid(self) -> bool:
        return self.end > self.start >= 0


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _rows(value: Any) -> list[dict[str, Any]]:
    return [row for row in value if isinstance(row, dict)] if isinstance(value, list) else []


def _number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _verified(row: dict[str, Any]) -> bool:
    return str(row.get("verification") or "").strip().lower() == "verified"


def _evidence(row: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    return tuple(item for item in row.get("evidence", []) if isinstance(item, dict))


def _decision(
    start: float,
    end: float,
    source: str,
    row: dict[str, Any],
    duration_seconds: float,
) -> PrefaceBoundaryDecision:
    duration = max(0.0, _number(duration_seconds))
    bounded_start = max(0.0, _number(start))
    bounded_end = max(0.0, _number(end))
    if duration:
        bounded_end = min(duration, bounded_end)
    if bounded_start > min(5.0, max(1.0, duration * 0.1 if duration else 5.0)):
        return PrefaceBoundaryDecision()
    if bounded_end <= bounded_start:
        return PrefaceBoundaryDecision()
    confidence = max(0.0, min(1.0, _number(row.get("confidence"))))
    return PrefaceBoundaryDecision(
        bounded_start,
        bounded_end,
        source,
        confidence,
        _evidence(row),
    )


def resolve_preface_boundary(
    analysis: dict[str, Any], duration_seconds: float
) -> PrefaceBoundaryDecision:
    """Resolve an opening/body handoff without ever falling back to full duration.

    Evidence is considered in a stable order. A matching opening hook and body
    transition corroborate each other even when an older analysis did not emit
    an explicit verification flag. A lone unverified timestamp is ignored.
    """
    creative = _object(analysis.get("creative"))
    content = _object(analysis.get("content"))
    transition = _object(creative.get("bodyTransition"))
    transition_at = _number(transition.get("start", transition.get("time")))

    hooks = _rows(creative.get("hooks"))
    direct_hook = _object(creative.get("hook"))
    if direct_hook:
        hooks.insert(0, direct_hook)
    hooks.sort(key=lambda row: _number(row.get("start"), 10**9))
    for hook in hooks:
        start = _number(hook.get("start"))
        end = _number(hook.get("end"))
        corroborated = transition_at > 0 and abs(transition_at - end) <= 0.5
        if _verified(hook) or _evidence(hook) or corroborated:
            decision = _decision(start, end, "verified_hook", hook, duration_seconds)
            if decision.valid:
                return decision

    if transition_at > 0 and (_verified(transition) or _evidence(transition)):
        decision = _decision(0.0, transition_at, "body_transition", transition, duration_seconds)
        if decision.valid:
            return decision

    transitions = sorted(
        (
            row
            for row in _rows(creative.get("transitions"))
            if _verified(row) and _number(row.get("start", row.get("time"))) > 0
        ),
        key=lambda row: _number(row.get("start", row.get("time"))),
    )
    if transitions:
        row = transitions[0]
        at = _number(row.get("start", row.get("time")))
        decision = _decision(0.0, at, "verified_transition", row, duration_seconds)
        if decision.valid:
            return decision

    segments = sorted(
        (row for row in _rows(content.get("segments")) if _verified(row)),
        key=lambda row: _number(row.get("start")),
    )
    opening_pattern = re.compile(r"前贴|引入|钩子|广告|冷开|teaser|hook", re.I)
    body_pattern = re.compile(r"正片|剧情|主线|正文|body|story", re.I)
    for previous, current in zip(segments, segments[1:]):
        previous_text = str(previous.get("label") or previous.get("description") or "")
        current_text = str(current.get("label") or current.get("description") or "")
        if opening_pattern.search(previous_text) and body_pattern.search(current_text):
            at = _number(current.get("start")) or _number(previous.get("end"))
            row = {
                "confidence": min(
                    _number(previous.get("confidence"), 1.0),
                    _number(current.get("confidence"), 1.0),
                ),
                "evidence": [*list(_evidence(previous)), *list(_evidence(current))],
            }
            decision = _decision(0.0, at, "segment_handoff", row, duration_seconds)
            if decision.valid:
                return decision

    return PrefaceBoundaryDecision()
