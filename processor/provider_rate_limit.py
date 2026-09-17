from __future__ import annotations

import contextlib
import os
import random
import threading
import time
from collections.abc import Callable, Iterator, Mapping


RETRYABLE_PROVIDER_STATUSES = frozenset({408, 429, 500, 502, 503, 504})


def is_retryable_provider_status(status: int) -> bool:
    return status in RETRYABLE_PROVIDER_STATUSES


def provider_error_label(status: int | None) -> str:
    if status == 429:
        return "模型服务限流"
    if status in {408, 500, 502, 503, 504}:
        return "模型服务暂时不可用"
    return "模型请求异常"


def provider_exception_label(error: Exception) -> str:
    message = str(error).lower()
    if "429" in message or "rate limit" in message or "too many requests" in message:
        return "模型服务限流"
    if any(marker in message for marker in ("http 500", "http 502", "http 503", "http 504", "timed out", "timeout", "temporarily")):
        return "模型服务暂时不可用"
    if any(marker in message for marker in ("returned no", "empty stream", "no content")):
        return "模型返回为空"
    return "模型分段重试"


def retry_delay(
    status: int | None,
    headers: Mapping[str, str] | None,
    attempt: int,
    *,
    jitter: Callable[[], float] = random.random,
) -> float:
    if status == 429 and headers:
        raw = headers.get("Retry-After") or headers.get("retry-after")
        if raw:
            try:
                return max(0.0, min(300.0, float(raw)))
            except ValueError:
                pass
    return min(60.0, float(2 ** max(0, attempt))) + max(0.0, min(1.0, float(jitter())))


class ProviderRateLimiter:
    """Process-wide provider gate with a minimum gap between request starts."""

    def __init__(self, concurrency: int = 1, min_interval: float = 2.0):
        self._semaphore = threading.BoundedSemaphore(max(1, concurrency))
        self._clock_lock = threading.Lock()
        self._next_start = 0.0
        self._min_interval = max(0.0, min_interval)

    @contextlib.contextmanager
    def slot(self) -> Iterator[None]:
        self._semaphore.acquire()
        try:
            with self._clock_lock:
                delay = self._next_start - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                self._next_start = time.monotonic() + self._min_interval
            yield
        finally:
            self._semaphore.release()


_limiter: ProviderRateLimiter | None = None
_limiter_lock = threading.Lock()


def get_provider_limiter() -> ProviderRateLimiter:
    global _limiter
    if _limiter is None:
        with _limiter_lock:
            if _limiter is None:
                concurrency = max(1, int(os.getenv("LUMINA_SEMANTIC_CONCURRENCY", "1")))
                min_interval = max(0.0, float(os.getenv("LUMINA_SEMANTIC_MIN_INTERVAL", "2")))
                _limiter = ProviderRateLimiter(concurrency, min_interval)
    return _limiter
