import json
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

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
        raise HTTPException(status_code=400, detail="Unsupported content type")
    if req.file_size > r2_service.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    if db.query(Video).filter(Video.file_hash == req.file_hash).first():
        raise HTTPException(status_code=409, detail="Duplicate video")

    if get_daily_upload_count(db, current_user.id) >= DAILY_MAX_UPLOADS:
        raise HTTPException(status_code=429, detail=f"하루 업로드 한도 초과 ({DAILY_MAX_UPLOADS}회/일)")

    upload_url, r2_key = r2_service.generate_presigned_url(req.content_type, req.filename)
    return {"data": PresignedUrlResponse(upload_url=upload_url, r2_key=r2_key)}


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
    """R2에 업로드된 비디오와 오디오를 서버에서 ffmpeg으로 병합한다."""
    import os
    import subprocess
    import tempfile
    import uuid

    from app.config import settings as app_settings

    logger.info("merge_audio: user_id=%s video_r2_key=%s", current_user.id, video_r2_key)

    tmp_video = tmp_audio = tmp_output = None
    try:
        tmp_video = tempfile.mktemp(suffix=".mp4")
        audio_suffix = ".mp4" if audio.content_type == "audio/mp4" else ".webm"
        tmp_audio = tempfile.mktemp(suffix=audio_suffix)
        tmp_output = tempfile.mktemp(suffix=".mp4")

        if audio_duration_sec <= 0 or audio_duration_sec > 35:
            raise HTTPException(status_code=400, detail="오디오 길이가 올바르지 않습니다")
        audio_duration = float(audio_duration_sec)

        # 오디오 저장
        audio_bytes = await audio.read()
        with open(tmp_audio, "wb") as f:
            f.write(audio_bytes)

        # R2에서 비디오 다운로드
        client = r2_service.get_r2_client()
        response = client.get_object(Bucket=app_settings.r2_bucket_name, Key=video_r2_key)
        with open(tmp_video, "wb") as f:
            f.write(response["Body"].read())

        # ffmpeg: 짧은 영상을 오디오 길이만큼 루프 후 병합.
        # 비디오는 재인코딩하지 않고 원본 스트림을 복사해 업로드된 영상 품질을 보존한다.
        # 녹음 오디오는 MP4 호환을 위해 AAC로만 변환하되 충분한 비트레이트를 명시한다.
        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1",
            "-i", tmp_video,
            "-i", tmp_audio,
            "-t", str(audio_duration),
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "256k",
            "-ar", "48000",
            "-ac", "2",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-movflags", "+faststart",
            tmp_output,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            logger.error("ffmpeg failed: %s", result.stderr.decode())
            raise HTTPException(status_code=500, detail="오디오 병합 실패")

        # 병합된 파일을 R2에 업로드
        merged_key = f"videos/merged-{uuid.uuid4()}.mp4"
        with open(tmp_output, "rb") as f:
            client.put_object(
                Bucket=app_settings.r2_bucket_name,
                Key=merged_key,
                Body=f,
                ContentType="video/mp4",
            )

        cdn_url = r2_service.get_cdn_url(merged_key)
        logger.info("merge_audio: done key=%s duration=%.1fs", merged_key, audio_duration)
        return {"data": {"r2_key": merged_key, "cdn_url": cdn_url, "duration_sec": int(audio_duration)}}

    finally:
        for tmp in [tmp_video, tmp_audio, tmp_output]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
