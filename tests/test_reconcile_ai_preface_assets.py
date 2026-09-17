import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "reconcile-ai-preface-assets.py"
SPEC = importlib.util.spec_from_file_location("reconcile_ai_preface_assets", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ReconcileAiPrefaceAssetsTests(unittest.TestCase):
    def test_flags_full_source_asset_without_media_file(self):
        finding = MODULE.audit_asset(
            {
                "clip_start_seconds": 0,
                "clip_end_seconds": 153.67,
                "media_file": "",
                "clip_status": "pending",
            },
            {"duration_seconds": 153.67},
        )

        self.assertIsNotNone(finding)
        self.assertEqual(finding.reason, "full_source_without_clip")

    def test_ready_clipped_asset_is_untouched(self):
        finding = MODULE.audit_asset(
            {
                "clip_start_seconds": 0,
                "clip_end_seconds": 10,
                "media_file": "clip.mp4",
                "clip_status": "ready",
            },
            {"duration_seconds": 153.67},
        )

        self.assertIsNone(finding)


if __name__ == "__main__":
    unittest.main()
