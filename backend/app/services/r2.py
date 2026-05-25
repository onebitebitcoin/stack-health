import logging
import uuid

import boto3
from botocore.config import Config

from app.config import settings

logger = logging.getLogger(__name__)

PRESIGNED_URL_EXPIRES = 900  # 15 minutes
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_CONTENT_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-m4v",
    "video/3gpp",
    "video/3gpp2",
    "video/mpeg",
    "video/x-matroska",
}


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


def ensure_r2_cors() -> None:
    """Set CORS policy on the R2 bucket to allow direct browser uploads (presigned PUT).

    Called once on app startup. Browsers (especially Android Chrome) send an OPTIONS
    preflight before the PUT; without this policy R2 returns 403 and the browser raises
    ERR_NETWORK before any HTTP response is visible.
    """
    try:
        client = get_r2_client()
        client.put_bucket_cors(
            Bucket=settings.r2_bucket_name,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedOrigins": ["*"],
                        "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
                        "AllowedHeaders": ["*"],
                        "ExposeHeaders": ["ETag"],
                        "MaxAgeSeconds": 3600,
                    }
                ]
            },
        )
        logger.info("R2 CORS policy applied to bucket '%s'", settings.r2_bucket_name)
    except Exception as exc:
        logger.warning("R2 CORS setup skipped: %s", exc)


def upload_fileobj(fileobj: object, content_type: str, filename: str) -> tuple[str, str]:
    """Upload a file-like object directly to R2 (server-side upload, no CORS).

    Returns (r2_key, cdn_url).
    """
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    r2_key = f"videos/{uuid.uuid4()}.{ext}"

    client = get_r2_client()
    client.upload_fileobj(
        fileobj,
        settings.r2_bucket_name,
        r2_key,
        ExtraArgs={"ContentType": content_type},
    )
    return r2_key, get_cdn_url(r2_key)


def get_cdn_url(r2_key: str) -> str:
    return f"{settings.r2_public_url.rstrip('/')}/{r2_key}"


def delete_object(r2_key: str) -> None:
    client = get_r2_client()
    client.delete_object(Bucket=settings.r2_bucket_name, Key=r2_key)
