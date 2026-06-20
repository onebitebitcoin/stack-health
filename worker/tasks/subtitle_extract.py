"""Worker task: extract subtitles from a video/audio stored in R2.

Runs asynchronously in the worker process. Downloads temp files from R2,
transcribes with Whisper, stores SRT + plain_text in the job Redis record,
then deletes the R2 temp keys.
"""

from __future__ import annotations

import json
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
    SUBTITLE_AVG_LOGPROB_THRESHOLD,
    SUBTITLE_AVG_NO_SPEECH_GLOBAL_THRESHOLD,
    SUBTITLE_COMPRESSION_RATIO_MAX,
    SUBTITLE_MIN_CHARS_PER_SEC,
    SUBTITLE_NO_SPEECH_THRESHOLD,
    _detect_silence_ranges,
    _extract_audio,
    _filter_srt_by_silence,
    _has_audio_stream,
    _plain_text_from_srt,
    _probe_duration,
    _segments_to_srt,
    _transcribe_verbose_json,
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

        metrics: dict = {"model": DEFAULT_TRANSCRIPTION_MODEL, "language": language}

        if audio_r2_key:
            suffix = ".mp4" if audio_r2_key.endswith(".mp4") else ".webm"
            tmp_audio = _make_tmp(suffix)
            resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=audio_r2_key)
            with open(tmp_audio, "wb") as f:
                f.write(resp["Body"].read())
            source_audio = tmp_audio
            metrics["source"] = "user_audio"
        else:
            if not _has_audio_stream(tmp_video):
                logger.info("subtitle-extract job=%s: no audio stream", job.get("job_id"))
                return {"srt": "", "plain_text": "", "metrics": json.dumps({"skipped": "no audio stream"})}
            tmp_extracted = _make_tmp(".m4a")
            _extract_audio(tmp_video, tmp_extracted)
            source_audio = tmp_extracted
            metrics["source"] = "video_audio"

        duration = _probe_duration(source_audio)
        metrics["duration_sec"] = round(duration, 3)

        # Guard against silence-driven hallucination: an almost-silent recording
        # makes Whisper emit stock YouTube-outro phrases ("구독, 좋아요, 댓글
        # 부탁드립니다"). generate_subtitle_for_video already skips these, but
        # run_subtitle_extract (the live upload path) did not — which is how
        # video 227 got a hallucinated burned-in subtitle.
        silence_ranges = _detect_silence_ranges(source_audio, duration)
        metrics["silence_ranges_detected"] = len(silence_ranges)
        if silence_ranges and duration > 0:
            total_silence = sum(end - start for start, end in silence_ranges)
            silence_ratio = total_silence / duration
            metrics["silence_ratio"] = round(silence_ratio, 3)
            if silence_ratio >= 0.90:
                logger.info(
                    "subtitle-extract job=%s: audio %.0f%% silent — skipping to avoid hallucination",
                    job.get("job_id"), silence_ratio * 100,
                )
                metrics["skipped"] = "mostly silent"
                return {"srt": "", "plain_text": "", "metrics": json.dumps(metrics, ensure_ascii=False)}

        # 'auto' → pass language=None to Whisper so it auto-detects
        whisper_language: str | None = None if language == "auto" else language
        verbose_data, transcribe_seconds = _transcribe_verbose_json(
            source_audio,
            api_key=api_key,
            model=DEFAULT_TRANSCRIPTION_MODEL,
            language=whisper_language,
            prompt=DEFAULT_TRANSCRIPTION_PROMPT,
            temperature=DEFAULT_TRANSCRIPTION_TEMPERATURE,
        )
        metrics["transcribe_seconds"] = round(transcribe_seconds, 3)
        segments = verbose_data.get("segments", [])
        metrics["segments_total"] = len(segments)
        metrics["avg_no_speech_prob"] = round(
            sum(seg.get("no_speech_prob", 0.0) for seg in segments) / len(segments), 3
        ) if segments else 0.0
        metrics["segments_detail"] = [
            {
                "text": seg.get("text", "").strip(),
                "no_speech_prob": round(seg.get("no_speech_prob", 0.0), 3),
                "avg_logprob": round(seg.get("avg_logprob", 0.0), 3),
                "compression_ratio": round(seg.get("compression_ratio", 0.0), 3),
                "start": round(float(seg.get("start", 0)), 2),
                "end": round(float(seg.get("end", 0)), 2),
            }
            for seg in segments
        ]
        detected_language: str | None = verbose_data.get("language")
        if detected_language:
            metrics["detected_language"] = detected_language

        srt = _segments_to_srt(
            segments,
            SUBTITLE_NO_SPEECH_THRESHOLD,
            SUBTITLE_AVG_LOGPROB_THRESHOLD,
            SUBTITLE_COMPRESSION_RATIO_MAX,
            SUBTITLE_AVG_NO_SPEECH_GLOBAL_THRESHOLD,
            SUBTITLE_MIN_CHARS_PER_SEC,
            language=language,
            detected_language=detected_language,
        )
        # Same per-cue silence filter as generate_subtitle_for_video: drop cues
        # whose midpoint lands in a detected pause (stock-phrase hallucination).
        if srt.strip() and silence_ranges:
            srt, silence_dropped = _filter_srt_by_silence(srt, silence_ranges)
            metrics["segments_dropped_in_silence"] = silence_dropped
        kept_count = len([s for s in srt.strip().split("\n\n") if s.strip()]) if srt.strip() else 0
        metrics["segments_kept"] = kept_count
        metrics["segments_filtered"] = len(segments) - kept_count

        plain_text = _plain_text_from_srt(srt)
        logger.info("subtitle-extract job=%s done, %d chars, %d/%d segs kept",
                    job.get("job_id"), len(srt), kept_count, len(segments))
        return {"srt": srt, "plain_text": plain_text, "metrics": json.dumps(metrics, ensure_ascii=False)}

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
