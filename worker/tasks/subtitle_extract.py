"""Worker task: extract subtitles from a video/audio stored in R2.

Runs asynchronously in the worker process. Downloads temp files from R2,
transcribes with Whisper, stores SRT + plain_text in the job Redis record,
then deletes the R2 temp keys.
"""

from __future__ import annotations

import logging
import os
import tempfile

import boto3
from botocore.config import Config

from config import (
    R2_ACCESS_KEY_ID,
    R2_ACCOUNT_ID,
    R2_BUCKET_NAME,
    R2_SECRET_ACCESS_KEY,
)
from tasks.subtitle import (
    DEFAULT_TRANSCRIPTION_LANGUAGE,
    DEFAULT_TRANSCRIPTION_MODEL,
    DEFAULT_TRANSCRIPTION_PROMPT,
    DEFAULT_TRANSCRIPTION_TEMPERATURE,
    _extract_audio,
    _plain_text_from_srt,
    _probe_duration,
    _transcribe_srt,
)

logger = logging.getLogger(__name__)

_SUBTITLE_TMP_PREFIX = "subtitle-tmp/"


def _get_r2():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _make_tmp(suffix: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        return f.name


def run_subtitle_extract(job: dict) -> dict:
    """Download video/audio from R2, transcribe, return {srt, plain_text}."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not configured")

    r2 = _get_r2()
    video_r2_key: str = job["video_r2_key"]
    audio_r2_key: str | None = job.get("audio_r2_key")
    language: str = job.get("language") or DEFAULT_TRANSCRIPTION_LANGUAGE or "ko"

    tmp_video = tmp_audio = tmp_extracted = None
    try:
        tmp_video = _make_tmp(".mp4")
        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=video_r2_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        if audio_r2_key:
            suffix = ".mp4" if audio_r2_key.endswith(".mp4") else ".webm"
            tmp_audio = _make_tmp(suffix)
            resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=audio_r2_key)
            with open(tmp_audio, "wb") as f:
                f.write(resp["Body"].read())
            source_audio = tmp_audio
        else:
            tmp_extracted = _make_tmp(".m4a")
            _extract_audio(tmp_video, tmp_extracted)
            source_audio = tmp_extracted

        _probe_duration(source_audio)

        srt, _ = _transcribe_srt(
            source_audio,
            api_key=api_key,
            model=DEFAULT_TRANSCRIPTION_MODEL,
            language=language,
            prompt=DEFAULT_TRANSCRIPTION_PROMPT,
            temperature=DEFAULT_TRANSCRIPTION_TEMPERATURE,
        )
        plain_text = _plain_text_from_srt(srt)
        logger.info("subtitle-extract job=%s done, %d chars", job.get("job_id"), len(srt))
        return {"srt": srt, "plain_text": plain_text}

    finally:
        for key in (video_r2_key, audio_r2_key):
            if key and key.startswith(_SUBTITLE_TMP_PREFIX):
                try:
                    r2.delete_object(Bucket=R2_BUCKET_NAME, Key=key)
                except Exception:
                    pass
        for tmp in (tmp_video, tmp_audio, tmp_extracted):
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
