"""Blink(api.blink.sv) GraphQL API 연동.

관리자 테스트 지급뿐 아니라 향후 영상 업로더 자동 지급의 기반이 되므로,
Blink 호출부는 이 모듈 하나로 모은다. 호출부는 예외(BlinkError)만 처리하면 된다.

주의:
- API 키는 절대 로그·예외 메시지·응답에 노출하지 않는다.
- GraphQL 입력은 항상 `variables`로 전달한다(문자열 보간 금지 — 과거 다른 프로젝트에서
  paymentRequest를 f-string으로 직접 mutation에 꽂아 넣어 GraphQL 쿼리 주입이 가능했던
  사고가 있었다. `docs/AUDIT-2026-05-30.md` D-3 참고).
- Blink의 `LnAddressPaymentSendInput`은 2026-09 기준 GraphQL 스키마 확인 결과
  `walletId` / `amount` / `lnAddress` 세 필드만 있고 memo를 지원하지 않는다. 따라서
  `send_to_lightning_address`의 memo 인자는 Blink에는 전달되지 않고 호출부 기록용으로만
  쓰인다(관리자 로그 등).
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 30.0

_WALLETS_QUERY = """
query MeWallets {
  me {
    defaultAccount {
      wallets {
        id
        walletCurrency
        balance
      }
    }
  }
}
"""

_LN_ADDRESS_PAYMENT_SEND_MUTATION = """
mutation LnAddressPaymentSend($input: LnAddressPaymentSendInput!) {
  lnAddressPaymentSend(input: $input) {
    status
    errors {
      code
      message
      path
    }
  }
}
"""


class BlinkError(Exception):
    """Blink 호출 실패를 사람이 읽을 수 있는 메시지로 감싼 예외.

    GraphQL 최상위 errors, 필드 errors, HTTP 오류, 네트워크 오류를 모두 이 예외로
    통일해서 라우트가 하나의 except 절로 처리할 수 있게 한다.
    """


def is_configured() -> bool:
    """BLINK_API_KEY가 설정되어 있는지 여부."""
    return bool(settings.blink_api_key)


def _request(query: str, variables: dict | None = None) -> dict:
    if not settings.blink_api_key:
        raise BlinkError("Blink API 키가 설정되지 않았습니다")

    try:
        response = httpx.post(
            settings.blink_api_url,
            json={"query": query, "variables": variables or {}},
            headers={
                "X-API-KEY": settings.blink_api_key,
                "Content-Type": "application/json",
            },
            timeout=REQUEST_TIMEOUT,
        )
    except httpx.TimeoutException as exc:
        # 요청이 Blink 에 도달한 뒤 응답만 늦었을 수 있다. 실패로 단정하면 관리자가
        # 재전송해 이중 지급이 날 수 있으므로 결과가 불확실하다고 알린다.
        logger.error("Blink API 응답 시간 초과: %s", type(exc).__name__)
        raise BlinkError(
            "Blink 응답 시간이 초과되었습니다. 실제 전송 여부를 Blink 지갑 거래 내역에서 확인한 뒤 재시도하세요"
        ) from exc
    except httpx.HTTPError as exc:
        logger.error("Blink API 요청 실패: %s", type(exc).__name__)
        raise BlinkError("Blink 서버에 연결할 수 없습니다") from exc

    if response.status_code >= 400:
        logger.error("Blink API HTTP 오류: status=%s", response.status_code)
        raise BlinkError(f"Blink API 오류가 발생했습니다 (HTTP {response.status_code})")

    try:
        payload = response.json()
    except ValueError as exc:
        raise BlinkError("Blink API 응답을 해석할 수 없습니다") from exc

    top_level_errors = payload.get("errors")
    if top_level_errors:
        message = _join_error_messages(top_level_errors) or "Blink API 오류가 발생했습니다"
        logger.error("Blink GraphQL 오류: %s", message)
        raise BlinkError(message)

    return payload.get("data") or {}


def _join_error_messages(errors: list) -> str:
    messages = [e.get("message", "") for e in errors if isinstance(e, dict) and e.get("message")]
    return "; ".join(messages)


def get_btc_wallet() -> tuple[str, int]:
    """BTC 지갑의 (wallet_id, balance_sats)를 반환한다.

    BLINK_WALLET_ID가 설정되어 있으면 해당 지갑을 그대로 쓰고, 아니면 지갑 목록에서
    walletCurrency == "BTC"인 첫 지갑을 자동으로 고른다.
    """
    data = _request(_WALLETS_QUERY)
    wallets = (((data.get("me") or {}).get("defaultAccount") or {}).get("wallets")) or []

    if settings.blink_wallet_id:
        for wallet in wallets:
            if wallet.get("id") == settings.blink_wallet_id:
                return wallet["id"], int(wallet["balance"])
        raise BlinkError("설정된 BLINK_WALLET_ID를 지갑 목록에서 찾을 수 없습니다")

    for wallet in wallets:
        if wallet.get("walletCurrency") == "BTC":
            return wallet["id"], int(wallet["balance"])

    raise BlinkError("BTC 지갑을 찾을 수 없습니다")


def send_to_lightning_address(ln_address: str, amount_sats: int, memo: str | None = None) -> str:
    """라이트닝 주소로 sats를 전송하고 Blink가 반환한 상태 문자열을 그대로 돌려준다.

    반환값: "SUCCESS" | "PENDING" | "FAILURE" | "ALREADY_PAID" (Blink PaymentSendResult).
    memo는 Blink API가 지원하지 않아 실제 전송에는 쓰이지 않는다(모듈 docstring 참고).
    """
    del memo  # Blink LnAddressPaymentSendInput 미지원 — 호출부 로깅용으로만 받는다.

    wallet_id, _balance_sats = get_btc_wallet()

    data = _request(
        _LN_ADDRESS_PAYMENT_SEND_MUTATION,
        {"input": {"walletId": wallet_id, "amount": amount_sats, "lnAddress": ln_address}},
    )
    result = data.get("lnAddressPaymentSend") or {}

    field_errors = result.get("errors") or []
    if field_errors:
        message = _join_error_messages(field_errors) or "Blink 결제가 거부되었습니다"
        raise BlinkError(message)

    status = result.get("status")
    if not status:
        raise BlinkError("Blink 응답에서 결제 상태를 확인할 수 없습니다")
    return status
