import logging
import os
import re
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
    """ffprobe로 미디어 파일의 길이(초)를 반환한다.

    video stream → format → audio stream 순서로 시도한다.
    """
    probe_cmds = [
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        ["ffprobe", "-v", "error",
         "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
    ]
    for cmd in probe_cmds:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            raw = result.stdout.strip()
            if raw and raw != "N/A":
                try:
                    val = float(raw)
                    if val > 0:
                        return val
                except ValueError:
                    continue
    raise RuntimeError(f"ffprobe: cannot determine duration of {path}")


def _probe_audio_duration(path: str) -> float:
    """오디오 파일의 실제 길이(초). 컨테이너 메타 → 디코드 패스 순으로 시도, 실패하면 0.0.

    MediaRecorder webm은 컨테이너에 duration이 없어 메타 probe가 N/A를 반환하므로
    디코드 패스(ffmpeg -f null) fallback이 필요하다.
    """
    for extra in (
        ["-show_entries", "format=duration"],
        ["-select_streams", "a:0", "-show_entries", "stream=duration"],
    ):
        result = subprocess.run(
            ["ffprobe", "-v", "error"] + extra + ["-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            raw = result.stdout.strip()
            if raw and raw != "N/A":
                try:
                    val = float(raw)
                    if val > 0:
                        return val
                except ValueError:
                    pass
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", path, "-f", "null", "-"],
            capture_output=True, text=True, timeout=60,
        )
        matches = re.findall(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
        if matches:
            h, m, s = matches[-1]
            total = int(h) * 3600 + int(m) * 60 + float(s)
            if total > 0:
                return total
    except Exception:
        pass
    return 0.0


def run_merge(job: dict) -> dict:
    """R2에서 video와 audio를 다운로드하고 ffmpeg으로 병합 후 R2에 업로드한다."""
    video_r2_key: str = job["video_r2_key"]
    audio_r2_key: str = job["audio_r2_key"]
    client_audio_duration: float = float(job["audio_duration_sec"])
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
        # 실제 오디오를 probe하고, 실패 시에만 클라이언트 값으로 fallback.
        probed_audio = _probe_audio_duration(tmp_audio)
        audio_duration = probed_audio if probed_audio > 0 else client_audio_duration
        output_duration = max(video_duration, audio_duration)
        logger.info(
            "video=%.2fs audio=%.2fs(probed=%.2f client=%.2f) output=%.2fs",
            video_duration, audio_duration, probed_audio, client_audio_duration, output_duration,
        )

        if video_duration >= audio_duration:
            # video가 더 길거나 같음: audio를 루프, video는 copy
            cmd = [
                "ffmpeg", "-y",
                "-i", tmp_video,
                "-stream_loop", "-1",
                "-i", tmp_audio,
                "-t", str(video_duration),
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
        else:
            # audio가 더 길음: video를 루프, audio는 그대로
            cmd = [
                "ffmpeg", "-y",
                "-stream_loop", "-1",
                "-i", tmp_video,
                "-i", tmp_audio,
                "-t", str(audio_duration),
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
                CacheControl="public, max-age=31536000, immutable",
            )

        cdn_url = f"{R2_PUBLIC_URL}/{merged_key}"
        return {"output_r2_key": merged_key, "cdn_url": cdn_url}

    finally:
        for tmp in [tmp_video, tmp_audio, tmp_output]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
