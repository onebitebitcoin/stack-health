"""기존 포스트 중 thumbnail_url이 null인 것들의 썸네일을 일괄 생성한다.

Usage:
    cd worker && python -m tasks.backfill_thumbnails
"""
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import DATABASE_URL
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from tasks.full_pipeline import _extract_thumbnail, _get_r2_client
from config import R2_PUBLIC_URL

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def run_backfill() -> None:
    from app.models.post import Post
    from app.models.video import Video

    connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
    Session = sessionmaker(bind=engine)
    db = Session()
    r2 = _get_r2_client()

    try:
        posts = (
            db.query(Post)
            .join(Post.video)
            .filter(Post.thumbnail_url.is_(None))
            .all()
        )
        logger.info("썸네일 없는 포스트 %d개 발견", len(posts))

        success = 0
        failed = 0
        for post in posts:
            video = db.query(Video).filter(Video.id == post.video_id).first()
            if not video:
                logger.warning("post_id=%d: video 없음, 건너뜀", post.id)
                failed += 1
                continue

            thumb_key = _extract_thumbnail(r2, video.r2_key)
            if thumb_key:
                post.thumbnail_url = f"{R2_PUBLIC_URL}/{thumb_key}"
                db.commit()
                logger.info("post_id=%d: 썸네일 생성 완료 → %s", post.id, thumb_key)
                success += 1
            else:
                logger.warning("post_id=%d: 썸네일 추출 실패", post.id)
                failed += 1

        logger.info("완료 — 성공: %d, 실패: %d", success, failed)
    finally:
        db.close()


if __name__ == "__main__":
    run_backfill()
