import logging

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


def check_rate_limit(
    request: Request,
    key_suffix: str,
    max_calls: int,
    period_seconds: int,
) -> None:
    """IP-based rate limit using Redis. Silent no-op if Redis is unavailable."""
    try:
        from app.services.job_queue import get_redis_client

        r = get_redis_client()
        ip = request.client.host if request.client else "unknown"
        key = f"rl:{key_suffix}:{ip}"
        current = r.incr(key)
        if current == 1:
            r.expire(key, period_seconds)
        if current > max_calls:
            raise HTTPException(
                status_code=429,
                detail="요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
            )
    except HTTPException:
        raise
    except Exception:
        logger.debug("Rate limit check skipped (Redis unavailable): %s", key_suffix)
