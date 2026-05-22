import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.post import Post
from app.models.video import Video
from app.routes.auth import get_current_user
from app.models.user import User
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
)

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
        raise HTTPException(status_code=400, detail="File too large (max 200MB)")

    # Duplicate hash check
    if db.query(Video).filter(Video.file_hash == req.file_hash).first():
        raise HTTPException(status_code=409, detail="Duplicate video")

    # Daily upload limit
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
    if req.duration_sec < 10 or req.duration_sec > 60:
        raise HTTPException(status_code=400, detail="Duration must be 10-60 seconds")

    # Validate tags
    tags = req.tags or []
    invalid = [t for t in tags if t not in ALLOWED_TAGS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid tags: {invalid}")

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
        db.delete(video)
    db.commit()

    if video:
        try:
            r2_service.delete_object(video.r2_key)
        except Exception:
            pass  # R2 deletion failure is non-fatal

    return {"data": {"deleted": post_id}}
