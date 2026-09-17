import unittest

from processor.preface_boundary import resolve_preface_boundary


class PrefaceBoundaryTests(unittest.TestCase):
    def test_uses_segment_handoff_when_hook_and_body_transition_are_missing(self):
        analysis = {
            "content": {
                "segments": [
                    {
                        "label": "搞笑引入",
                        "start": 0,
                        "end": 9,
                        "verification": "verified",
                    },
                    {
                        "label": "剧情展开",
                        "start": 9.067,
                        "end": 15,
                        "verification": "verified",
                    },
                ]
            },
            "creative": {
                "hooks": [],
                "transitions": [
                    {
                        "label": "场景转换",
                        "start": 9.067,
                        "end": 9.067,
                        "verification": "verified",
                    }
                ],
            },
        }

        decision = resolve_preface_boundary(analysis, 153.669955)

        self.assertTrue(decision.valid)
        self.assertEqual(decision.start, 0)
        self.assertEqual(decision.end, 9.067)
        self.assertIn(decision.source, {"verified_transition", "segment_handoff"})

    def test_rejects_an_unverified_transition(self):
        decision = resolve_preface_boundary(
            {
                "creative": {
                    "transitions": [
                        {"start": 9.067, "verification": "unverified"}
                    ]
                }
            },
            153.669955,
        )

        self.assertFalse(decision.valid)


if __name__ == "__main__":
    unittest.main()
