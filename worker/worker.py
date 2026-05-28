import json
import logging
import signal
import time

from config import LOG_LEVEL, MAX_FFMPEG_CONCURRENT, MAX_JOB_RETRIES, QUEUE_NAME
from queue_client import dequeue_job, get_redis_client, set_job_status
from notify import notify_video_failure, notify_video_success
from tasks.full_pipeline import run_full_pipeline
from tasks.merge import run_merge
from tasks.image_merge import run_image_merge

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

FFMPEG_SEMAPHORE_KEY = "ffmpeg:active_count"
running = True


def handle_signal(sig: int, frame: object) -> None:
    global running
    logger.info("Shutdown signal received, finishing current job...")
    running = False


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def _acquire_ffmpeg_slot(r) -> None:
    """Redis INCR 기반 세마포어: 슬롯이 날 때까지 블로킹."""
    while True:
        count = r.incr(FFMPEG_SEMAPHORE_KEY)
        if count <= MAX_FFMPEG_CONCURRENT:
            return
        r.decr(FFMPEG_SEMAPHORE_KEY)
        logger.debug("ffmpeg 슬롯 대기 (active=%d/%d)", count - 1, MAX_FFMPEG_CONCURRENT)
        time.sleep(1)


def _release_ffmpeg_slot(r) -> None:
    r.decr(FFMPEG_SEMAPHORE_KEY)


def _process_job(r, job: dict) -> None:
    job_id = job["job_id"]
    job_type = job.get("job_type", "merge")
    retry_count = int(job.get("retry_count", 0))

    logger.info("Processing job %s (type=%s, attempt=%d)", job_id, job_type, retry_count + 1)
    set_job_status(r, job_id, status="processing")

    _acquire_ffmpeg_slot(r)
    try:
        if job_type == "full-pipeline":
            def _step_cb(step: str) -> None:
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
        logger.exception("Job %s failed (attempt %d): %s", job_id, retry_count + 1, e)
        if retry_count < MAX_JOB_RETRIES:
            job["retry_count"] = retry_count + 1
            r.rpush(QUEUE_NAME, json.dumps(job))  # 큐 tail에 넣어 fresh job 기아 방지
            set_job_status(r, job_id, status="retrying", retry_count=str(job["retry_count"]))
            logger.info("Job %s 재큐잉 (retry %d/%d)", job_id, job["retry_count"], MAX_JOB_RETRIES)
            if job_type == "full-pipeline":
                notify_video_failure(job, e, retry_count + 1, MAX_JOB_RETRIES)
        else:
            set_job_status(r, job_id, status="failed", error=str(e))
            if job_type == "full-pipeline":
                notify_video_failure(job, e, retry_count + 1, MAX_JOB_RETRIES)
    finally:
        _release_ffmpeg_slot(r)


def main() -> None:
    r = get_redis_client()
    logger.info("Worker started. Waiting for jobs on %s", QUEUE_NAME)
    while running:
        job = dequeue_job(r, timeout=5)
        if not job:
            continue
        _process_job(r, job)
    logger.info("Worker stopped.")


if __name__ == "__main__":
    main()
