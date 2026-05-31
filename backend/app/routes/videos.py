import json
import os
import tempfile
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session, selectinload

from app.config import settings as app_settings
from app.database import get_db
from app.models.challenge import ChallengeParticipation
from app.models.comment import Comment
from app.models.post import Post
from app.models.post_like import PostLike
from app.models.post_view import PostView
from app.models.user import User
from app.models.video import Video
from sqlalchemy import func as sqlfunc
from app.routes.auth import get_active_user, get_current_user, get_optional_user
from app.routes.challenges import increment_challenge_upload
from app.schemas.video import (
    ConfirmUploadRequest,
    PostSchema,
    PresignedUrlRequest,
    PresignedUrlResponse,
)
from app.services import r2 as r2_service
from app.services.share_token import generate_share_token
from app.services.job_queue import enqueue_full_upload_pipeline, enqueue_merge_job, enqueue_image_merge_job, fail_job, get_job_status, reserve_job_id
from app.services.reward import (
    DAILY_MAX_UPLOADS,
    POINTS_PER_UPLOAD,
    add_points,
    get_daily_upload_count,
    revoke_queued_upload_reward,
)

logger = logging.getLogger(__name__)


def _assert_job_owner(job: dict, current_user: User) -> None:
    """Prevent users from reading another user's async job status.

    Legacy Redis job records created before this check may not include user_id;
    keep those readable until their 24h TTL expires to avoid breaking in-flight
    deployed jobs. All newly created job records include user_id.
    """
    job_user_id = job.get("user_id")
    if job_user_id in (None, ""):
        return
    if str(job_user_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="잡을 찾을 수 없습니다")


async def _spool_upload_to_temp(upload: UploadFile, max_bytes: int, label: str) -> tuple[str, int]:
    """Copy an upload to a temp file with a hard byte limit.

    This keeps the public upload-pipeline contract unchanged while avoiding
    holding whole media files in API worker memory until BackgroundTasks run.
    """
    suffix = ""
    if upload.filename and "." in upload.filename:
        suffix = "." + upload.filename.rsplit(".", 1)[-1]
    fd, path = tempfile.mkstemp(prefix=f"stackhealth-{label}-", suffix=suffix)
    size = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(status_code=400, detail=f"{label} 파일이 너무 큽니다")
                out.write(chunk)
        return path, size
    except Exception:
        try:
            os.unlink(path)
        except OSError:
            pass
        raise

def _parse_tags(raw: str | None) -> list[str]:
    try:
        return json.loads(raw or "[]")
    except (json.JSONDecodeError, TypeError):
        return []

router = APIRouter(prefix="/api/v1/videos", tags=["videos"])


@router.post("/presigned-url")
def get_presigned_url(
    req: PresignedUrlRequest,
    current_user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> dict:
    if req.content_type not in r2_service.ALLOWED_CONTENT_TYPES:
        logger.warning(
            "Unsupported content type: %s from user_id=%s",
            req.content_type,
            current_user.id,
        )
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다: {req.content_type}")
    if req.file_size > r2_service.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일이 너무 큽니다 (최대 50MB)")

    upload_url, r2_key = r2_service.generate_presigned_url(req.content_type, req.filename, current_user.id)
    return {"data": PresignedUrlResponse(upload_url=upload_url, r2_key=r2_key)}


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> dict:
    """Server-side upload: receives file from browser, streams to R2.

    Avoids CORS preflight issues on Android/mobile.
    """
    content_type = file.content_type or "video/mp4"
    if content_type not in r2_service.ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다: {content_type}")

    if get_daily_upload_count(db, current_user.id) >= DAILY_MAX_UPLOADS:
        raise HTTPException(status_code=429, detail=f"하루 업로드 한도 초과 ({DAILY_MAX_UPLOADS}회/일)")

    logger.info("upload_video: user_id=%s filename=%s content_type=%s", current_user.id, file.filename, content_type)
    r2_key, cdn_url = r2_service.upload_fileobj(file.file, content_type, file.filename or "video.mp4", current_user.id)
    return {"data": {"r2_key": r2_key, "cdn_url": cdn_url}}


@router.post("/confirm")
def confirm_upload(
    req: ConfirmUploadRequest,
    current_user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> dict:
    if req.duration_sec < 5 or req.duration_sec > 60:
        raise HTTPException(status_code=400, detail="5초 이상 60초 이하의 영상만 업로드할 수 있습니다")

    expected_prefix = f"videos/{current_user.id}/"
    if not req.r2_key.startswith(expected_prefix):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")

    tags = req.tags or []

    if get_daily_upload_count(db, current_user.id) >= DAILY_MAX_UPLOADS:
        raise HTTPException(status_code=429, detail=f"하루 업로드 한도 초과 ({DAILY_MAX_UPLOADS}회/일)")

    cdn_url = r2_service.get_cdn_url(req.r2_key)

    video = Video(
        user_id=current_user.id,
        r2_key=req.r2_key,
        cdn_url=cdn_url,
        file_hash=req.r2_key,
        duration_sec=req.duration_sec,
    )
    db.add(video)
    db.flush()

    post = Post(
        video_id=video.id,
        user_id=current_user.id,
        caption=req.caption,
        tags=json.dumps(tags, ensure_ascii=False),
        workout_start=req.workout_start,
        workout_end=req.workout_end,
        proof_image_url=req.proof_image_url,
        share_token=generate_share_token(current_user.id),
        challenge_id=req.challenge_id,
    )
    db.add(post)
    db.flush()

    if req.challenge_id:
        increment_challenge_upload(db, current_user.id, req.challenge_id)

    rp = add_points(db, current_user.id, POINTS_PER_UPLOAD, "upload", reference_id=video.id)
    points_earned = rp.points if rp else 0

    db.commit()
    db.refresh(post)
    db.refresh(video)

    post_schema = PostSchema(
        id=post.id,
        video_id=post.video_id,
        user_id=post.user_id,
        caption=post.caption,
        tags=tags,
        like_count=post.like_count,
        view_count=post.view_count,
        comment_count=0,
        created_at=post.created_at,
        cdn_url=video.cdn_url,
        username=current_user.username,
        workout_start=post.workout_start,
        workout_end=post.workout_end,
        share_token=post.share_token,
        thumbnail_url=post.thumbnail_url,
        avatar_url=current_user.avatar_url,
        profile_color=(current_user.app_settings or {}).get("profile_color"),
        challenge_id=post.challenge_id,
    )
    return {"data": {"post": post_schema, "points_earned": points_earned}}


@router.get("/daily-limit")
def get_daily_limit(
    current_user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> dict:
    """오늘 업로드 횟수 및 한도 조회."""
    count = get_daily_upload_count(db, current_user.id)
    return {
        "data": {
            "count": count,
            "limit": DAILY_MAX_UPLOADS,
            "reached": count >= DAILY_MAX_UPLOADS,
        }
    }


@router.get("/my-posts")
def my_posts(
    week_offset: int = Query(0, ge=0),
    all: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    base_filter = (
        db.query(Post)
        .join(Post.video)
        .options(selectinload(Post.video))
        .filter(Post.user_id == current_user.id, Video.status == "active")
    )

    if all:
        posts = base_filter.order_by(Post.created_at.desc()).all()
        has_more = False
    else:
        KST = timezone(timedelta(hours=9))
        now_kst = datetime.now(KST)
        monday_kst = now_kst.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now_kst.weekday())
        week_start_kst = monday_kst - timedelta(weeks=week_offset)
        week_end_kst = week_start_kst + timedelta(weeks=1)
        week_start_utc = week_start_kst.astimezone(timezone.utc)
        week_end_utc = week_end_kst.astimezone(timezone.utc)
        posts = (
            base_filter
            .filter(Post.created_at >= week_start_utc, Post.created_at < week_end_utc)
            .order_by(Post.created_at.desc())
            .all()
        )
        has_more = (
            db.query(Post)
            .join(Post.video)
            .filter(
                Post.user_id == current_user.id,
                Video.status == "active",
                Post.created_at < week_start_utc,
            )
            .first()
        ) is not None

    post_ids = [p.id for p in posts]
    comment_counts: dict[int, int] = {}
    if post_ids:
        comment_counts = dict(
            db.query(Comment.post_id, sqlfunc.count(Comment.id))
            .filter(Comment.post_id.in_(post_ids))
            .group_by(Comment.post_id)
            .all()
        )

    result = []
    for post in posts:
        tags = _parse_tags(post.tags)
        result.append(
            PostSchema(
                id=post.id,
                video_id=post.video_id,
                user_id=post.user_id,
                caption=post.caption,
                tags=tags,
                like_count=post.like_count,
                view_count=post.view_count,
                comment_count=comment_counts.get(post.id, 0),
                created_at=post.created_at,
                cdn_url=post.video.cdn_url,
                username=current_user.username,
                workout_start=post.workout_start,
                workout_end=post.workout_end,
                share_token=post.share_token,
                thumbnail_url=post.thumbnail_url,
                avatar_url=current_user.avatar_url,
                profile_color=(current_user.app_settings or {}).get("profile_color"),
                challenge_id=post.challenge_id,
            )
        )
    return {"data": {"posts": result, "has_more": has_more, "week_offset": week_offset}}


@router.get("/posts/share/{share_token}")
def get_post_by_share_token(
    share_token: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    post = db.query(Post).filter(Post.share_token == share_token).first()
    if not post:
        raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다")
    video = db.query(Video).filter(Video.id == post.video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다")
    user = db.query(User).filter(User.id == post.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    tags = _parse_tags(post.tags)
    comment_count = db.query(sqlfunc.count(Comment.id)).filter(Comment.post_id == post.id).scalar() or 0
    is_liked = False
    if current_user:
        is_liked = db.query(PostLike).filter(PostLike.post_id == post.id, PostLike.user_id == current_user.id).first() is not None
    post_schema = PostSchema(
        id=post.id,
        video_id=post.video_id,
        user_id=post.user_id,
        caption=post.caption,
        tags=tags,
        like_count=post.like_count,
        view_count=post.view_count,
        comment_count=comment_count,
        is_liked=is_liked,
        created_at=post.created_at,
        cdn_url=video.cdn_url,
        username=user.username,
        workout_start=post.workout_start,
        workout_end=post.workout_end,
        share_token=post.share_token,
        thumbnail_url=post.thumbnail_url,
        avatar_url=user.avatar_url,
        profile_color=(user.app_settings or {}).get("profile_color"),
        challenge_id=post.challenge_id,
    )
    return {"data": {"post": post_schema}}


@router.get("/posts/{post_id}")
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다")
    video = db.query(Video).filter(Video.id == post.video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다")
    user = db.query(User).filter(User.id == post.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    tags = _parse_tags(post.tags)
    comment_count = db.query(sqlfunc.count(Comment.id)).filter(Comment.post_id == post.id).scalar() or 0
    post_schema = PostSchema(
        id=post.id,
        video_id=post.video_id,
        user_id=post.user_id,
        caption=post.caption,
        tags=tags,
        like_count=post.like_count,
        view_count=post.view_count,
        comment_count=comment_count,
        created_at=post.created_at,
        cdn_url=video.cdn_url,
        username=user.username,
        workout_start=post.workout_start,
        workout_end=post.workout_end,
        share_token=post.share_token,
        thumbnail_url=post.thumbnail_url,
        avatar_url=user.avatar_url,
        profile_color=(user.app_settings or {}).get("profile_color"),
        challenge_id=post.challenge_id,
    )
    return {"data": {"post": post_schema}}


@router.delete("/posts/{post_id}")
def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")
    if post.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    video = db.query(Video).filter(Video.id == post.video_id).first()

    db.query(PostView).filter(PostView.post_id == post_id).delete()
    db.query(PostLike).filter(PostLike.post_id == post_id).delete()
    db.query(Comment).filter(Comment.post_id == post_id).delete()

    if post.challenge_id:
        participation = (
            db.query(ChallengeParticipation)
            .filter(
                ChallengeParticipation.challenge_id == post.challenge_id,
                ChallengeParticipation.user_id == post.user_id,
            )
            .first()
        )
        if participation and participation.upload_count > 0:
            participation.upload_count -= 1
            if participation.completed_at is not None and participation.upload_count < participation.challenge.condition_value:
                participation.completed_at = None

    db.delete(post)
    if video:
        revoke_queued_upload_reward(db, video.id)
        db.delete(video)
    db.commit()

    if video:
        try:
            r2_service.delete_object(video.r2_key)
        except Exception:
            pass  # R2 deletion failure is non-fatal

    return {"data": {"deleted": post_id}}


@router.post("/merge-audio")
async def merge_audio(
    video_r2_key: str = Form(...),
    audio_duration_sec: int = Form(...),
    audio: UploadFile = File(...),
    current_user: User = Depends(get_active_user),
) -> dict:
    """오디오+비디오 병합 잡을 외부 워커 큐에 등록한다."""
    if not video_r2_key.startswith(f"videos/{current_user.id}/"):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")

    if audio_duration_sec <= 0 or audio_duration_sec > 65:
        raise HTTPException(status_code=400, detail="오디오 길이가 올바르지 않습니다")

    logger.info("merge_audio enqueue: user_id=%s video_r2_key=%s", current_user.id, video_r2_key)

    content_type = audio.content_type or "audio/webm"
    ext = "mp4" if content_type == "audio/mp4" else "webm"
    audio_r2_key = f"audio/{uuid.uuid4()}.{ext}"

    try:
        audio_bytes = await audio.read()
        client = r2_service.get_r2_client()
        client.put_object(
            Bucket=app_settings.r2_bucket_name,
            Key=audio_r2_key,
            Body=audio_bytes,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
    except Exception as e:
        logger.error("오디오 R2 업로드 실패: %s", e)
        raise HTTPException(status_code=500, detail="오디오 업로드에 실패했습니다")

    job_payload = {
        "user_id": current_user.id,
        "video_r2_key": video_r2_key,
        "audio_r2_key": audio_r2_key,
        "audio_duration_sec": audio_duration_sec,
        "audio_content_type": content_type,
    }

    try:
        job_id = enqueue_merge_job(job_payload)
    except Exception as e:
        logger.error("Redis 큐 실패: %s", e)
        raise HTTPException(status_code=500, detail="영상 처리 큐 등록에 실패했습니다")

    return {"data": {"job_id": job_id, "status": "processing"}}


@router.get("/merge-job/{job_id}")
def get_merge_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """merge-audio / merge-proof 잡 상태를 폴링한다."""
    job = get_job_status(job_id)  # 로컬 스토어 → Redis 순 확인, 예외 없음

    if job is None:
        raise HTTPException(status_code=404, detail="잡을 찾을 수 없습니다")
    _assert_job_owner(job, current_user)

    return {
        "data": {
            "job_id": job_id,
            "status": job.get("status", "unknown"),
            "r2_key": job.get("output_r2_key", ""),
            "cdn_url": job.get("cdn_url", ""),
            "proof_image_url": job.get("proof_image_url", ""),
            "error": job.get("error", ""),
        }
    }


ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload-proof")
async def upload_proof_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_active_user),
) -> dict:
    """증거 이미지를 R2에 업로드하고 proof_r2_key를 반환한다."""
    content_type = file.content_type or "image/jpeg"
    if content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 이미지 형식입니다: {content_type}")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="이미지가 너무 큽니다 (최대 10MB)")

    ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else "png"
    proof_r2_key = f"proof/{current_user.id}/{uuid.uuid4()}.{ext}"

    try:
        r2_client = r2_service.get_r2_client()
        r2_client.put_object(
            Bucket=app_settings.r2_bucket_name,
            Key=proof_r2_key,
            Body=image_bytes,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
    except Exception as e:
        logger.error("증거 이미지 R2 업로드 실패: %s", e)
        raise HTTPException(status_code=500, detail="이미지 업로드에 실패했습니다")

    proof_cdn_url = f"{app_settings.r2_public_url.rstrip('/')}/{proof_r2_key}"
    logger.info("upload_proof: user_id=%s key=%s", current_user.id, proof_r2_key)
    return {"data": {"proof_r2_key": proof_r2_key, "proof_cdn_url": proof_cdn_url}}


@router.post("/merge-proof")
def merge_proof(
    video_r2_key: str = Form(...),
    proof_r2_key: str = Form(...),
    current_user: User = Depends(get_active_user),
) -> dict:
    """증거 이미지를 비디오 끝에 3초 슬라이드로 붙인다."""
    if not video_r2_key.startswith(f"videos/{current_user.id}/"):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    if not proof_r2_key.startswith(f"proof/{current_user.id}/"):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")

    logger.info("merge_proof: user_id=%s video=%s proof=%s", current_user.id, video_r2_key, proof_r2_key)
    try:
        job_id = enqueue_image_merge_job(video_r2_key, proof_r2_key, current_user.id)
    except Exception as e:
        logger.error("proof merge 큐 등록 실패: %s", e)
        raise HTTPException(status_code=500, detail="영상 처리에 실패했습니다")
    return {"data": {"job_id": job_id, "status": "processing"}}


# ---------------------------------------------------------------------------
# MQ 방식 전체 업로드 파이프라인
# ---------------------------------------------------------------------------

def _r2_upload_and_enqueue(
    job_id: str,
    video_path: str,
    video_content_type: str,
    video_filename: str,
    audio_path: str | None,
    audio_content_type: str,
    proof_path: str | None,
    proof_content_type: str | None,
    user_id: int,
    duration_sec: int,
    caption: str | None,
    tags_list: list[str],
    challenge_id: int | None,
    workout_start: str | None,
    workout_end: str | None,
    audio_duration_sec: int,
) -> None:
    temp_paths = [p for p in (video_path, audio_path, proof_path) if p]
    try:
        with open(video_path, "rb") as video_file:
            r2_key, _cdn_url = r2_service.upload_fileobj(
                video_file, video_content_type, video_filename, user_id
            )

        audio_r2_key: str | None = None
        if audio_path:
            audio_ext = "mp4" if "mp4" in audio_content_type else "webm"
            with open(audio_path, "rb") as audio_file:
                audio_r2_key, _ = r2_service.upload_fileobj(
                    audio_file, audio_content_type, f"audio.{audio_ext}", user_id
                )

        proof_r2_key: str | None = None
        proof_cdn_url: str | None = None
        if proof_path and proof_content_type:
            ext = "jpg" if "jpeg" in proof_content_type or "jpg" in proof_content_type else "png"
            proof_r2_key = f"proof/{user_id}/{uuid.uuid4()}.{ext}"
            r2_client = r2_service.get_r2_client()
            with open(proof_path, "rb") as proof_file:
                r2_client.put_object(
                    Bucket=app_settings.r2_bucket_name,
                    Key=proof_r2_key,
                    Body=proof_file,
                    ContentType=proof_content_type,
                    CacheControl="public, max-age=31536000, immutable",
                )
            proof_cdn_url = f"{app_settings.r2_public_url.rstrip('/')}/{proof_r2_key}"

        enqueue_full_upload_pipeline(
            job_id=job_id,
            r2_key=r2_key,
            file_hash=r2_key,
            duration_sec=duration_sec,
            caption=caption,
            tags=tags_list,
            challenge_id=challenge_id,
            workout_start=workout_start,
            workout_end=workout_end,
            user_id=user_id,
            audio_r2_key=audio_r2_key,
            audio_duration_sec=audio_duration_sec,
            audio_content_type=audio_content_type,
            proof_r2_key=proof_r2_key,
            proof_cdn_url=proof_cdn_url,
        )
    except Exception as e:
        logger.error("Background R2 upload failed job_id=%s: %s", job_id, e)
        fail_job(job_id, str(e))
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass


@router.post("/upload-pipeline")
async def upload_pipeline(
    file: UploadFile = File(...),
    duration_sec: int = Form(...),
    caption: str | None = Form(None),
    tags: str = Form("[]"),
    challenge_id: int | None = Form(None),
    workout_start: str | None = Form(None),
    workout_end: str | None = Form(None),
    audio: UploadFile | None = File(None),
    audio_duration_sec: int = Form(0),
    proof_image: UploadFile | None = File(None),
    current_user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = ...,
) -> dict:
    """파일 수신 즉시 job_id 반환. R2 업로드 + 처리는 백그라운드에서 실행."""
    if duration_sec < 5 or duration_sec > 60:
        raise HTTPException(status_code=400, detail="5초 이상 60초 이하의 영상만 업로드할 수 있습니다")

    content_type = file.content_type or "video/mp4"
    if content_type not in r2_service.ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식: {content_type}")

    tags_list = _parse_tags(tags)

    if get_daily_upload_count(db, current_user.id) >= DAILY_MAX_UPLOADS:
        raise HTTPException(status_code=429, detail=f"하루 업로드 한도 초과 ({DAILY_MAX_UPLOADS}회/일)")

    video_path, _video_size = await _spool_upload_to_temp(file, r2_service.MAX_FILE_SIZE, "영상")

    audio_path: str | None = None
    audio_content_type = "audio/webm"
    if audio is not None:
        audio_content_type = audio.content_type or "audio/webm"
        audio_path, _audio_size = await _spool_upload_to_temp(audio, r2_service.MAX_FILE_SIZE, "오디오")

    proof_path: str | None = None
    proof_content_type: str | None = None
    if proof_image is not None:
        proof_content_type = proof_image.content_type or "image/jpeg"
        if proof_content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail=f"지원하지 않는 이미지 형식: {proof_content_type}")
        proof_path, _proof_size = await _spool_upload_to_temp(proof_image, MAX_IMAGE_SIZE, "이미지")

    temp_paths = [p for p in (video_path, audio_path, proof_path) if p]
    try:
        # job_id 선점: 응답 전에 Redis에 등록해 폴링 가능하게
        job_id = reserve_job_id(current_user.id)
    except Exception:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass
        raise
    logger.info("upload_pipeline: user_id=%s job_id=%s", current_user.id, job_id)

    background_tasks.add_task(
        _r2_upload_and_enqueue,
        job_id=job_id,
        video_path=video_path,
        video_content_type=content_type,
        video_filename=file.filename or "video.mp4",
        audio_path=audio_path,
        audio_content_type=audio_content_type,
        proof_path=proof_path,
        proof_content_type=proof_content_type,
        user_id=current_user.id,
        duration_sec=duration_sec,
        caption=caption,
        tags_list=tags_list,
        challenge_id=challenge_id,
        workout_start=workout_start,
        workout_end=workout_end,
        audio_duration_sec=audio_duration_sec,
    )

    return {"data": {"job_id": job_id, "status": "processing"}}


@router.get("/upload-job/{job_id}")
def get_upload_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """upload-pipeline 잡 상태 폴링 엔드포인트."""
    job = get_job_status(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="잡을 찾을 수 없습니다")
    _assert_job_owner(job, current_user)

    status = job.get("status", "unknown")
    points_earned = 0.0
    if status == "completed":
        try:
            points_earned = float(job.get("points_earned", "0"))
        except (ValueError, TypeError):
            points_earned = 0.0

    return {
        "data": {
            "job_id": job_id,
            "status": status,
            "pipeline_step": job.get("pipeline_step", ""),
            "cdn_url": job.get("cdn_url", ""),
            "post_id": job.get("post_id", ""),
            "points_earned": points_earned,
            "audio_merge_failed": job.get("audio_merge_failed", "") == "True",
            "error": job.get("error", ""),
        }
    }
