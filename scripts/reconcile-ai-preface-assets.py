from __future__ import annotations

import argparse
import json
from typing import Any, NamedTuple
import urllib.parse
import urllib.request


class AuditFinding(NamedTuple):
    reason: str
    detail: str


def _number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _has_file(value: Any) -> bool:
    if isinstance(value, list):
        return any(str(item).strip() for item in value)
    return bool(str(value or "").strip())


def audit_asset(asset: dict[str, Any], source: dict[str, Any]) -> AuditFinding | None:
    start = max(0.0, _number(asset.get("clip_start_seconds")))
    end = max(0.0, _number(asset.get("clip_end_seconds")))
    source_duration = max(0.0, _number(source.get("duration_seconds")))
    covers_full_source = source_duration > 30 and start <= 0.5 and end >= source_duration * 0.95
    if covers_full_source and not _has_file(asset.get("media_file")):
        return AuditFinding("full_source_without_clip", f"asset={end:.3f}s source={source_duration:.3f}s")
    if end <= start:
        return AuditFinding("invalid_range", f"start={start:.3f}s end={end:.3f}s")
    if str(asset.get("clip_status") or "") != "ready":
        return AuditFinding("clip_not_ready", str(asset.get("clip_status") or "missing"))
    if not _has_file(asset.get("media_file")):
        return AuditFinding("missing_media_file", "ready asset has no physical media file")
    return None


def _json_request(url: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=body, method=method, headers={"content-type": "application/json", "x-lumina-ui": "local"})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()
    return json.loads(raw) if raw else {}


def _list_assets(base_url: str, asset_id: str = "") -> list[dict[str, Any]]:
    if asset_id:
        record = _json_request(f"{base_url}/api/collections/material_library_assets/records/{urllib.parse.quote(asset_id)}?expand=source_material")
        return [record]
    query = urllib.parse.urlencode({"filter": 'asset_kind="ai_preface"', "expand": "source_material", "perPage": 500})
    return list(_json_request(f"{base_url}/api/collections/material_library_assets/records?{query}").get("items", []))


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit and requeue legacy AI-preface assets without valid physical clips.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8090")
    parser.add_argument("--asset", default="", help="Audit one material_library_assets record id")
    parser.add_argument("--apply", action="store_true", help="Queue source-material reanalysis; default is dry-run")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    findings = 0
    for asset in _list_assets(base_url, args.asset):
        source = (asset.get("expand") or {}).get("source_material") or {}
        finding = audit_asset(asset, source)
        if not finding:
            print(f"OK {asset.get('id')}")
            continue
        findings += 1
        source_id = str(asset.get("source_material") or source.get("id") or "")
        print(f"FLAG {asset.get('id')} {finding.reason} {finding.detail} source={source_id}")
        if args.apply and source_id:
            _json_request(
                f"{base_url}/api/lumina/material-analysis/materials/{urllib.parse.quote(source_id)}/retry",
                "POST",
                {"force": True, "force_semantic_refresh": True},
            )
            print(f"QUEUED {source_id}")
    print(f"SUMMARY mode={'apply' if args.apply else 'dry-run'} findings={findings}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
