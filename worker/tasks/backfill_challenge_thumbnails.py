"""챌린지 중 image_thumb_url이 null인 것들의 썸네일을 일괄 생성한다.

Usage:
    cd worker && python -m tasks.backfill_challenge_thumbnails
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


def run_backfill() -> None:
    from app.models.challenge import Challenge

    connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
    Session = sessionmaker(bind=engine)
    db = Session()
    r2 = _get_r2_client()

    try:
        challenges = (
            db.query(Challenge)
            .filter(
                Challenge.image_url.isnot(None),
                Challenge.image_thumb_url.is_(None),
            )
            .all()
        )
        logger.info("썸네일 없는 챌린지 %d개 발견", len(challenges))

        success = 0
        failed = 0
        cache_ctrl = "public, max-age=31536000, immutable"

        for challenge in challenges:
            try:
                # image_url → R2 key
                r2_key = challenge.image_url.replace(R2_PUBLIC_URL + "/", "", 1)

                resp = r2.get_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
                raw = resp["Body"].read()

                img = Image.open(io.BytesIO(raw)).convert("RGB")
                thumb = img.resize((200, 200), Image.LANCZOS)
                thumb_buf = io.BytesIO()
                thumb.save(thumb_buf, format="JPEG", quality=70, optimize=True)
                thumb_buf.seek(0)

                # thumb key: challenges/{uuid}.jpg → challenges/{uuid}_thumb.jpg
                if r2_key.lower().endswith(".jpg") or r2_key.lower().endswith(".jpeg"):
                    base = r2_key.rsplit(".", 1)[0]
                    thumb_key = f"{base}_thumb.jpg"
                else:
                    thumb_key = f"{r2_key}_thumb.jpg"

                r2.put_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=thumb_key,
                    Body=thumb_buf,
                    ContentType="image/jpeg",
                    CacheControl=cache_ctrl,
                )

                challenge.image_thumb_url = f"{R2_PUBLIC_URL}/{thumb_key}"
                db.commit()
                logger.info("challenge_id=%d: 썸네일 생성 완료 → %s", challenge.id, thumb_key)
                success += 1

            except Exception as e:
                db.rollback()
                logger.warning("challenge_id=%d: 썸네일 생성 실패 — %s", challenge.id, e)
                failed += 1

        logger.info("완료 — 성공: %d, 실패: %d", success, failed)
    finally:
        db.close()


if __name__ == "__main__":
    run_backfill()
