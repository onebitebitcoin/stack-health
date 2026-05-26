import json
import logging
import uuid
from datetime import datetime, timezone

import redis

from app.config import settings

logger = logging.getLogger(__name__)

QUEUE_NAME = "queue:merge-jobs"
JOB_KEY_PREFIX = "job:"
JOB_TTL = 86400  # 24시간


def get_redis_client() -> redis.Redis:
    if not settings.redis_url:
        raise RuntimeError("REDIS_URL이 설정되지 않았습니다")
    return redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=3)


def _set_job_status(r: redis.Redis, job_id: str, **fields) -> None:
    key = f"{JOB_KEY_PREFIX}{job_id}"
    r.hset(key, mapping={k: str(v) for k, v in fields.items()})
    r.expire(key, JOB_TTL)


def get_job_status(job_id: str) -> dict | None:
    try:
        r = get_redis_client()
        data = r.hgetall(f"{JOB_KEY_PREFIX}{job_id}")
        return data if data else None
    except Exception:
        return None


def enqueue_merge_job(job_payload: dict) -> str:
    """Redis 큐에 audio merge 잡 등록."""
    job_id = str(uuid.uuid4())
    job_payload["job_id"] = job_id
    job_payload["job_type"] = "merge"
    job_payload["created_at"] = datetime.now(timezone.utc).isoformat()

    r = get_redis_client()
    _set_job_status(r, job_id,
        status="pending",
        job_type="merge",
        user_id=str(job_payload.get("user_id", "")),
        created_at=job_payload["created_at"],
    )
    r.lpush(QUEUE_NAME, json.dumps(job_payload))
    logger.info("Enqueued merge job %s", job_id)
    return job_id


def enqueue_proof_merge_job(video_r2_key: str, proof_r2_key: str) -> str:
    """Redis 큐에 proof merge 잡 등록."""
    job_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    payload = {
        "job_id": job_id,
        "job_type": "proof-merge",
        "video_r2_key": video_r2_key,
        "proof_r2_key": proof_r2_key,
        "created_at": created_at,
    }
    r = get_redis_client()
    _set_job_status(r, job_id, status="pending", job_type="proof-merge", created_at=created_at)
    r.lpush(QUEUE_NAME, json.dumps(payload))
    logger.info("Enqueued proof-merge job %s", job_id)
    return job_id


def enqueue_full_upload_pipeline(
    r2_key: str,
    file_hash: str,
    duration_sec: int,
    caption: str | None,
    tags: list[str],
    challenge_id: int | None,
    workout_start: str | None,
    workout_end: str | None,
    user_id: int,
    audio_r2_key: str | None = None,
    audio_duration_sec: int = 0,
    audio_content_type: str = "audio/webm",
    proof_r2_key: str | None = None,
    proof_cdn_url: str | None = None,
    early_adopter_bonus: bool = False,
) -> str:
    """영상 업로드 전체 파이프라인을 Redis 큐에 등록. job_id 즉시 반환."""
    job_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    payload = {
        "job_id": job_id,
        "job_type": "full-pipeline",
        "created_at": created_at,
        "r2_key": r2_key,
        "file_hash": file_hash,
        "duration_sec": duration_sec,
        "caption": caption,
        "tags": tags,
        "challenge_id": challenge_id,
        "workout_start": workout_start,
        "workout_end": workout_end,
        "user_id": user_id,
        "audio_r2_key": audio_r2_key,
        "audio_duration_sec": audio_duration_sec,
        "audio_content_type": audio_content_type,
        "proof_r2_key": proof_r2_key,
        "proof_cdn_url": proof_cdn_url,
        "early_adopter_bonus": early_adopter_bonus,
    }

    r = get_redis_client()
    _set_job_status(r, job_id,
        status="pending",
        job_type="full-pipeline",
        user_id=str(user_id),
        created_at=created_at,
    )
    r.lpush(QUEUE_NAME, json.dumps(payload))
    logger.info("Enqueued full-pipeline job %s for user %s", job_id, user_id)
    return job_id
