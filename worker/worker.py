import logging
import signal

from config import LOG_LEVEL, QUEUE_NAME
from queue_client import dequeue_job, get_redis_client, set_job_status
from tasks.merge import run_merge

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

running = True


def handle_signal(sig: int, frame: object) -> None:
    global running
    logger.info("Shutdown signal received, finishing current job...")
    running = False


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def main() -> None:
    redis = get_redis_client()
    logger.info("Worker started. Waiting for jobs on %s", QUEUE_NAME)
    while running:
        job = dequeue_job(redis, timeout=5)
        if not job:
            continue
        job_id = job["job_id"]
        logger.info("Processing job %s for user %s", job_id, job.get("user_id"))
        set_job_status(redis, job_id, status="processing")
        try:
            result = run_merge(job)
            set_job_status(redis, job_id, status="completed", **result)
            logger.info("Job %s completed: %s", job_id, result["cdn_url"])
        except Exception as e:
            logger.exception("Job %s failed: %s", job_id, e)
            set_job_status(redis, job_id, status="failed", error=str(e))
    logger.info("Worker stopped.")


if __name__ == "__main__":
    main()
