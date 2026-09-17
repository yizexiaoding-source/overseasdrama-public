import unittest

from processor.material_routing import normalize_narration_ranges


class NarrationClippingTests(unittest.TestCase):
    def test_ranges_are_rounded_to_whole_seconds_and_merged(self):
        rows = [
            {"start": 1.2, "end": 4.6, "verification": "verified", "text": "a"},
            {"start": 4.7, "end": 7.1, "verification": "verified", "text": "b"},
        ]
        self.assertEqual(normalize_narration_ranges(rows, duration_seconds=20), [(1, 8)])

    def test_unverified_or_empty_segments_are_excluded(self):
        rows = [
            {"start": 0, "end": 3, "verification": "unverified", "text": "x"},
            {"start": 5.1, "end": 6.2, "verification": "verified", "text": ""},
            {"start": 8.2, "end": 10.4, "verification": "verified", "text": "ok"},
        ]
        self.assertEqual(normalize_narration_ranges(rows, duration_seconds=20), [(8, 11)])


if __name__ == "__main__":
    unittest.main()
