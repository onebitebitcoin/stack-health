import logging
import os
import subprocess
import tempfile
import uuid

import boto3
from botocore.config import Config

from config import (
    R2_ACCESS_KEY_ID,
    R2_ACCOUNT_ID,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
    R2_SECRET_ACCESS_KEY,
)

logger = logging.getLogger(__name__)


def _get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def run_merge(job: dict) -> dict:
    """R2에서 video와 audio를 다운로드하고 ffmpeg으로 병합 후 R2에 업로드한다."""
    video_r2_key: str = job["video_r2_key"]
    audio_r2_key: str = job["audio_r2_key"]
    duration: float = float(job["audio_duration_sec"])
    audio_content_type: str = job.get("audio_content_type", "audio/webm")

    audio_suffix = ".mp4" if audio_content_type == "audio/mp4" else ".webm"

    tmp_video = tempfile.mktemp(suffix=".mp4")
    tmp_audio = tempfile.mktemp(suffix=audio_suffix)
    tmp_output = tempfile.mktemp(suffix=".mp4")

    try:
        client = _get_r2_client()

        logger.info("Downloading video: %s", video_r2_key)
        response = client.get_object(Bucket=R2_BUCKET_NAME, Key=video_r2_key)
        with open(tmp_video, "wb") as f:
            f.write(response["Body"].read())

        logger.info("Downloading audio: %s", audio_r2_key)
        response = client.get_object(Bucket=R2_BUCKET_NAME, Key=audio_r2_key)
        with open(tmp_audio, "wb") as f:
            f.write(response["Body"].read())

        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1",
            "-i", tmp_video,
            "-i", tmp_audio,
            "-t", str(duration),
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "256k",
            "-ar", "48000",
            "-ac", "2",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-movflags", "+faststart",
            tmp_output,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr.decode()}")

        merged_key = f"videos/merged-{uuid.uuid4()}.mp4"
        logger.info("Uploading merged file: %s", merged_key)
        with open(tmp_output, "rb") as f:
            client.put_object(
                Bucket=R2_BUCKET_NAME,
                Key=merged_key,
                Body=f,
                ContentType="video/mp4",
            )

        cdn_url = f"{R2_PUBLIC_URL}/{merged_key}"
        return {"output_r2_key": merged_key, "cdn_url": cdn_url}

    finally:
        for tmp in [tmp_video, tmp_audio, tmp_output]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
