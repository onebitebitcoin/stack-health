import sys

import boto3
from botocore.config import Config

from config import (
    R2_ACCESS_KEY_ID,
    R2_ACCOUNT_ID,
    R2_BUCKET_NAME,
    R2_SECRET_ACCESS_KEY,
)
from queue_client import get_redis_client


def check_redis() -> None:
    r = get_redis_client()
    r.ping()
    print("Redis: OK")


def check_r2() -> None:
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    client.list_objects_v2(Bucket=R2_BUCKET_NAME, MaxKeys=1)
    print("R2: OK")


def main() -> None:
    try:
        check_redis()
        check_r2()
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
