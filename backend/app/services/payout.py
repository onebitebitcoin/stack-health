"""비트코인 지급 더미 모듈.

실제 Lightning 지급 연동(Blink)은 제거되었다. 이 모듈은 네트워크 호출 없이 가짜 결과만
돌려주며, 실제 sats는 어디로도 전송되지 않는다. 실지급 연동을 다시 붙일 때 이 모듈의
함수 시그니처를 유지하면 호출부(관리자 테스트 지급)를 그대로 쓸 수 있다.
"""

from __future__ import annotations

import uuid

from app.config import settings


class PayoutError(Exception):
    """지급 입력이 올바르지 않을 때 발생하는 예외."""


def get_status() -> dict:
    """더미 모드 상태. 지갑 정보는 없다."""
    return {
        "dummy": True,
        "configured": True,
        "wallet_id": None,
        "balance_sats": None,
        "max_test_sats": settings.payout_test_max_sats,
        "error": None,
    }


def send_to_lightning_address(ln_address: str, amount_sats: int, memo: str | None = None) -> dict:
    """입력을 검증하고 가짜 지급 결과를 반환한다. 실제 전송은 하지 않는다."""
    del ln_address, memo  # 더미 모드에서는 기록 외에 쓰이지 않는다.
    if amount_sats < 1 or amount_sats > settings.payout_test_max_sats:
        raise PayoutError(f"금액은 1~{settings.payout_test_max_sats} sats 사이여야 합니다")
    return {
        "status": "DUMMY",
        "payment_hash": f"dummy-{uuid.uuid4().hex}",
        "sats": amount_sats,
    }
