import json
import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.database import get_db
from app.models.post import Post
from app.models.user import User
from app.models.video import Video
from app.routes.auth import get_current_user
from app.routes.challenges import increment_challenge_upload
from app.schemas.video import (
    ConfirmUploadRequest,
    PostSchema,
    PresignedUrlRequest,
    PresignedUrlResponse,
)
from app.services import r2 as r2_service
from app.services.job_queue import enqueue_merge_job, enqueue_merge_job_local, get_job_status
from app.services.reward import (
    DAILY_MAX_UPLOADS,
    POINTS_PER_UPLOAD,
    add_points,
    get_daily_upload_count,
    revoke_queued_upload_reward,
)

logger = logging.getLogger(__name__)

ALLOWED_TAGS = {"홈트", "러닝", "요가", "웨이트", "기타"}

router = APIRouter(prefix="/api/v1/videos", tags=["videos"])


@router.post("/presigned-url")
def get_presigned_url(
    req: PresignedUrlRequest,
    current_user: User = Depends(get_current_user),
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

    if db.query(Video).filter(Video.file_hash == req.file_hash).first():
        raise HTTPException(status_code=409, detail="Duplicate video")

    if get_daily_upload_count(db, current_user.id) >= DAILY_MAX_UPLOADS:
        raise HTTPException(status_code=429, detail=f"하루 업로드 한도 초과 ({DAILY_MAX_UPLOADS}회/일)")

    upload_url, r2_key = r2_service.generate_presigned_url(req.content_type, req.filename)
    return {"data": PresignedUrlResponse(upload_url=upload_url, r2_key=r2_key)}


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    file_hash: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Server-side upload: receives file from browser, streams to R2.

    Avoids CORS preflight issues on Android/mobile.
    """
    content_type = file.content_type or "video/mp4"
    if content_type not in r2_service.ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다: {content_type}")

    if db.query(Video).filter(Video.file_hash == file_hash).first():
        raise HTTPException(status_code=409, detail="Duplicate video")

    if get_daily_upload_count(db, current_user.id) >= DAILY_MAX_UPLOADS:
        raise HTTPException(status_code=429, detail=f"하루 업로드 한도 초과 ({DAILY_MAX_UPLOADS}회/일)")

    logger.info("upload_video: user_id=%s filename=%s content_type=%s", current_user.id, file.filename, content_type)
    r2_key, cdn_url = r2_service.upload_fileobj(file.file, content_type, file.filename or "video.mp4")
    return {"data": {"r2_key": r2_key, "cdn_url": cdn_url}}


@router.post("/confirm")
def confirm_upload(
    req: ConfirmUploadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if req.duration_sec < 5 or req.duration_sec > 30:
        raise HTTPException(status_code=400, detail="Duration must be 5-30 seconds")

    # Validate tags
    tags = req.tags or []
    invalid = [t for t in tags if t not in ALLOWED_TAGS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid tags: {invalid}")

    if get_daily_upload_count(db, current_user.id) >= DAILY_MAX_UPLOADS:
        raise HTTPException(status_code=429, detail=f"하루 업로드 한도 초과 ({DAILY_MAX_UPLOADS}회/일)")

    cdn_url = r2_service.get_cdn_url(req.r2_key)

    video = Video(
        user_id=current_user.id,
        r2_key=req.r2_key,
        cdn_url=cdn_url,
        file_hash=req.file_hash or req.r2_key,
        duration_sec=req.duration_sec,
    )
    db.add(video)
    db.flush()

    post = Post(
        video_id=video.id,
        user_id=current_user.id,
        caption=req.caption,
        tags=json.dumps(tags, ensure_ascii=False),
    )
    db.add(post)
    db.flush()

    if req.challenge_id:
        increment_challenge_upload(db, current_user.id, req.challenge_id)

    rp = add_points(db, current_user.id, POINTS_PER_UPLOAD, "upload", reference_id=video.id, early_adopter_bonus=(current_user.id <= 50))
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
    )
    return {"data": {"post": post_schema, "points_earned": points_earned}}


@router.get("/my-posts")
def my_posts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    posts = (
        db.query(Post)
        .join(Post.video)
        .filter(Post.user_id == current_user.id, Video.status == "active")
        .order_by(Post.created_at.desc())
        .all()
    )
    result = []
    for post in posts:
        tags_raw = post.tags or "[]"
        try:
            tags = json.loads(tags_raw)
        except (json.JSONDecodeError, TypeError):
            tags = []
        result.append(
            PostSchema(
                id=post.id,
                video_id=post.video_id,
                user_id=post.user_id,
                caption=post.caption,
                tags=tags,
                like_count=post.like_count,
                view_count=post.view_count,
                comment_count=0,
                created_at=post.created_at,
                cdn_url=post.video.cdn_url,
                username=current_user.username,
            )
        )
    return {"data": {"posts": result}}


@router.delete("/posts/{post_id}")
def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")

    video = db.query(Video).filter(Video.id == post.video_id).first()

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
    current_user: User = Depends(get_current_user),
) -> dict:
    """오디오+비디오 병합 잡을 외부 워커 큐에 등록한다."""
    if audio_duration_sec <= 0 or audio_duration_sec > 35:
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
        # Redis 불가 → Railway 서버에서 직접 ffmpeg 처리 (fallback)
        logger.warning("Redis 큐 실패 (%s) — 로컬 fallback 처리", type(e).__name__)
        try:
            job_id = enqueue_merge_job_local(job_payload)
        except Exception as fb_err:
            logger.error("로컬 fallback 실패: %s", fb_err)
            raise HTTPException(status_code=500, detail="영상 처리에 실패했습니다")

    return {"data": {"job_id": job_id, "status": "processing"}}


@router.get("/merge-job/{job_id}")
def get_merge_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """merge-audio 잡 상태를 폴링한다."""
    job = get_job_status(job_id)  # 로컬 스토어 → Redis 순 확인, 예외 없음

    if job is None:
        raise HTTPException(status_code=404, detail="잡을 찾을 수 없습니다")

    return {
        "data": {
            "job_id": job_id,
            "status": job.get("status", "unknown"),
            "r2_key": job.get("output_r2_key", ""),
            "cdn_url": job.get("cdn_url", ""),
            "error": job.get("error", ""),
        }
    }
