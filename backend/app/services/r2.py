import uuid

import boto3
from botocore.config import Config

from app.config import settings

PRESIGNED_URL_EXPIRES = 900  # 15 minutes
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB
ALLOWED_CONTENT_TYPES = {"video/mp4", "video/quicktime", "video/webm"}


def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def generate_presigned_url(content_type: str, filename: str) -> tuple[str, str]:
    """Generate a presigned PUT URL for R2 upload.

    Returns (upload_url, r2_key).
    """
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    r2_key = f"videos/{uuid.uuid4()}.{ext}"

    client = get_r2_client()
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": r2_key,
            "ContentType": content_type,
        },
        ExpiresIn=PRESIGNED_URL_EXPIRES,
    )
    return upload_url, r2_key


def get_cdn_url(r2_key: str) -> str:
    return f"{settings.r2_public_url.rstrip('/')}/{r2_key}"
