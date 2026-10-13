"""
Minimal in-memory rate limiter for auth endpoints (login, forgot-password).

Deliberately simple: a per-key sliding window held in a process-local dict.
No new infra (Redis, etc.) — sufficient for the single-worker uvicorn
deployment this app runs (see provision_server.sh). If the app is ever
scaled to multiple workers/processes, this state stops being shared across
them and the limit effectively multiplies by worker count; move to a
shared store (Redis) at that point instead of reaching for this file.
"""
import time
from fastapi import HTTPException, Request

_attempts: dict[str, list[float]] = {}


def client_ip(request: Request) -> str:
    """Prefer X-Forwarded-For (set by nginx per provision_server.sh) over the
    socket peer, which is just the nginx proxy's own loopback address."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(key: str, max_attempts: int, window_seconds: int) -> None:
    """Raise 429 if `key` has exceeded `max_attempts` within `window_seconds`.
    Otherwise records this attempt. Call once per request, before doing the
    expensive/sensitive work."""
    now = time.monotonic()
    cutoff = now - window_seconds
    hits = [t for t in _attempts.get(key, []) if t > cutoff]
    if len(hits) >= max_attempts:
        retry_after = int(window_seconds - (now - hits[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    hits.append(now)
    _attempts[key] = hits
