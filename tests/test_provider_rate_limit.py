import unittest

from processor.provider_rate_limit import (
    is_retryable_provider_status,
    provider_exception_label,
    provider_error_label,
    retry_delay,
)


class ProviderRateLimitTests(unittest.TestCase):
    def test_retry_after_header_wins(self):
        self.assertEqual(retry_delay(429, {"Retry-After": "7"}, 0, jitter=lambda: 0), 7)

    def test_exponential_delay_is_bounded_and_jittered(self):
        self.assertEqual(retry_delay(503, {}, 2, jitter=lambda: 0.5), 4.5)
        self.assertLessEqual(retry_delay(503, {}, 20, jitter=lambda: 1), 61)

    def test_only_supported_temporary_statuses_retry(self):
        for status in (408, 429, 500, 502, 503, 504):
            self.assertTrue(is_retryable_provider_status(status))
        for status in (400, 401, 403, 404, 422):
            self.assertFalse(is_retryable_provider_status(status))

    def test_user_facing_label_matches_the_real_failure(self):
        self.assertEqual(provider_error_label(429), "模型服务限流")
        self.assertEqual(provider_error_label(503), "模型服务暂时不可用")
        self.assertEqual(provider_error_label(None), "模型请求异常")

    def test_exception_copy_does_not_call_every_failure_rate_limited(self):
        self.assertEqual(provider_exception_label(RuntimeError("Semantic provider HTTP 429")), "模型服务限流")
        self.assertEqual(provider_exception_label(RuntimeError("streaming API returned no content")), "模型返回为空")
        self.assertEqual(provider_exception_label(RuntimeError("HTTP 503")), "模型服务暂时不可用")
        self.assertEqual(provider_exception_label(RuntimeError("invalid json")), "模型分段重试")


if __name__ == "__main__":
    unittest.main()
