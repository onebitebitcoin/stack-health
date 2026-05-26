import json
import logging
import os
import subprocess
import tempfile
import threading
import uuid
from datetime import datetime, timezone

import boto3
import redis
from botocore.config import Config

from app.config import settings

logger = logging.getLogger(__name__)

QUEUE_NAME = "queue:merge-jobs"
JOB_KEY_PREFIX = "job:"
JOB_TTL = 86400  # 24시간

# Fallback: Redis 없을 때 in-memory 잡 스토어 (Railway 재시작 시 초기화)
_local_jobs: dict[str, dict] = {}
_local_jobs_lock = threading.Lock()


def _set_local_job(job_id: str, data: dict) -> None:
    with _local_jobs_lock:
        _local_jobs[job_id] = data


def _get_local_job(job_id: str) -> dict | None:
    with _local_jobs_lock:
        return _local_jobs.get(job_id)


def get_redis_client() -> redis.Redis:
    if not settings.redis_url:
        raise RuntimeError("REDIS_URL이 설정되지 않았습니다")
    return redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=3)


def enqueue_merge_job(job_payload: dict) -> str:
    """Redis 큐에 잡 등록. 실패 시 RuntimeError 또는 redis.RedisError 발생."""
    job_id = str(uuid.uuid4())
    job_payload["job_id"] = job_id
    job_payload["created_at"] = datetime.now(timezone.utc).isoformat()

    r = get_redis_client()
    job_key = f"{JOB_KEY_PREFIX}{job_id}"

    r.hset(job_key, mapping={
        "status": "pending",
        "user_id": str(job_payload.get("user_id", "")),
        "video_r2_key": job_payload.get("video_r2_key", ""),
        "audio_r2_key": job_payload.get("audio_r2_key", ""),
        "audio_duration_sec": str(job_payload.get("audio_duration_sec", "")),
        "created_at": job_payload["created_at"],
    })
    r.expire(job_key, JOB_TTL)
    r.lpush(QUEUE_NAME, json.dumps(job_payload))
    logger.info("Enqueued merge job %s to Redis", job_id)
    return job_id


def get_job_status(job_id: str) -> dict | None:
    """잡 상태 조회. 로컬 스토어 → Redis 순으로 확인."""
    local = _get_local_job(job_id)
    if local is not None:
        return local

    try:
        r = get_redis_client()
        data = r.hgetall(f"{JOB_KEY_PREFIX}{job_id}")
        return data if data else None
    except Exception:
        return None


def _run_local_merge(
    job_id: str,
    video_r2_key: str,
    audio_r2_key: str,
    audio_duration_sec: int,
    audio_content_type: str,
) -> None:
    """Fallback: 로컬 Railway 서버에서 ffmpeg 병합 (백그라운드 스레드)."""
    tmp_video = tmp_audio = tmp_output = None
    try:
        r2 = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )

        audio_suffix = ".mp4" if audio_content_type == "audio/mp4" else ".webm"
        tmp_video = tempfile.mktemp(suffix=".mp4")
        tmp_audio = tempfile.mktemp(suffix=audio_suffix)
        tmp_output = tempfile.mktemp(suffix=".mp4")

        logger.info("[fallback] job=%s: R2에서 video 다운로드", job_id)
        resp = r2.get_object(Bucket=settings.r2_bucket_name, Key=video_r2_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        logger.info("[fallback] job=%s: R2에서 audio 다운로드", job_id)
        resp = r2.get_object(Bucket=settings.r2_bucket_name, Key=audio_r2_key)
        with open(tmp_audio, "wb") as f:
            f.write(resp["Body"].read())

        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1",
            "-i", tmp_video,
            "-i", tmp_audio,
            "-t", str(float(audio_duration_sec)),
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
            "-map", "0:v:0", "-map", "1:a:0",
            "-movflags", "+faststart",
            tmp_output,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg 실패: {result.stderr.decode()[:500]}")

        merged_key = f"videos/merged-{uuid.uuid4()}.mp4"
        logger.info("[fallback] job=%s: R2 업로드 → %s", job_id, merged_key)
        with open(tmp_output, "rb") as f:
            r2.put_object(
                Bucket=settings.r2_bucket_name,
                Key=merged_key,
                Body=f,
                ContentType="video/mp4",
            )

        cdn_url = f"{settings.r2_public_url.rstrip('/')}/{merged_key}"
        _set_local_job(job_id, {"status": "completed", "output_r2_key": merged_key, "cdn_url": cdn_url})
        logger.info("[fallback] job=%s: 완료 %s", job_id, cdn_url)

    except Exception as e:
        logger.exception("[fallback] job=%s: 실패 %s", job_id, e)
        _set_local_job(job_id, {"status": "failed", "error": str(e)})
    finally:
        for tmp in [tmp_video, tmp_audio, tmp_output]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def enqueue_merge_job_local(job_payload: dict) -> str:
    """Redis 불가 시 로컬 백그라운드 스레드에서 처리. job_id 즉시 반환."""
    job_id = str(uuid.uuid4())
    _set_local_job(job_id, {"status": "processing"})

    t = threading.Thread(
        target=_run_local_merge,
        args=(
            job_id,
            job_payload["video_r2_key"],
            job_payload["audio_r2_key"],
            job_payload["audio_duration_sec"],
            job_payload.get("audio_content_type", "audio/webm"),
        ),
        daemon=True,
    )
    t.start()
    logger.warning("[fallback] Redis 없음 — job=%s 로컬 처리 시작", job_id)
    return job_id


def _run_local_proof_merge(
    job_id: str,
    video_r2_key: str,
    proof_r2_key: str,
) -> None:
    """Proof 이미지를 3초 영상으로 변환 후 원본 비디오 끝에 붙인다."""
    tmp_video = tmp_image = tmp_proof_clip = tmp_output = tmp_list = None
    try:
        r2 = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )

        img_suffix = ".jpg" if proof_r2_key.lower().endswith((".jpg", ".jpeg")) else ".png"
        tmp_video = tempfile.mktemp(suffix=".mp4")
        tmp_image = tempfile.mktemp(suffix=img_suffix)
        tmp_proof_clip = tempfile.mktemp(suffix=".mp4")
        tmp_output = tempfile.mktemp(suffix=".mp4")
        tmp_list = tempfile.mktemp(suffix=".txt")

        logger.info("[proof-merge] job=%s: 비디오 다운로드", job_id)
        resp = r2.get_object(Bucket=settings.r2_bucket_name, Key=video_r2_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        logger.info("[proof-merge] job=%s: 이미지 다운로드", job_id)
        resp = r2.get_object(Bucket=settings.r2_bucket_name, Key=proof_r2_key)
        with open(tmp_image, "wb") as f:
            f.write(resp["Body"].read())

        # 비디오 해상도 조회
        probe_v = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0",
                tmp_video,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        first_line = probe_v.stdout.strip().splitlines()[0] if probe_v.stdout.strip() else ""
        dims = first_line.split(",")
        vw = dims[0].strip() if len(dims) >= 2 else "720"
        vh = dims[1].strip() if len(dims) >= 2 else "1280"

        # 원본 비디오 오디오 스트림 유무 확인
        # concat demuxer는 두 세그먼트의 스트림 수가 반드시 동일해야 함
        probe_a = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                tmp_video,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        has_audio = bool(probe_a.stdout.strip())

        vf = (
            f"scale={vw}:{vh}:force_original_aspect_ratio=decrease,"
            f"pad={vw}:{vh}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
        )

        if has_audio:
            # 원본에 오디오 있음 → proof 클립에 무음 오디오 추가 (스트림 수 맞춤)
            clip_cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-t", "3", "-i", tmp_image,
                "-f", "lavfi", "-t", "3", "-i", "anullsrc=r=48000:cl=stereo",
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                "-shortest", "-movflags", "+faststart",
                tmp_proof_clip,
            ]
        else:
            # 원본에 오디오 없음 → proof 클립도 비디오만
            clip_cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-t", "3", "-i", tmp_image,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-an", "-movflags", "+faststart",
                tmp_proof_clip,
            ]

        result = subprocess.run(clip_cmd, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise RuntimeError(f"이미지 클립 생성 실패: {result.stderr.decode()[:500]}")

        # concat demuxer로 두 영상 연결
        with open(tmp_list, "w") as f:
            f.write(f"file '{tmp_video}'\n")
            f.write(f"file '{tmp_proof_clip}'\n")

        concat_cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", tmp_list,
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
            raise RuntimeError(f"concat 실패: {result.stderr.decode()[:500]}")

        merged_key = f"videos/proof-merged-{uuid.uuid4()}.mp4"
        logger.info("[proof-merge] job=%s: R2 업로드 → %s", job_id, merged_key)
        with open(tmp_output, "rb") as f:
            r2.put_object(
                Bucket=settings.r2_bucket_name,
                Key=merged_key,
                Body=f,
                ContentType="video/mp4",
            )

        cdn_url = f"{settings.r2_public_url.rstrip('/')}/{merged_key}"
        proof_cdn_url = f"{settings.r2_public_url.rstrip('/')}/{proof_r2_key}"
        _set_local_job(job_id, {
            "status": "completed",
            "output_r2_key": merged_key,
            "cdn_url": cdn_url,
            "proof_image_url": proof_cdn_url,
        })
        logger.info("[proof-merge] job=%s: 완료 %s", job_id, cdn_url)

    except Exception as e:
        logger.exception("[proof-merge] job=%s: 실패 %s", job_id, e)
        _set_local_job(job_id, {"status": "failed", "error": str(e)})
    finally:
        for tmp in [tmp_video, tmp_image, tmp_proof_clip, tmp_output, tmp_list]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def enqueue_proof_merge_job_local(video_r2_key: str, proof_r2_key: str) -> str:
    """Proof 이미지+비디오 병합을 로컬 백그라운드 스레드에서 처리. job_id 즉시 반환."""
    job_id = str(uuid.uuid4())
    _set_local_job(job_id, {"status": "processing"})

    t = threading.Thread(
        target=_run_local_proof_merge,
        args=(job_id, video_r2_key, proof_r2_key),
        daemon=True,
    )
    t.start()
    logger.info("[proof-merge] job=%s 시작", job_id)
    return job_id


# ---------------------------------------------------------------------------
# Full async upload pipeline (MQ style)
# ---------------------------------------------------------------------------

def _run_full_upload_pipeline(
    job_id: str,
    r2_key: str,
    file_hash: str,
    duration_sec: int,
    caption: str | None,
    tags: list[str],
    challenge_id: int | None,
    workout_start: str | None,
    workout_end: str | None,
    user_id: int,
    audio_r2_key: str | None,
    audio_duration_sec: int,
    audio_content_type: str,
    proof_r2_key: str | None,
    proof_cdn_url: str | None,
    early_adopter_bonus: bool,
) -> None:
    """Background thread: optional merges → DB confirm → store result."""
    from app.database import SessionLocal
    from app.models.post import Post
    from app.models.video import Video
    from app.routes.challenges import increment_challenge_upload
    from app.services.reward import POINTS_PER_UPLOAD, add_points, get_daily_upload_count, DAILY_MAX_UPLOADS

    current_r2_key = r2_key
    final_proof_url = proof_cdn_url

    try:

        # 1. Audio merge
        if audio_r2_key:
            audio_job_id = str(uuid.uuid4())
            _set_local_job(audio_job_id, {"status": "processing"})
            _run_local_merge(audio_job_id, current_r2_key, audio_r2_key, audio_duration_sec, audio_content_type)
            audio_result = _get_local_job(audio_job_id) or {}
            if audio_result.get("status") == "completed":
                current_r2_key = audio_result["output_r2_key"]
                logger.info("[full-pipeline] job=%s audio merged → %s", job_id, current_r2_key)
            else:
                logger.warning("[full-pipeline] job=%s audio merge failed, continuing without audio", job_id)

        # 2. Proof image merge
        if proof_r2_key:
            proof_job_id = str(uuid.uuid4())
            _set_local_job(proof_job_id, {"status": "processing"})
            _run_local_proof_merge(proof_job_id, current_r2_key, proof_r2_key)
            proof_result = _get_local_job(proof_job_id) or {}
            if proof_result.get("status") == "completed":
                current_r2_key = proof_result["output_r2_key"]
                final_proof_url = proof_result.get("proof_image_url", proof_cdn_url)
                logger.info("[full-pipeline] job=%s proof merged → %s", job_id, current_r2_key)
            else:
                logger.warning("[full-pipeline] job=%s proof merge failed, continuing without proof", job_id)

        # 3. DB confirm
        cdn_url = f"{settings.r2_public_url.rstrip('/')}/{current_r2_key}"

        db = SessionLocal()
        try:
            if get_daily_upload_count(db, user_id) >= DAILY_MAX_UPLOADS:
                _set_local_job(job_id, {"status": "failed", "error": "하루 업로드 한도 초과"})
                return

            video = Video(
                user_id=user_id,
                r2_key=current_r2_key,
                cdn_url=cdn_url,
                file_hash=file_hash,
                duration_sec=min(30, max(5, duration_sec)),
            )
            db.add(video)
            db.flush()

            import json as _json
            post = Post(
                video_id=video.id,
                user_id=user_id,
                caption=caption,
                tags=_json.dumps(tags, ensure_ascii=False),
                workout_start=workout_start,
                workout_end=workout_end,
                proof_image_url=final_proof_url,
            )
            db.add(post)
            db.flush()

            if challenge_id:
                increment_challenge_upload(db, user_id, challenge_id)

            rp = add_points(db, user_id, POINTS_PER_UPLOAD, "upload", reference_id=video.id, early_adopter_bonus=early_adopter_bonus)
            points_earned = rp.points if rp else 0.0

            db.commit()
            db.refresh(post)

            _set_local_job(job_id, {
                "status": "completed",
                "post_id": str(post.id),
                "cdn_url": cdn_url,
                "points_earned": str(points_earned),
            })
            logger.info("[full-pipeline] job=%s 완료, post_id=%s points=%s", job_id, post.id, points_earned)
        finally:
            db.close()

    except Exception as e:
        logger.exception("[full-pipeline] job=%s 실패: %s", job_id, e)
        _set_local_job(job_id, {"status": "failed", "error": str(e)})


def enqueue_full_upload_pipeline(
    r2_key: str,
    file_hash: str,
    duration_sec: int,
    caption: str | None,
    tags: list[str],
    challenge_id: int | None,
    workout_start: str | None,
    workout_end: str | None,
    user_id: int,
    audio_r2_key: str | None = None,
    audio_duration_sec: int = 0,
    audio_content_type: str = "audio/webm",
    proof_r2_key: str | None = None,
    proof_cdn_url: str | None = None,
    early_adopter_bonus: bool = False,
) -> str:
    """영상 업로드 전체 파이프라인을 백그라운드 스레드에서 처리. job_id 즉시 반환."""
    job_id = str(uuid.uuid4())
    _set_local_job(job_id, {"status": "processing"})

    t = threading.Thread(
        target=_run_full_upload_pipeline,
        args=(
            job_id, r2_key, file_hash, duration_sec, caption, tags,
            challenge_id, workout_start, workout_end, user_id,
            audio_r2_key, audio_duration_sec, audio_content_type,
            proof_r2_key, proof_cdn_url, early_adopter_bonus,
        ),
        daemon=True,
    )
    t.start()
    logger.info("[full-pipeline] job=%s 시작 user_id=%s", job_id, user_id)
    return job_id
