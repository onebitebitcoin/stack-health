import json
import uuid
from datetime import datetime, timezone
from typing import Any

import redis

from config import JOB_TTL, QUEUE_NAME, REDIS_URL


def get_redis_client() -> redis.Redis:
    return redis.Redis.from_url(REDIS_URL, decode_responses=True)


def set_job_status(r: redis.Redis, job_id: str, **fields: Any) -> None:
    key = f"job:{job_id}"
    r.hset(key, mapping={k: str(v) for k, v in fields.items()})
    r.expire(key, JOB_TTL)


def get_job_status(r: redis.Redis, job_id: str) -> dict | None:
    key = f"job:{job_id}"
    data = r.hgetall(key)
    return data if data else None


def enqueue_job(r: redis.Redis, payload: dict) -> str:
    job_id = str(uuid.uuid4())
    payload["job_id"] = job_id
    payload.setdefault("created_at", datetime.now(timezone.utc).isoformat())

    set_job_status(
        r,
        job_id,
        status="pending",
        user_id=payload.get("user_id", ""),
        video_r2_key=payload.get("video_r2_key", ""),
        audio_r2_key=payload.get("audio_r2_key", ""),
        created_at=payload["created_at"],
    )
    r.lpush(QUEUE_NAME, json.dumps(payload))
    return job_id


def dequeue_job(r: redis.Redis, timeout: int = 5) -> dict | None:
    result = r.brpop(QUEUE_NAME, timeout=timeout)
    if result is None:
        return None
    _, raw = result
    return json.loads(raw)
