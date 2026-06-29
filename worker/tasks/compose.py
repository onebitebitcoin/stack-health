"""다중 미디어(영상 ≤1 + 이미지 ≤N)를 순서대로 이어붙여 단일 mp4로 만든다.

설계:
- 각 항목을 동일 사양(해상도/fps/코덱/오디오 트랙)의 정규화된 클립으로 인코딩한 뒤
  concat demuxer(`-c copy`)로 합친다 → 코덱 불일치로 인한 검은 화면/오디오 끊김 방지.
- 이미지는 항상 3초 클립. 영상은 원본 길이 유지.
- 오디오 트랙은 모든 클립에 항상 포함(영상 무음/이미지는 anullsrc)되어 concat 시 트랙 수가 일치한다.
- 기준 해상도/fps는 영상이 있으면 영상, 없으면 첫 이미지를 따른다(짝수 보정).

기존 `image_merge.run_image_merge`(proof-merge 경로)는 건드리지 않는다 — 독립 모듈.
"""

import logging
import os
import subprocess
import tempfile
import uuid

import boto3
from botocore.config import Config

from config import R2_ACCESS_KEY_ID, R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_SECRET_ACCESS_KEY

logger = logging.getLogger(__name__)

IMAGE_CLIP_SECONDS = 3
DEFAULT_WIDTH = 720
DEFAULT_HEIGHT = 1280
DEFAULT_FPS = 30
MAX_FPS = 60


def _get_r2_client():
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


def _probe_video_dims_fps(path: str) -> tuple[int, int, str]:
    """영상의 (width, height, fps) 반환. rotate 태그로 display 해상도 보정."""
    probe_v = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,avg_frame_rate",
         "-of", "csv=p=0", path],
        capture_output=True, text=True, timeout=30,
    )
    first_line = probe_v.stdout.strip().splitlines()[0] if probe_v.stdout.strip() else ""
    dims = first_line.split(",")
    vw = int(dims[0].strip()) if len(dims) >= 2 and dims[0].strip().isdigit() else DEFAULT_WIDTH
    vh = int(dims[1].strip()) if len(dims) >= 2 and dims[1].strip().isdigit() else DEFAULT_HEIGHT
    try:
        fps_raw = dims[2].strip() if len(dims) >= 3 else f"{DEFAULT_FPS}/1"
        num, den = (int(x) for x in fps_raw.split("/"))
        fps_val = num / den if den else DEFAULT_FPS
        if fps_val < 1:
            fps_val = DEFAULT_FPS
        fps = f"{min(int(round(fps_val)), MAX_FPS)}/1"
    except (ValueError, ZeroDivisionError):
        fps = f"{DEFAULT_FPS}/1"

    probe_rot = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
         "-show_entries", "stream_tags=rotate",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, timeout=30,
    )
    try:
        rotation = abs(int(probe_rot.stdout.strip()))
    except ValueError:
        rotation = 0
    if rotation in (90, 270):
        vw, vh = vh, vw

    vw -= vw % 2
    vh -= vh % 2
    return max(vw, 2), max(vh, 2), fps


def _probe_image_dims(path: str) -> tuple[int, int]:
    """이미지의 (width, height) 반환. 실패 시 기본값."""
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True, timeout=30,
    )
    line = probe.stdout.strip().splitlines()[0] if probe.stdout.strip() else ""
    dims = line.split(",")
    w = int(dims[0].strip()) if len(dims) >= 2 and dims[0].strip().isdigit() else DEFAULT_WIDTH
    h = int(dims[1].strip()) if len(dims) >= 2 and dims[1].strip().isdigit() else DEFAULT_HEIGHT
    w -= w % 2
    h -= h % 2
    return max(w, 2), max(h, 2)


def _probe_duration(path: str) -> float:
    for extra in (
        ["-select_streams", "v:0", "-show_entries", "stream=duration"],
        ["-show_entries", "format=duration"],
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
    return 0.0


def _has_audio_stream(path: str) -> bool:
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "a:0",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", path],
        capture_output=True, text=True, timeout=30,
    )
    return bool(probe.stdout.strip())


def _scale_pad_vf(vw: int, vh: int) -> str:
    return (
        f"scale={vw}:{vh}:force_original_aspect_ratio=decrease,"
        f"pad={vw}:{vh}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p"
    )


def _encode_image_clip(src: str, out: str, vw: int, vh: int, fps: str) -> None:
    """이미지를 3초 정규화 클립(무음 오디오 포함)으로 인코딩."""
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-t", str(IMAGE_CLIP_SECONDS), "-i", src,
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-vf", _scale_pad_vf(vw, vh),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-r", fps,
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-t", str(IMAGE_CLIP_SECONDS),
        "-video_track_timescale", "90000",
        out,
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"이미지 클립 인코딩 실패: {result.stderr.decode()[-800:]}")


def _encode_video_clip(src: str, out: str, vw: int, vh: int, fps: str, mute: bool) -> None:
    """영상을 기준 사양으로 정규화. 원본 오디오 유지(mute면 무음), 오디오 없으면 anullsrc 추가."""
    has_audio = _has_audio_stream(src)
    use_silent = mute or not has_audio
    cmd = ["ffmpeg", "-y", "-i", src]
    if use_silent:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    cmd += [
        "-vf", _scale_pad_vf(vw, vh),
        "-r", fps,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    ]
    if use_silent:
        # 0:v(영상) + 1:a(무음). -shortest로 영상 길이에 맞춤.
        cmd += ["-map", "0:v:0", "-map", "1:a:0", "-shortest"]
    else:
        cmd += ["-map", "0:v:0", "-map", "0:a:0"]
    cmd += ["-video_track_timescale", "90000", out]
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"영상 클립 정규화 실패: {result.stderr.decode()[-800:]}")


def _concat_clips(clip_paths: list[str], out: str) -> None:
    """동일 사양 클립들을 concat demuxer(-c copy)로 합친다."""
    list_file = _make_tmp(".txt")
    try:
        with open(list_file, "w", encoding="utf-8") as f:
            for p in clip_paths:
                # concat demuxer는 단일따옴표를 '\'' 로 이스케이프
                safe = p.replace("'", "'\\''")
                f.write(f"file '{safe}'\n")
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", list_file,
            "-c", "copy", "-movflags", "+faststart",
            out,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        if result.returncode != 0:
            # copy 실패 시(타임베이스 미세 불일치 등) 재인코딩 fallback
            logger.warning("concat copy 실패, 재인코딩 fallback: %s", result.stderr.decode()[-400:])
            cmd_reencode = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0", "-i", list_file,
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                "-movflags", "+faststart",
                out,
            ]
            result = subprocess.run(cmd_reencode, capture_output=True, timeout=600)
            if result.returncode != 0:
                raise RuntimeError(f"concat 실패: {result.stderr.decode()[-800:]}")
    finally:
        if os.path.exists(list_file):
            os.unlink(list_file)


def compose_items(r2, items: list[dict], mute_video: bool = False) -> tuple[str, float]:
    """items를 순서대로 이어붙여 R2에 업로드. (composed_r2_key, total_duration_sec) 반환.

    items: [{"kind": "image"|"video", "r2_key": "..."}] — 전송 순서 그대로.
    영상은 최대 1개라고 가정하지만 로직은 다중에도 동작한다.
    단일 항목이면 정규화만 거쳐 그대로 반환된다.
    """
    if not items:
        raise ValueError("compose_items: 빈 items")

    downloaded: list[tuple[str, str]] = []  # (kind, local_path)
    clip_paths: list[str] = []
    tmp_output = _make_tmp(".mp4")
    try:
        # 1) 다운로드
        for item in items:
            kind = item["kind"]
            key = item["r2_key"]
            suffix = ".mp4" if kind == "video" else (
                ".jpg" if key.lower().endswith((".jpg", ".jpeg")) else ".png"
            )
            local = _make_tmp(suffix)
            resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=key)
            with open(local, "wb") as f:
                f.write(resp["Body"].read())
            downloaded.append((kind, local))

        # 2) 기준 해상도/fps 결정 — 영상 우선, 없으면 첫 이미지
        video_local = next((p for k, p in downloaded if k == "video"), None)
        if video_local:
            vw, vh, fps = _probe_video_dims_fps(video_local)
        else:
            first_img = next(p for k, p in downloaded if k == "image")
            vw, vh = _probe_image_dims(first_img)
            fps = f"{DEFAULT_FPS}/1"
        logger.info("compose: base %dx%d @ %s, items=%d", vw, vh, fps, len(downloaded))

        # 3) 각 항목 정규화 클립 인코딩
        for kind, local in downloaded:
            clip = _make_tmp(".mp4")
            if kind == "image":
                _encode_image_clip(local, clip, vw, vh, fps)
            else:
                _encode_video_clip(local, clip, vw, vh, fps, mute_video)
            clip_paths.append(clip)

        # 4) concat
        if len(clip_paths) == 1:
            # 단일 항목은 정규화 클립을 그대로 출력으로 사용
            os.replace(clip_paths[0], tmp_output)
            clip_paths = []
        else:
            _concat_clips(clip_paths, tmp_output)

        total_duration = _probe_duration(tmp_output)

        # 5) R2 업로드
        composed_key = f"videos/composed-{uuid.uuid4()}.mp4"
        with open(tmp_output, "rb") as f:
            r2.put_object(
                Bucket=R2_BUCKET_NAME, Key=composed_key, Body=f, ContentType="video/mp4",
                CacheControl="public, max-age=31536000, immutable",
            )
        logger.info("compose: → %s (%.2fs)", composed_key, total_duration)
        return composed_key, total_duration
    finally:
        for _, p in downloaded:
            if p and os.path.exists(p):
                os.unlink(p)
        for p in clip_paths:
            if p and os.path.exists(p):
                os.unlink(p)
        if os.path.exists(tmp_output):
            os.unlink(tmp_output)
