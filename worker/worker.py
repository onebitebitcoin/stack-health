import logging
import os
import signal
import time
import uuid

from config import LOG_LEVEL, MAX_FFMPEG_CONCURRENT, QUEUE_NAME
from queue_client import ack_job, dequeue_job, get_redis_client, set_job_status
from notify import notify_video_failure, notify_video_success, notify_worker_error
from tasks.full_pipeline import run_full_pipeline
from tasks.merge import run_merge
from tasks.image_merge import run_image_merge

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 만료 기반 리스 세마포어: 워커가 SIGKILL/OOM으로 죽어도 슬롯이 TTL 후 자동 회수되어
# active_count가 영구 누수(→ 워커 영구 블록)되는 문제를 방지한다.
FFMPEG_SLOTS_KEY = "ffmpeg:slots"
FFMPEG_LEASE_TTL = int(os.environ.get("FFMPEG_LEASE_TTL", "1800"))  # 잡 1건 최대 처리시간보다 충분히 큰 값(초)

# 슬롯 점유를 원자적으로 처리: 만료된 리스 정리 → 여유 있으면 토큰 추가.
_ACQUIRE_SLOT_LUA = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
  return 1
end
return 0
"""

running = True


def handle_signal(sig: int, frame: object) -> None:
    global running
    logger.info("Shutdown signal received, finishing current job...")
    running = False


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def _acquire_ffmpeg_slot(r) -> str:
    """ffmpeg 동시 실행 슬롯을 점유하고 리스 토큰을 반환. 슬롯이 날 때까지 블로킹."""
    token = str(uuid.uuid4())
    while True:
        now = time.time()
        got = r.eval(
            _ACQUIRE_SLOT_LUA, 1, FFMPEG_SLOTS_KEY,
            now, now + FFMPEG_LEASE_TTL, MAX_FFMPEG_CONCURRENT, token,
        )
        if got:
            return token
        logger.debug("ffmpeg 슬롯 대기 (active=%s/%d)", r.zcard(FFMPEG_SLOTS_KEY), MAX_FFMPEG_CONCURRENT)
        time.sleep(1)


def _release_ffmpeg_slot(r, token: str) -> None:
    if token:
        r.zrem(FFMPEG_SLOTS_KEY, token)


def _process_job(r, job: dict) -> None:
    job_id = job["job_id"]
    job_type = job.get("job_type", "merge")

    logger.info("Processing job %s (type=%s, attempt=1)", job_id, job_type)
    set_job_status(r, job_id, status="processing")

    slot_token = _acquire_ffmpeg_slot(r)
    current_step: list[str | None] = [None]
    try:
        if job_type == "full-pipeline":
            def _step_cb(step: str) -> None:
                current_step[0] = step
                set_job_status(r, job_id, pipeline_step=step)
            result = run_full_pipeline(job, status_callback=_step_cb)
        elif job_type == "proof-merge":
            result = run_image_merge(job)
        else:
            result = run_merge(job)

        set_job_status(r, job_id, status="completed", **result)
        logger.info("Job %s completed", job_id)
        if job_type == "full-pipeline":
            notify_video_success(job, result)
    except Exception as e:
        logger.exception("Job %s failed: %s", job_id, e)
        set_job_status(r, job_id, status="failed", error=str(e))
        if job_type == "full-pipeline":
            notify_video_failure(job, e, 1, 0, current_step[0])
    finally:
        _release_ffmpeg_slot(r, slot_token)
        ack_job(r, job)


def main() -> None:
    r = get_redis_client()
    logger.info("Worker started. Waiting for jobs on %s", QUEUE_NAME)
    try:
        while running:
            job = dequeue_job(r, timeout=5)
            if not job:
                continue
            _process_job(r, job)
    except Exception as e:
        logger.exception("Worker 메인 루프 예외: %s", e)
        notify_worker_error(e, "Worker 메인 루프 비정상 종료")
        raise
    logger.info("Worker stopped.")


if __name__ == "__main__":
    main()
