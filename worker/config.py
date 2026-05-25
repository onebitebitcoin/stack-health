import os

from dotenv import load_dotenv

load_dotenv()

REDIS_URL: str = os.environ["REDIS_URL"]
R2_ACCOUNT_ID: str = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID: str = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY: str = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME: str = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL: str = os.environ["R2_PUBLIC_URL"].rstrip("/")
LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
QUEUE_NAME: str = "queue:merge-jobs"
JOB_TTL: int = 86400  # 24시간
