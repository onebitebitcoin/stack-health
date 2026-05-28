import json
import logging
import os
import secrets
import subprocess
import tempfile
import time
import uuid

import boto3
from botocore.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config import (
    DATABASE_URL,
    R2_ACCESS_KEY_ID,
    R2_ACCOUNT_ID,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
    R2_SECRET_ACCESS_KEY,
)

logger = logging.getLogger(__name__)

_BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _generate_share_token(user_id: int) -> str:
    ts_sec = int(time.time())
    rand = secrets.randbits(16)
    n = (ts_sec << 26) | ((user_id & 0x3FF) << 16) | rand
    chars: list[str] = []
    while n:
        chars.append(_BASE62[n % 62])
        n //= 62
    return "".join(reversed(chars))

_connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
_engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=_engine)


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


def _audio_merge(r2, video_key: str, audio_key: str, duration: float, audio_suffix: str) -> str | None:
    """Audio+video merge. Returns merged r2_key or None on failure."""
    tmp_video = tmp_audio = tmp_output = None
    try:
        tmp_video = _make_tmp(".mp4")
        tmp_audio = _make_tmp(audio_suffix)
        tmp_output = _make_tmp(".mp4")

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=video_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=audio_key)
        with open(tmp_audio, "wb") as f:
            f.write(resp["Body"].read())

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-stream_loop", "-1", "-i", tmp_video,
                "-i", tmp_audio,
                "-t", str(duration),
                "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
                "-map", "0:v:0", "-map", "1:a:0",
                "-movflags", "+faststart",
                tmp_output,
            ],
            capture_output=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg audio merge: {result.stderr.decode()[:500]}")

        merged_key = f"videos/merged-{uuid.uuid4()}.mp4"
        with open(tmp_output, "rb") as f:
            r2.put_object(Bucket=R2_BUCKET_NAME, Key=merged_key, Body=f, ContentType="video/mp4")
        return merged_key
    except Exception as e:
        logger.warning("Audio merge failed: %s", e)
        return None
    finally:
        for tmp in [tmp_video, tmp_audio, tmp_output]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def _proof_merge(r2, video_key: str, proof_key: str) -> tuple[str, str] | None:
    """Proof image concat. Returns (merged_r2_key, proof_cdn_url) or None on failure."""
    img_suffix = ".jpg" if proof_key.lower().endswith((".jpg", ".jpeg")) else ".png"
    tmp_video = tmp_image = tmp_output = None
    try:
        tmp_video = _make_tmp(".mp4")
        tmp_image = _make_tmp(img_suffix)
        tmp_output = _make_tmp(".mp4")

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=video_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=proof_key)
        with open(tmp_image, "wb") as f:
            f.write(resp["Body"].read())

        probe_v = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "csv=p=0", tmp_video],
            capture_output=True, text=True, timeout=30,
        )
        first_line = probe_v.stdout.strip().splitlines()[0] if probe_v.stdout.strip() else ""
        dims = first_line.split(",")
        vw = dims[0].strip() if len(dims) >= 2 else "720"
        vh = dims[1].strip() if len(dims) >= 2 else "1280"

        probe_a = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a:0",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", tmp_video],
            capture_output=True, text=True, timeout=30,
        )
        has_audio = bool(probe_a.stdout.strip())

        scale_vf = (
            f"scale={vw}:{vh}:force_original_aspect_ratio=decrease,"
            f"pad={vw}:{vh}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p"
        )

        # Single-pass: video + looped image → concat
        # aevalsrc with explicit d=3 avoids infinite-stream hang
        if has_audio:
            concat_filter = (
                f"[1:v]{scale_vf},trim=duration=3,setpts=PTS-STARTPTS[img];"
                f"aevalsrc=0:c=stereo:s=48000:d=3[sa];"
                f"[0:v][0:a][img][sa]concat=n=2:v=1:a=1[outv][outa]"
            )
            map_args = ["-map", "[outv]", "-map", "[outa]"]
            audio_args = ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"]
        else:
            concat_filter = (
                f"[1:v]{scale_vf},trim=duration=3,setpts=PTS-STARTPTS[img];"
                f"[0:v][img]concat=n=2:v=1:a=0[outv]"
            )
            map_args = ["-map", "[outv]"]
            audio_args = ["-an"]

        concat_cmd = [
            "ffmpeg", "-y",
            "-i", tmp_video,
            "-loop", "1", "-i", tmp_image,
            "-filter_complex", concat_filter,
            *map_args,
            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
            *audio_args,
            "-movflags", "+faststart",
            tmp_output,
        ]

        result = subprocess.run(concat_cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"concat: {result.stderr.decode()[-800:]}")

        merged_key = f"videos/proof-merged-{uuid.uuid4()}.mp4"
        with open(tmp_output, "rb") as f:
            r2.put_object(Bucket=R2_BUCKET_NAME, Key=merged_key, Body=f, ContentType="video/mp4")

        return merged_key, f"{R2_PUBLIC_URL}/{proof_key}"
    except Exception as e:
        logger.warning("Proof merge failed: %s", e)
        return None
    finally:
        for tmp in [tmp_video, tmp_image, tmp_output]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def _compress_video(r2, video_key: str) -> tuple[str, int, int] | None:
    """Re-encode video to reduce file size. Returns (new_r2_key, pre_bytes, post_bytes) or None."""
    tmp_input = tmp_output = None
    try:
        tmp_input = _make_tmp(".mp4")
        tmp_output = _make_tmp(".mp4")

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=video_key)
        with open(tmp_input, "wb") as f:
            f.write(resp["Body"].read())

        pre_bytes = os.path.getsize(tmp_input)

        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a:0",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", tmp_input],
            capture_output=True, text=True, timeout=30,
        )
        has_audio = bool(probe.stdout.strip())

        cmd = [
            "ffmpeg", "-y",
            "-i", tmp_input,
            "-vcodec", "libx264",
            "-crf", "26",
            "-preset", "fast",
            "-pix_fmt", "yuv420p",
        ]
        cmd += ["-c:a", "aac", "-b:a", "96k"] if has_audio else ["-an"]
        cmd += ["-movflags", "+faststart", tmp_output]

        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg compress: {result.stderr.decode()[:500]}")

        post_bytes = os.path.getsize(tmp_output)

        meta_probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,r_frame_rate,codec_name:format=duration",
             "-of", "json", tmp_output],
            capture_output=True, text=True, timeout=15,
        )
        video_meta: dict = {}
        try:
            import json as _json
            probe_data = _json.loads(meta_probe.stdout)
            stream = probe_data.get("streams", [{}])[0]
            fmt = probe_data.get("format", {})
            fps_raw = stream.get("r_frame_rate", "0/1")
            num, den = (fps_raw.split("/") + ["1"])[:2]
            fps = round(int(num) / max(int(den), 1), 1)
            video_meta = {
                "width": stream.get("width", 0),
                "height": stream.get("height", 0),
                "fps": fps,
                "codec": stream.get("codec_name", ""),
                "duration_sec": round(float(fmt.get("duration", 0)), 1),
            }
        except Exception:
            pass

        compressed_key = f"videos/c-{uuid.uuid4()}.mp4"
        with open(tmp_output, "rb") as f:
            r2.put_object(Bucket=R2_BUCKET_NAME, Key=compressed_key, Body=f, ContentType="video/mp4")
        return compressed_key, pre_bytes, post_bytes, video_meta
    except Exception as e:
        logger.warning("Video compression failed (using original): %s", e)
        return None
    finally:
        for tmp in [tmp_input, tmp_output]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def run_full_pipeline(job: dict) -> dict:
    """Full upload pipeline: optional merges → DB commit."""
    from app.models.post import Post
    from app.models.user import User
    from app.models.video import Video
    from app.routes.challenges import increment_challenge_upload
    from app.services.reward import DAILY_MAX_UPLOADS, POINTS_PER_UPLOAD, add_points, get_daily_upload_count

    start_time = time.time()
    r2 = _get_r2_client()
    current_key: str = job["r2_key"]
    final_proof_url: str | None = job.get("proof_cdn_url")
    user_id: int = int(job["user_id"])
    job_id: str = job["job_id"]

    audio_r2_key: str | None = job.get("audio_r2_key")
    if audio_r2_key:
        audio_content_type = job.get("audio_content_type", "audio/webm")
        audio_suffix = ".mp4" if audio_content_type == "audio/mp4" else ".webm"
        merged = _audio_merge(r2, current_key, audio_r2_key, float(job.get("audio_duration_sec", 0)), audio_suffix)
        if merged:
            current_key = merged
            logger.info("[full-pipeline] job=%s audio merged → %s", job_id, current_key)

    proof_r2_key: str | None = job.get("proof_r2_key")
    if proof_r2_key:
        result = _proof_merge(r2, current_key, proof_r2_key)
        if result:
            current_key, final_proof_url = result
            logger.info("[full-pipeline] job=%s proof merged → %s", job_id, current_key)

    pre_compress_key = current_key
    pre_size_bytes: int = 0
    post_size_bytes: int = 0
    video_meta: dict = {}
    compressed_key: str | None = None
    compress_result = _compress_video(r2, current_key)
    if compress_result:
        compressed_key, pre_size_bytes, post_size_bytes, video_meta = compress_result
        try:
            r2.delete_object(Bucket=R2_BUCKET_NAME, Key=pre_compress_key)
        except Exception:
            pass
        current_key = compressed_key
        logger.info("[full-pipeline] job=%s compressed → %s (%dB → %dB)", job_id, current_key, pre_size_bytes, post_size_bytes)

    db = SessionLocal()
    try:

        if get_daily_upload_count(db, user_id) >= DAILY_MAX_UPLOADS:
            raise RuntimeError("하루 업로드 한도 초과")

        cdn_url = f"{R2_PUBLIC_URL}/{current_key}"

        video = Video(
            user_id=user_id,
            r2_key=current_key,
            cdn_url=cdn_url,
            file_hash=job["file_hash"],
            duration_sec=min(30, max(5, int(job.get("duration_sec", 15)))),
        )
        db.add(video)
        db.flush()

        post = Post(
            video_id=video.id,
            user_id=user_id,
            caption=job.get("caption"),
            tags=json.dumps(job.get("tags", []), ensure_ascii=False),
            workout_start=job.get("workout_start"),
            workout_end=job.get("workout_end"),
            proof_image_url=final_proof_url,
            share_token=_generate_share_token(user_id),
        )
        db.add(post)
        db.flush()

        challenge_id = job.get("challenge_id")
        if challenge_id is not None:
            increment_challenge_upload(db, user_id, int(challenge_id))

        rp = add_points(
            db, user_id, POINTS_PER_UPLOAD, "upload",
            reference_id=video.id,
        )
        points_earned = rp.points if rp else 0.0

        user = db.query(User).filter(User.id == user_id).first()
        username = user.username if user else str(user_id)
        email = user.email if user else ""

        db.commit()
        elapsed_sec = time.time() - start_time
        logger.info("[full-pipeline] job=%s 완료, post_id=%s points=%s elapsed=%.1fs", job_id, post.id, points_earned, elapsed_sec)
        return {
            "post_id": str(post.id),
            "cdn_url": cdn_url,
            "points_earned": str(points_earned),
            "username": username,
            "email": email or "",
            "elapsed_sec": round(elapsed_sec, 1),
            "pre_size_bytes": pre_size_bytes,
            "post_size_bytes": post_size_bytes,
            "video_meta": video_meta,
        }
    except Exception:
        # DB 실패 시 압축된 c- 파일이 R2에 고아로 남지 않도록 정리
        if compressed_key:
            try:
                r2.delete_object(Bucket=R2_BUCKET_NAME, Key=compressed_key)
                logger.info("[full-pipeline] job=%s 실패 — 고아 c- 파일 삭제: %s", job_id, compressed_key)
            except Exception:
                pass
        raise
    finally:
        db.close()
