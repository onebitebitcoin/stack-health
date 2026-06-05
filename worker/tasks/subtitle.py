"""Best-effort subtitle generation for uploaded videos.

This module intentionally uses only stdlib + system ffmpeg/ffprobe so it fits the
existing worker runtime. OpenAI transcription is optional: if OPENAI_API_KEY is
missing or the API fails, callers receive a failed result and the upload flow can
continue without subtitles.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from config import R2_BUCKET_NAME, R2_PUBLIC_URL

logger = logging.getLogger(__name__)

OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"
DEFAULT_TRANSCRIPTION_MODEL = os.environ.get("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
DEFAULT_TRANSCRIPTION_LANGUAGE = os.environ.get("OPENAI_TRANSCRIPTION_LANGUAGE", "ko")
SUBTITLE_ENABLED = os.environ.get("SUBTITLE_ENABLED", "1").lower() not in {"0", "false", "no", "off"}
SUBTITLE_MAX_DURATION_SEC = float(os.environ.get("SUBTITLE_MAX_DURATION_SEC", "65"))
SUBTITLE_HTTP_TIMEOUT_SEC = int(os.environ.get("SUBTITLE_HTTP_TIMEOUT_SEC", "300"))
SUBTITLE_BURN_IN_FONT_SIZE = int(os.environ.get("SUBTITLE_BURN_IN_FONT_SIZE", "26"))
SUBTITLE_BURN_IN_MARGIN_V = int(os.environ.get("SUBTITLE_BURN_IN_MARGIN_V", "90"))
# ASS alpha is inverse opacity: 00 opaque, FF transparent. 20% transparent = 80% opaque.
SUBTITLE_BURN_IN_BACK_ALPHA_HEX = os.environ.get("SUBTITLE_BURN_IN_BACK_ALPHA_HEX", "33")


@dataclass(frozen=True)
class SubtitleResult:
    status: str
    subtitle_r2_key: str | None = None
    subtitle_url: str | None = None
    subtitle_text: str | None = None
    burned_video_r2_key: str | None = None
    burned_video_url: str | None = None
    error: str | None = None
    metrics: dict[str, Any] | None = None


def _make_tmp(suffix: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        return f.name


def _run_cmd(cmd: list[str], *, timeout: int = 300) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(
            f"command failed exit={result.returncode}: {' '.join(cmd)}\n"
            f"stderr={result.stderr[-1000:]}"
        )
    return result


def _ensure_tool(name: str) -> None:
    if not shutil.which(name):
        raise RuntimeError(f"required binary not found: {name}")


def _probe_duration(path: str) -> float:
    for extra in (
        ["-show_entries", "format=duration"],
        ["-select_streams", "v:0", "-show_entries", "stream=duration"],
        ["-select_streams", "a:0", "-show_entries", "stream=duration"],
    ):
        result = subprocess.run(
            ["ffprobe", "-v", "error"] + extra + ["-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True,
            text=True,
            timeout=30,
        )
        raw = result.stdout.strip() if result.returncode == 0 else ""
        if raw and raw != "N/A":
            try:
                value = float(raw)
                if value > 0:
                    return value
            except ValueError:
                pass
    return 0.0


def _extract_audio(video_path: str, audio_path: str) -> float:
    started = time.perf_counter()
    _run_cmd(
        [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "aac",
            "-b:a", "128k",
            audio_path,
        ],
        timeout=300,
    )
    return time.perf_counter() - started


def _encode_multipart(fields: dict[str, str], file_field: str, file_path: str) -> tuple[bytes, str]:
    boundary = f"----stackhealth-{uuid.uuid4().hex}"
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(),
            b"\r\n",
        ])
    file_name = Path(file_path).name
    parts.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="{file_field}"; filename="{file_name}"\r\n'.encode(),
        b"Content-Type: audio/mp4\r\n\r\n",
        Path(file_path).read_bytes(),
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    return b"".join(parts), boundary


def _transcribe_srt(audio_path: str, *, api_key: str, model: str, language: str | None) -> tuple[str, float]:
    fields = {"model": model, "response_format": "srt"}
    if language:
        fields["language"] = language
    body, boundary = _encode_multipart(fields, "file", audio_path)
    request = urllib.request.Request(
        OPENAI_TRANSCRIPTIONS_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=SUBTITLE_HTTP_TIMEOUT_SEC) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI transcription failed: HTTP {exc.code} {detail[:500]}") from exc
    return payload, time.perf_counter() - started


def _parse_srt_timestamp(value: str) -> float:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def _format_srt_timestamp(value: float) -> str:
    value = max(0.0, value)
    total_ms = round(value * 1000)
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    seconds, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def _clamp_srt_to_duration(srt_text: str, duration: float) -> tuple[str, bool]:
    if duration <= 0:
        return srt_text, False
    changed = False

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        start = min(_parse_srt_timestamp(match.group(1)), duration)
        end = min(_parse_srt_timestamp(match.group(2)), duration)
        if end < start:
            end = start
        replacement = f"{_format_srt_timestamp(start)} --> {_format_srt_timestamp(end)}"
        changed = changed or replacement != match.group(0)
        return replacement

    updated = re.sub(
        r"(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})",
        replace,
        srt_text,
    )
    return updated, changed


def _srt_to_vtt(srt_text: str) -> str:
    timestamp_re = re.compile(
        r"(\d{2}:\d{2}:\d{2}),(\d{3})\s+-->\s+"
        r"(\d{2}:\d{2}:\d{2}),(\d{3})"
    )
    lines = [
        timestamp_re.sub(r"\1.\2 --> \3.\4", line)
        for line in srt_text.lstrip().splitlines()
    ]
    return "WEBVTT\n\n" + "\n".join(lines) + "\n"




def _escape_filter_path(path: str) -> str:
    # FFmpeg subtitles filter treats ':' and '\' specially. Single quotes are
    # not expected in our mktemp paths, but escape defensively.
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


FONT_SIZE_MAP = {"small": 10, "medium": 14, "large": 18}
ALIGNMENT_MAP = {"bottom": 2, "center": 5, "top": 8}
MARGIN_V_MAP = {"bottom": SUBTITLE_BURN_IN_MARGIN_V, "center": 0, "top": 40}


def _burn_subtitles_into_video(
    video_path: str,
    srt_path: str,
    output_path: str,
    font_size: int = SUBTITLE_BURN_IN_FONT_SIZE,
    alignment: int = 2,
    margin_v: int = SUBTITLE_BURN_IN_MARGIN_V,
) -> float:
    """Render subtitles onto video pixels with an 80% opaque black box."""
    started = time.perf_counter()
    style = ",".join([
        "BorderStyle=4",  # opaque box behind each subtitle cue
        f"BackColour=&H{SUBTITLE_BURN_IN_BACK_ALPHA_HEX}000000",
        "Outline=0",
        "Shadow=0",
        f"FontSize={font_size}",
        f"Alignment={alignment}",
        f"MarginV={margin_v}",
        "PrimaryColour=&H00FFFFFF",
    ])
    vf = f"subtitles='{_escape_filter_path(srt_path)}':force_style='{style}'"
    _run_cmd(
        [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", vf,
            "-c:v", "libx264",
            "-crf", "23",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_path,
        ],
        timeout=300,
    )
    return time.perf_counter() - started

def _plain_text_from_srt(srt_text: str) -> str:
    lines: list[str] = []
    timestamp_re = re.compile(r"\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}")
    for raw in srt_text.splitlines():
        line = raw.strip()
        if not line or line.isdigit() or timestamp_re.fullmatch(line):
            continue
        lines.append(line)
    return " ".join(lines).strip()


def burn_user_srt(
    r2,
    video_key: str,
    srt_key: str,
    *,
    font_size: int = SUBTITLE_BURN_IN_FONT_SIZE,
    alignment: int = 2,
    margin_v: int = SUBTITLE_BURN_IN_MARGIN_V,
) -> SubtitleResult:
    """사용자가 업로드한 SRT를 R2에서 다운로드해 영상에 burn-in한다."""
    tmp_video = tmp_srt = tmp_burned = None
    metrics: dict[str, Any] = {"source": "user_srt", "font_size": font_size, "alignment": alignment}
    try:
        _ensure_tool("ffmpeg")
        tmp_video = _make_tmp(".mp4")
        tmp_srt = _make_tmp(".srt")
        tmp_burned = _make_tmp(".mp4")

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=video_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=srt_key)
        srt_text = resp["Body"].read().decode("utf-8")

        duration = _probe_duration(tmp_video)
        if duration > 0:
            srt_text, _ = _clamp_srt_to_duration(srt_text, duration)

        subtitle_text = _plain_text_from_srt(srt_text)
        vtt_text = _srt_to_vtt(srt_text)

        subtitle_key = f"subtitles/s-{uuid.uuid4()}.vtt"
        r2.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=subtitle_key,
            Body=vtt_text.encode("utf-8"),
            ContentType="text/vtt; charset=utf-8",
            CacheControl="public, max-age=31536000, immutable",
        )

        Path(tmp_srt).write_text(srt_text, encoding="utf-8")
        metrics["burn_in_seconds"] = round(
            _burn_subtitles_into_video(tmp_video, tmp_srt, tmp_burned, font_size, alignment, margin_v), 3
        )

        burned_key = f"videos/subtitled-{uuid.uuid4()}.mp4"
        with open(tmp_burned, "rb") as f:
            r2.put_object(
                Bucket=R2_BUCKET_NAME,
                Key=burned_key,
                Body=f,
                ContentType="video/mp4",
                CacheControl="public, max-age=31536000, immutable",
            )

        return SubtitleResult(
            status="completed",
            subtitle_r2_key=subtitle_key,
            subtitle_url=f"{R2_PUBLIC_URL}/{subtitle_key}",
            subtitle_text=subtitle_text,
            burned_video_r2_key=burned_key,
            burned_video_url=f"{R2_PUBLIC_URL}/{burned_key}",
            metrics=metrics,
        )
    except Exception as exc:
        logger.warning("User SRT burn-in failed for %s: %s", video_key, exc)
        return SubtitleResult(status="failed", error=str(exc), metrics=metrics)
    finally:
        for tmp in (tmp_video, tmp_srt, tmp_burned):
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def generate_subtitle_for_video(
    r2,
    video_key: str,
    *,
    model: str = DEFAULT_TRANSCRIPTION_MODEL,
    language: str | None = DEFAULT_TRANSCRIPTION_LANGUAGE,
    api_key: str | None = None,
    font_size: int = SUBTITLE_BURN_IN_FONT_SIZE,
    alignment: int = 2,
    margin_v: int = SUBTITLE_BURN_IN_MARGIN_V,
) -> SubtitleResult:
    """Download a video from R2, transcribe audio, upload SRT, and return metadata.

    This function never mutates the source video. Callers should treat failed/skipped
    results as non-fatal to preserve the original upload flow.
    """
    if not SUBTITLE_ENABLED:
        return SubtitleResult(status="skipped", error="subtitle generation disabled")

    api_key = api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return SubtitleResult(status="skipped", error="OPENAI_API_KEY not configured")

    tmp_video = tmp_audio = tmp_srt = tmp_burned = None
    metrics: dict[str, Any] = {"model": model, "language": language}
    try:
        _ensure_tool("ffmpeg")
        _ensure_tool("ffprobe")
        tmp_video = _make_tmp(".mp4")
        tmp_audio = _make_tmp(".m4a")
        tmp_srt = _make_tmp(".srt")
        tmp_burned = _make_tmp(".mp4")

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=video_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        duration = _probe_duration(tmp_video)
        metrics["duration_sec"] = round(duration, 3)
        if duration <= 0:
            return SubtitleResult(status="failed", error="cannot determine video duration", metrics=metrics)
        if duration > SUBTITLE_MAX_DURATION_SEC:
            return SubtitleResult(status="skipped", error=f"duration exceeds subtitle limit: {duration:.1f}s", metrics=metrics)

        metrics["extract_audio_seconds"] = round(_extract_audio(tmp_video, tmp_audio), 3)
        srt_text, transcribe_seconds = _transcribe_srt(tmp_audio, api_key=api_key, model=model, language=language)
        metrics["transcribe_seconds"] = round(transcribe_seconds, 3)
        srt_text, clamped = _clamp_srt_to_duration(srt_text, duration)
        metrics["srt_clamped_to_source_duration"] = clamped
        subtitle_text = _plain_text_from_srt(srt_text)
        vtt_text = _srt_to_vtt(srt_text)

        subtitle_key = f"subtitles/s-{uuid.uuid4()}.vtt"
        r2.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=subtitle_key,
            Body=vtt_text.encode("utf-8"),
            ContentType="text/vtt; charset=utf-8",
            CacheControl="public, max-age=31536000, immutable",
        )

        Path(tmp_srt).write_text(srt_text, encoding="utf-8")
        metrics["burn_in_seconds"] = round(
            _burn_subtitles_into_video(tmp_video, tmp_srt, tmp_burned, font_size, alignment, margin_v), 3
        )
        burned_key = f"videos/subtitled-{uuid.uuid4()}.mp4"
        with open(tmp_burned, "rb") as f:
            r2.put_object(
                Bucket=R2_BUCKET_NAME,
                Key=burned_key,
                Body=f,
                ContentType="video/mp4",
                CacheControl="public, max-age=31536000, immutable",
            )
        burned_url = f"{R2_PUBLIC_URL}/{burned_key}"
        metrics["burn_in_required"] = True
        metrics["burn_in_back_opacity"] = 0.8

        return SubtitleResult(
            status="completed",
            subtitle_r2_key=subtitle_key,
            subtitle_url=f"{R2_PUBLIC_URL}/{subtitle_key}",
            subtitle_text=subtitle_text,
            burned_video_r2_key=burned_key,
            burned_video_url=burned_url,
            metrics=metrics,
        )
    except Exception as exc:
        logger.warning("Subtitle generation failed for %s: %s", video_key, exc)
        return SubtitleResult(status="failed", error=str(exc), metrics=metrics)
    finally:
        for tmp in (tmp_video, tmp_audio, tmp_srt, tmp_burned):
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def subtitle_metrics_json(result: SubtitleResult) -> str | None:
    if not result.metrics:
        return None
    return json.dumps(result.metrics, ensure_ascii=False)
