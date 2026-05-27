import json
import logging
import os
import subprocess
import tempfile
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
    tmp_video = tmp_image = tmp_proof_clip = tmp_output = tmp_list = None
    try:
        tmp_video = _make_tmp(".mp4")
        tmp_image = _make_tmp(img_suffix)
        tmp_proof_clip = _make_tmp(".mp4")
        tmp_output = _make_tmp(".mp4")
        tmp_list = _make_tmp(".txt")

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

        vf = (
            f"scale={vw}:{vh}:force_original_aspect_ratio=decrease,"
            f"pad={vw}:{vh}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
        )

        if has_audio:
            clip_cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-t", "3", "-i", tmp_image,
                "-f", "lavfi", "-t", "3", "-i", "anullsrc=r=48000:cl=stereo",
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                "-shortest", "-movflags", "+faststart", tmp_proof_clip,
            ]
        else:
            clip_cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-t", "3", "-i", tmp_image,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-an", "-movflags", "+faststart", tmp_proof_clip,
            ]
        result = subprocess.run(clip_cmd, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise RuntimeError(f"proof clip: {result.stderr.decode()[:500]}")

        with open(tmp_list, "w") as f:
            f.write(f"file '{tmp_video}'\n")
            f.write(f"file '{tmp_proof_clip}'\n")

        concat_cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", tmp_list,
            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ]
        if has_audio:
            concat_cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"]
        else:
            concat_cmd += ["-an"]
        concat_cmd.append(tmp_output)

        result = subprocess.run(concat_cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"concat: {result.stderr.decode()[:500]}")

        merged_key = f"videos/proof-merged-{uuid.uuid4()}.mp4"
        with open(tmp_output, "rb") as f:
            r2.put_object(Bucket=R2_BUCKET_NAME, Key=merged_key, Body=f, ContentType="video/mp4")

        return merged_key, f"{R2_PUBLIC_URL}/{proof_key}"
    except Exception as e:
        logger.warning("Proof merge failed: %s", e)
        return None
    finally:
        for tmp in [tmp_video, tmp_image, tmp_proof_clip, tmp_output, tmp_list]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def run_full_pipeline(job: dict) -> dict:
    """Full upload pipeline: optional merges → DB commit."""
    from app.models.post import Post
    from app.models.video import Video
    from app.routes.challenges import increment_challenge_upload
    from app.services.reward import DAILY_MAX_UPLOADS, POINTS_PER_UPLOAD, add_points, get_daily_upload_count

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

        db.commit()
        logger.info("[full-pipeline] job=%s 완료, post_id=%s points=%s", job_id, post.id, points_earned)
        return {"post_id": str(post.id), "cdn_url": cdn_url, "points_earned": str(points_earned)}
    finally:
        db.close()
