import os
import sys

from dotenv import load_dotenv

load_dotenv()

REDIS_URL: str = os.environ["REDIS_URL"]
DATABASE_URL: str = os.environ["DATABASE_URL"]
R2_ACCOUNT_ID: str = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID: str = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY: str = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME: str = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL: str = os.environ["R2_PUBLIC_URL"].rstrip("/")
LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
QUEUE_NAME: str = "queue:merge-jobs"
JOB_TTL: int = 86400  # 24시간
MAX_FFMPEG_CONCURRENT: int = int(os.environ.get("MAX_FFMPEG_CONCURRENT", "2"))
MAX_JOB_RETRIES: int = int(os.environ.get("MAX_JOB_RETRIES", "2"))

_backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend"))
if os.path.isdir(_backend_path) and _backend_path not in sys.path:
    sys.path.insert(0, _backend_path)
