from __future__ import annotations

import math
from pathlib import Path
from typing import Any


def preface_clip_asset_fields(
    clip_path: Path,
    clip_hash: str,
    clip_range: tuple[float, float],
) -> dict[str, Any]:
    """Return the complete persistence contract for a physical preface clip."""
    start = max(0, math.floor(float(clip_range[0])))
    end = max(start + 1, math.ceil(float(clip_range[1])))
    return {
        "local_media_path": str(clip_path.resolve()),
        "content_hash": clip_hash,
        "clip_start_seconds": start,
        "clip_end_seconds": end,
        "source_ranges": [{"start": start, "end": end}],
        "assembled_duration": end - start,
        "clip_status": "ready",
    }
