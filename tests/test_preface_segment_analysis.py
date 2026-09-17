import unittest

from pathlib import Path

from processor.job_worker import (
    _offset_preface_timecodes,
    _preface_clip_bounds,
    _preface_input_bounds,
    _segment_library_analysis,
)
from processor.preface_clip import preface_clip_asset_fields


class PrefaceSegmentAnalysisTests(unittest.TestCase):
    def test_bounds_reject_empty_or_reverse_ranges(self):
        with self.assertRaisesRegex(ValueError, "invalid preface clip range"):
            _preface_clip_bounds({"clip_start_seconds": 12, "clip_end_seconds": 12})

    def test_bounds_return_only_requested_preface_seconds(self):
        self.assertEqual(_preface_clip_bounds({"clip_start_seconds": 7.5, "clip_end_seconds": 20}), (7.5, 20.0))

    def test_pre_cut_asset_is_still_limited_to_declared_preface_duration(self):
        self.assertEqual(_preface_input_bounds(True, 7.5, 20), (0.0, 12.5))
        self.assertEqual(_preface_input_bounds(False, 7.5, 20), (7.5, 20.0))

    def test_offsets_nested_clip_evidence_to_source_timeline(self):
        value = {
            "scope": {"start": 0, "end": 12.5},
            "content": {"segments": [{"start": 1, "end": 3, "evidence": [{"timecode": {"start": 1.2, "end": 2.8}}]}]},
        }
        shifted = _offset_preface_timecodes(value, 7.5, 20)
        self.assertEqual(shifted["scope"], {"start": 7.5, "end": 20.0})
        self.assertEqual(shifted["content"]["segments"][0]["start"], 8.5)
        self.assertEqual(shifted["content"]["segments"][0]["evidence"][0]["timecode"], {"start": 8.7, "end": 10.3})

    def test_segment_projection_keeps_relationships_and_reusable_hook_mechanism(self):
        analysis = {
            "content": {"summary": {"value": "女孩当众拒绝母亲"}, "relationships": [{"label": "母女对立", "start": 0, "end": 12}]},
            "creative": {"hooks": [{"start": 0, "end": 12, "hookType": "公开剥夺", "conflict": "母亲强行夺走女孩的入场资格", "visualSummary": "母亲把女孩拽出队伍"}]},
        }
        projected = _segment_library_analysis({"result": {"evidence": {}}}, analysis, "ai_preface", 0, 12)
        self.assertEqual(projected["content"]["relationships"][0]["label"], "母女对立")
        self.assertEqual(projected["creative"]["replicationMechanism"], "母亲强行夺走女孩的入场资格")
        self.assertEqual(projected["creative"]["openingAction"], "母亲把女孩拽出队伍")
        self.assertEqual(projected["creative"]["creativeSummary"], "女孩当众拒绝母亲")
        self.assertIn("handoff", projected["creative"])

    def test_preface_clip_payload_is_complete_and_uses_whole_seconds(self):
        fields = preface_clip_asset_fields(
            Path("D:/clips/source-ai-preface.mp4"),
            "abc123",
            (0.0, 9.067),
        )

        self.assertEqual(fields["clip_start_seconds"], 0)
        self.assertEqual(fields["clip_end_seconds"], 10)
        self.assertEqual(fields["source_ranges"], [{"start": 0, "end": 10}])
        self.assertEqual(fields["assembled_duration"], 10)
        self.assertEqual(fields["clip_status"], "ready")
        self.assertTrue(fields["local_media_path"].endswith("source-ai-preface.mp4"))


if __name__ == "__main__":
    unittest.main()
