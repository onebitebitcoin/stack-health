"""기존 포스트 썸네일의 두 가지 문제를 수정한다:
1. CacheControl 헤더 누락 → R2 copy_object로 메타데이터 패치
2. 30KB 초과 썸네일 → Pillow 재압축 후 같은 key로 덮어쓰기

Usage:
    cd worker && python -m tasks.fix_thumbnail_metadata
"""
import io
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import DATABASE_URL, R2_BUCKET_NAME, R2_PUBLIC_URL
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from PIL import Image

from tasks.full_pipeline import _get_r2_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

CACHE_CTRL = "public, max-age=31536000, immutable"
SIZE_LIMIT = 30 * 1024  # 30KB


def _r2_key(url: str) -> str:
    return url.replace(R2_PUBLIC_URL + "/", "", 1)


def _patch_cache_control(r2, key: str) -> None:
    """copy_object로 CacheControl 메타데이터를 추가한다 (데이터 재전송 없음)."""
    r2.copy_object(
        Bucket=R2_BUCKET_NAME,
        CopySource={"Bucket": R2_BUCKET_NAME, "Key": key},
        Key=key,
        MetadataDirective="REPLACE",
        ContentType="image/jpeg",
        CacheControl=CACHE_CTRL,
    )


def _recompress(r2, key: str) -> None:
    """기존 썸네일을 다운로드 → Pillow 30KB 재압축 → 같은 key로 덮어쓰기."""
    resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=key)
    raw = resp["Body"].read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    buf = io.BytesIO()
    for quality in (75, 60, 50):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        if buf.tell() <= SIZE_LIMIT:
            break
    buf.seek(0)
    r2.put_object(
        Bucket=R2_BUCKET_NAME,
        Key=key,
        Body=buf,
        ContentType="image/jpeg",
        CacheControl=CACHE_CTRL,
    )


def run_fix() -> None:
    from app.models.post import Post

    connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
    Session = sessionmaker(bind=engine)
    db = Session()
    r2 = _get_r2_client()

    try:
        posts = db.query(Post).filter(Post.thumbnail_url.isnot(None)).all()
        logger.info("썸네일 있는 포스트 %d개 검사", len(posts))

        cache_fixed = 0
        size_fixed = 0
        ok = 0

        for post in posts:
            key = _r2_key(post.thumbnail_url)
            try:
                meta = r2.head_object(Bucket=R2_BUCKET_NAME, Key=key)
                has_cache = bool(meta.get("CacheControl"))
                size = meta.get("ContentLength", 0)

                if size > SIZE_LIMIT:
                    logger.info("post_id=%d: %dKB 초과 → 재압축 (cache=%s)",
                                post.id, size // 1024, has_cache)
                    _recompress(r2, key)
                    size_fixed += 1
                elif not has_cache:
                    logger.info("post_id=%d: CacheControl 누락 → 패치", post.id)
                    _patch_cache_control(r2, key)
                    cache_fixed += 1
                else:
                    ok += 1

            except Exception as e:
                logger.warning("post_id=%d: 처리 실패 — %s", post.id, e)

        logger.info("완료 — 정상: %d, 캐시패치: %d, 재압축: %d", ok, cache_fixed, size_fixed)
    finally:
        db.close()


if __name__ == "__main__":
    run_fix()
