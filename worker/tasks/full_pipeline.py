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
from notify import notify_video_failure
from tasks.image_merge import run_image_merge

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




def _compress_video(r2, video_key: str) -> tuple[str, int, int, dict] | None:
    """Re-encode video to reduce file size (CRF 28, ultrafast).
    Returns (compressed_key, pre_bytes, post_bytes, video_meta) or None if no benefit / failure.
    """
    tmp_input = tmp_output = None
    try:
        tmp_input = _make_tmp(".mp4")
        tmp_output = _make_tmp(".mp4")

        resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=video_key)
        with open(tmp_input, "wb") as f:
            f.write(resp["Body"].read())

        pre_bytes = os.path.getsize(tmp_input)

        probe_a = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a:0",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", tmp_input],
            capture_output=True, text=True, timeout=30,
        )
        has_audio = bool(probe_a.stdout.strip())

        vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p"
        cmd = [
            "ffmpeg", "-y",
            "-i", tmp_input,
            "-vf", vf,
            "-vcodec", "libx264", "-crf", "28", "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
        ]
        cmd += ["-c:a", "aac", "-b:a", "96k"] if has_audio else ["-an"]
        cmd += ["-movflags", "+faststart", tmp_output]

        result = subprocess.run(cmd, capture_output=True, timeout=180)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg compress: {result.stderr.decode()[-800:]}")

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

        if post_bytes >= pre_bytes:
            logger.info("[compress] 압축 효과 없음 (%dB → %dB), 원본 유지", pre_bytes, post_bytes)
            return None

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


def run_full_pipeline(job: dict, status_callback=None) -> dict:
    """Full upload pipeline: optional merges → DB commit."""
    from app.models.post import Post
    from app.models.user import User
    from app.models.video import Video
    from app.routes.challenges import increment_challenge_upload
    from app.services.reward import DAILY_MAX_UPLOADS, POINTS_PER_UPLOAD, add_points, get_daily_workout_upload_count, is_workout_upload

    start_time = time.time()
    r2 = _get_r2_client()
    current_key: str = job["r2_key"]
    final_proof_url: str | None = job.get("proof_cdn_url")
    user_id: int = int(job["user_id"])
    job_id: str = job["job_id"]

    has_audio_merged = False
    has_image_merged = False

    audio_r2_key: str | None = job.get("audio_r2_key")
    if audio_r2_key:
        if status_callback: status_callback("audio_merge")
        audio_content_type = job.get("audio_content_type", "audio/webm")
        audio_suffix = ".mp4" if audio_content_type == "audio/mp4" else ".webm"
        merged = _audio_merge(r2, current_key, audio_r2_key, float(job.get("audio_duration_sec", 0)), audio_suffix)
        if merged:
            current_key = merged
            has_audio_merged = True
            logger.info("[full-pipeline] job=%s audio merged → %s", job_id, current_key)

    proof_r2_key: str | None = job.get("proof_r2_key")
    if proof_r2_key:
        if status_callback: status_callback("image_merge")
        final_proof_url = f"{R2_PUBLIC_URL}/{proof_r2_key}"
        try:
            merge_result = run_image_merge({"video_r2_key": current_key, "proof_r2_key": proof_r2_key})
        except Exception as e:
            raise RuntimeError("증거 사진 이미지 머지 실패 — 업로드 취소") from e
        try:
            r2.delete_object(Bucket=R2_BUCKET_NAME, Key=current_key)
        except Exception:
            pass
        current_key = merge_result["output_r2_key"]
        has_image_merged = True
        logger.info("[full-pipeline] job=%s proof merged → %s", job_id, current_key)

    pre_compress_key = current_key
    pre_size_bytes: int = 0
    post_size_bytes: int = 0
    video_meta: dict = {}
    compressed_key: str | None = None
    if status_callback: status_callback("compress")
    compress_result = _compress_video(r2, current_key)
    if compress_result:
        compressed_key, pre_size_bytes, post_size_bytes, video_meta = compress_result
        try:
            r2.delete_object(Bucket=R2_BUCKET_NAME, Key=pre_compress_key)
        except Exception:
            pass
        current_key = compressed_key
        logger.info("[full-pipeline] job=%s compressed → %s (%dB → %dB)", job_id, current_key, pre_size_bytes, post_size_bytes)

    if status_callback: status_callback("db_save")
    db = SessionLocal()
    try:

        tags_list = job.get("tags", [])
        if isinstance(tags_list, str):
            import json as _json2
            tags_list = _json2.loads(tags_list)
        if is_workout_upload(tags_list) and get_daily_workout_upload_count(db, user_id) >= DAILY_MAX_UPLOADS:
            raise RuntimeError("운동 영상 하루 업로드 한도 초과")

        cdn_url = f"{R2_PUBLIC_URL}/{current_key}"

        video = Video(
            user_id=user_id,
            r2_key=current_key,
            cdn_url=cdn_url,
            file_hash=job["file_hash"],
            duration_sec=min(60, max(5, int(job.get("duration_sec", 15)))),
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
        if has_audio_merged and has_image_merged:
            merge_type = "video + audio + image"
        elif has_image_merged:
            merge_type = "video + image"
        elif has_audio_merged:
            merge_type = "video + audio"
        else:
            merge_type = "video"
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
            "merge_type": merge_type,
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
