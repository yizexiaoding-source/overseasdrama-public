import unittest

from processor.semantic_analysis import _fast_preface_boundary_candidates, _select_material_frames


class MaterialFastSamplingTests(unittest.TestCase):
    def test_keeps_dense_opening_evidence_and_later_body_evidence(self):
        frames = [{"timecode": float(second), "path": f"{second}.jpg"} for second in range(0, 181, 10)]
        selected = _select_material_frames(frames, 10, fast_mode=True)
        times = [float(item["timecode"]) for item in selected]
        self.assertIn(0.0, times)
        self.assertIn(10.0, times)
        self.assertIn(60.0, times)
        self.assertTrue(any(value > 60 for value in times))
        self.assertLessEqual(len(selected), 10)

    def test_ranks_a_local_visual_reset_without_classifying_it_as_a_preface(self):
        measurements = [
            {"timecode": float(second), "brightness": 40.0, "histogram": 0.12, "edgeDensity": 0.05}
            for second in range(0, 31)
        ]
        measurements[18] = {"timecode": 18.0, "brightness": 220.0, "histogram": 0.92, "edgeDensity": 0.42}

        candidates = _fast_preface_boundary_candidates(measurements, 90.0)

        self.assertTrue(candidates)
        self.assertEqual(candidates[0]["timecode"]["start"], 18.0)
        self.assertEqual(candidates[0]["source"], "fast-opening-local-scan")
        self.assertNotIn("AI前贴", candidates[0])


if __name__ == "__main__":
    unittest.main()
