"""기존 R2 오브젝트(thumbnails/, challenges/)에 CacheControl 메타데이터를 일괄 적용한다.

Usage:
    cd worker && python -m tasks.backfill_cache_control
"""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import boto3
from botocore.config import Config
from config import R2_ACCESS_KEY_ID, R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_SECRET_ACCESS_KEY

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

CACHE_VALUE = "public, max-age=31536000, immutable"
PREFIXES = ["thumbnails/", "challenges/"]


def run_backfill() -> None:
    r2 = boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    updated = skipped = failed = 0
    for prefix in PREFIXES:
        paginator = r2.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=R2_BUCKET_NAME, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                try:
                    head = r2.head_object(Bucket=R2_BUCKET_NAME, Key=key)
                    if head.get("CacheControl") == CACHE_VALUE:
                        skipped += 1
                        continue
                    ct = head.get("ContentType", "image/jpeg")
                    r2.copy_object(
                        Bucket=R2_BUCKET_NAME,
                        CopySource={"Bucket": R2_BUCKET_NAME, "Key": key},
                        Key=key,
                        MetadataDirective="REPLACE",
                        ContentType=ct,
                        CacheControl=CACHE_VALUE,
                    )
                    logger.info("updated: %s", key)
                    updated += 1
                except Exception as e:
                    logger.warning("failed: %s — %s", key, e)
                    failed += 1

    logger.info("완료 — 업데이트: %d, 스킵: %d, 실패: %d", updated, skipped, failed)


if __name__ == "__main__":
    run_backfill()
