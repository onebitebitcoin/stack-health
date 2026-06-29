"""친구 초대용 referral_code 생성 유틸 (보상 없음 — 링크/집계 전용)."""

from __future__ import annotations

import secrets

from sqlalchemy.orm import Session

from app.models.user import User

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 혼동 문자(0/O,1/I,L) 제외
_CODE_LEN = 8


def _random_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LEN))


def generate_referral_code(db: Session, max_attempts: int = 10) -> str:
    """DB에서 유일한 referral_code를 생성한다. 충돌 시 재시도."""
    for _ in range(max_attempts):
        code = _random_code()
        if db.query(User.id).filter(User.referral_code == code).first() is None:
            return code
    # 극히 드문 연속 충돌 — 길이를 늘려 보장
    return _random_code() + secrets.choice(_ALPHABET) + secrets.choice(_ALPHABET)
