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


def _probe_duration(path: str) -> float:
    """ffprobe로 미디어 파일의 길이(초)를 반환한다."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    raw = result.stdout.strip()
    if result.returncode != 0 or not raw:
        raise RuntimeError(
            f"ffprobe failed (rc={result.returncode}) for {path}: {result.stderr.strip()}"
        )
    try:
        return float(raw)
    except ValueError:
        raise RuntimeError(f"ffprobe returned non-numeric duration: {raw!r}")


def run_merge(job: dict) -> dict:
    """R2에서 video와 audio를 다운로드하고 ffmpeg으로 병합 후 R2에 업로드한다."""
    video_r2_key: str = job["video_r2_key"]
    audio_r2_key: str = job["audio_r2_key"]
    audio_duration: float = float(job["audio_duration_sec"])
    audio_content_type: str = job.get("audio_content_type", "audio/webm")

    audio_suffix = ".mp4" if audio_content_type == "audio/mp4" else ".webm"

    def _make_tmp(suffix: str) -> str:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            return f.name

    tmp_video = _make_tmp(".mp4")
    tmp_audio = _make_tmp(audio_suffix)
    tmp_output = _make_tmp(".mp4")

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

        video_duration = _probe_duration(tmp_video)
        output_duration = max(video_duration, audio_duration)
        logger.info("video=%.2fs audio=%.2fs output=%.2fs", video_duration, audio_duration, output_duration)

        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1",
            "-i", tmp_video,
            "-stream_loop", "-1",
            "-i", tmp_audio,
            "-t", str(output_duration),
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
