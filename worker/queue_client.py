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


PROCESSING_QUEUE = f"{QUEUE_NAME}:processing"


def dequeue_job(r: redis.Redis, timeout: int = 5) -> dict | None:
    """LMOVE(brpoplpush)로 잡을 processing 리스트로 원자적 이동.

    워커가 처리 중 크래시해도 잡이 processing에 남아 재처리할 수 있다.
    완료 후 ack_job()으로 processing에서 제거한다.
    """
    raw = r.blmove(QUEUE_NAME, PROCESSING_QUEUE, timeout=timeout, src="RIGHT", dest="LEFT")
    if raw is None:
        return None
    return json.loads(raw)


def ack_job(r: redis.Redis, payload: dict) -> None:
    """처리 완료된 잡을 processing 리스트에서 제거."""
    raw = json.dumps(payload)
    r.lrem(PROCESSING_QUEUE, 1, raw)
