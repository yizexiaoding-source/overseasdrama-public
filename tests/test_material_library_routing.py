import unittest

from processor.material_routing import classify_material_asset


class MaterialLibraryRoutingTests(unittest.TestCase):
    def test_image_is_always_a_poster(self):
        decision = classify_material_asset({}, "image")
        self.assertEqual(decision.material_type, "海报图片")
        self.assertEqual(decision.library_bucket, "running")

    def test_narration_routes_to_the_narration_library(self):
        evidence = [{"source": "transcript", "timecode": {"start": 0, "end": 4}}]
        decision = classify_material_asset({"creative": {"narrationCoverage": {"value": 0.32, "confidence": 0.9, "verification": "verified", "evidence": evidence}, "narrationSegments": [{"start": 0, "end": 4, "text": "She never expected this.", "language": "en-US", "verification": "verified", "evidence": evidence}]}}, "video", duration_seconds=20)
        self.assertEqual(decision.material_type, "解说")
        self.assertEqual(decision.library_bucket, "narration")

        claim_decision = classify_material_asset(
            {"creative": {"materialType": {"value": "解说", "confidence": 0.8}, "narrationSegments": [{"start": 1, "end": 2.5, "text": "她没有想到。", "verification": "verified", "evidence": evidence}]}},
            "video",
        )
        self.assertEqual(claim_decision.material_type, "解说")

    def test_ai_preface_can_also_create_a_narration_asset(self):
        evidence = [{"source": "transcript", "timecode": {"start": 0, "end": 5}}]
        decision = classify_material_asset(
            {"creative": {"openingAssetOrigin": {"value": "AI生成前贴", "confidence": .95, "verification": "verified", "evidence": [{"source": "frame"}]}, "hooks": [{"start": 0, "end": 8}], "bodyTransition": {"start": 8}, "bodyFormat": {"value": "混合"}, "narrationSegments": [{"start": 0, "end": 5, "text": "This is where it began.", "language": "en-US", "verification": "verified", "evidence": evidence}] }},
            "video",
            duration_seconds=40,
        )
        self.assertEqual(decision.material_type, "AI前贴")
        self.assertTrue(decision.also_narration)

    def test_pure_narration_does_not_enter_the_ai_preface_library(self):
        evidence = [{"source": "audio", "timecode": {"start": 0, "end": 12}}]
        decision = classify_material_asset(
            {"creative": {
                "bodyFormat": {"value": "解说主导", "confidence": 0.96},
                "narrationCoverage": {"value": 0.8, "confidence": 0.95, "verification": "verified", "evidence": evidence},
                "narrationSegments": [{
                    "start": 0,
                    "end": 12,
                    "text": "She discovered the truth too late.",
                    "language": "en-US",
                    "verification": "verified",
                    "evidence": evidence,
                }],
            }},
            "video",
            duration_seconds=15,
        )
        self.assertEqual(decision.material_type, "解说")
        self.assertEqual(decision.library_bucket, "narration")
        self.assertFalse(decision.also_narration)

    def test_distinct_preface_requires_a_valid_boundary(self):
        analysis = {"creative": {"openingAssetOrigin": {"value": "AI生成前贴", "confidence": .95, "verification": "verified", "evidence": [{"source": "frame"}]}, "hook": {"start": 0, "end": 18}, "bodyTransition": {"start": 18}, "bodyFormat": {"value": "正片主导"}}}
        decision = classify_material_asset(analysis, "video", duration_seconds=92)
        self.assertEqual(decision.material_type, "AI前贴")
        self.assertEqual(decision.library_bucket, "ai_preface")
        self.assertEqual(decision.clip_range, (0.0, 18.0))

        invalid = classify_material_asset({"creative": {"openingAssetOrigin": {"value": "AI生成前贴", "confidence": .95, "verification": "verified", "evidence": [{"source": "frame"}]}, "hook": {"start": 20, "end": 120}, "bodyFormat": {"value": "正片主导"}}}, "video", duration_seconds=92)
        self.assertEqual(invalid.material_type, "未判定")
        self.assertTrue(invalid.review_required)

        list_result = classify_material_asset(
            {"creative": {"openingAssetOrigin": {"value": "AI生成前贴", "confidence": .9, "verification": "verified", "evidence": [{"source": "frame"}]}, "hooks": [{"start": 0, "end": 11.5}], "bodyTransition": {"start": 11.5}, "bodyFormat": {"value": "正片主导"}}},
            "video",
            duration_seconds=80,
        )
        self.assertEqual(list_result.material_type, "AI前贴")
        self.assertEqual(list_result.clip_range, (0.0, 11.5))

    def test_marketing_hook_without_generation_evidence_stays_original_compilation(self):
        decision = classify_material_asset(
            {"creative": {"hookAssemblyType": {"value": "非正片前贴+正片", "confidence": 0.86}, "hooks": [{"label": "广告式前贴钩子", "start": 0, "end": 14.2}], "bodyTransition": {"start": 14.2}, "bodyFormat": {"value": "正片主导"}}},
            "video",
            duration_seconds=90,
        )
        self.assertEqual(decision.material_type, "原剧拼接")
        self.assertEqual(decision.library_bucket, "running")
        self.assertIsNone(decision.clip_range)

    def test_unproven_preface_with_unknown_body_requires_review(self):
        decision = classify_material_asset(
            {"creative": {"hookAssemblyType": {"value": "非正片前贴+正片"}, "hooks": [{"start": 0, "end": 14.2}], "bodyTransition": {"start": 14.2}, "bodyFormat": {"value": "未确定"}}},
            "video",
            duration_seconds=90,
        )
        self.assertEqual(decision.material_type, "未判定")
        self.assertTrue(decision.review_required)

    def test_non_drama_content_without_a_later_drama_body_is_not_ai_preface(self):
        decision = classify_material_asset(
            {"creative": {"hookAssemblyType": {"value": "非正片内容"}, "hooks": [{"label": "广告式内容", "start": 0, "end": 30}], "bodyFormat": {"value": "未确定"}}},
            "video",
            duration_seconds=30,
        )
        self.assertEqual(decision.material_type, "未判定")
        self.assertIsNone(decision.clip_range)

    def test_original_compilation_stays_in_the_running_feed(self):
        decision = classify_material_asset({"creative": {"materialType": {"label": "正片剧集拼接", "confidence": 0.9}}}, "video")
        self.assertEqual(decision.material_type, "原剧拼接")
        self.assertEqual(decision.library_bucket, "running")

    def test_manual_override_wins_over_automatic_analysis(self):
        decision = classify_material_asset(
            {"creative": {"narrationCoverage": 0.95}},
            "video",
            manual_override={"materialType": "原剧拼接"},
        )
        self.assertEqual(decision.material_type, "原剧拼接")
        self.assertEqual(decision.source, "manual")

    def test_manual_type_review_can_route_to_both_preface_and_narration_libraries(self):
        decision = classify_material_asset(
            {"creative": {"hooks": [{"start": 0, "end": 8}], "bodyTransition": {"start": 8}}},
            "video",
            duration_seconds=40,
            manual_override={"materialType": "AI前贴", "hasPreface": "yes", "hasNarration": "yes", "note": "开头是独立制作内容，且有画外解说"},
        )
        self.assertEqual(decision.material_type, "AI前贴")
        self.assertEqual(decision.library_bucket, "ai_preface")
        self.assertTrue(decision.also_narration)
        self.assertEqual(decision.clip_range, (0.0, 8.0))
        self.assertEqual(decision.source, "manual")

    def test_manual_preface_without_boundary_never_uses_full_duration(self):
        decision = classify_material_asset(
            {
                "creative": {
                    "openingAssetOrigin": {
                        "label": "AI生成前贴",
                        "confidence": 0.98,
                        "verification": "verified",
                        "evidence": [{"source": "frame"}],
                    }
                }
            },
            "video",
            duration_seconds=153.669955,
            manual_override={"hasPreface": "yes", "hasNarration": "no"},
        )

        self.assertEqual(decision.library_bucket, "running")
        self.assertTrue(decision.review_required)
        self.assertIsNone(decision.clip_range)

    def test_manual_type_review_keeps_original_compilation_exclusive(self):
        decision = classify_material_asset(
            {"creative": {"materialType": {"value": "AI前贴"}}},
            "video",
            manual_override={"materialType": "原剧拼接", "hasPreface": "no", "hasNarration": "no"},
        )
        self.assertEqual(decision.material_type, "原剧拼接")
        self.assertEqual(decision.library_bucket, "running")
        self.assertFalse(decision.also_narration)

    def test_insufficient_manual_type_review_never_enters_a_special_library(self):
        decision = classify_material_asset(
            {"creative": {"materialType": {"value": "解说"}}},
            "video",
            manual_override={"materialType": "未判定", "hasPreface": "uncertain", "hasNarration": "yes"},
        )
        self.assertEqual(decision.material_type, "未判定")
        self.assertEqual(decision.library_bucket, "running")
        self.assertTrue(decision.review_required)

    def test_uncertain_evidence_remains_undetermined(self):
        decision = classify_material_asset({"creative": {}}, "video")
        self.assertEqual(decision.material_type, "未判定")
        self.assertTrue(decision.review_required)


if __name__ == "__main__":
    unittest.main()
