import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BLINK_GRAPHQL_URL = "https://api.blink.sv/graphql"
HTTP_TIMEOUT = 10.0


def pay_lightning_address(ln_address: str, sats: int) -> dict:
    """Pay a Lightning Address via the Blink API.

    Returns {"success": True/False, "error": None/"message"}.
    """
    # Parse user@domain.com
    parts = ln_address.strip().split("@")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return {"success": False, "error": f"Invalid Lightning Address format: {ln_address}"}

    user, domain = parts[0], parts[1]

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            # Step 1: Resolve LNURL-pay metadata
            lnurlp_url = f"https://{domain}/.well-known/lnurlp/{user}"
            resp = client.get(lnurlp_url)
            resp.raise_for_status()
            meta = resp.json()

            callback = meta.get("callback")
            if not callback:
                return {"success": False, "error": "No callback URL in LNURL-pay response"}

            min_sendable = meta.get("minSendable", 0)
            max_sendable = meta.get("maxSendable", float("inf"))
            amount_msat = sats * 1000

            if amount_msat < min_sendable or amount_msat > max_sendable:
                return {
                    "success": False,
                    "error": (
                        f"Amount {sats} sats out of range "
                        f"[{min_sendable // 1000}, {max_sendable // 1000}] sats"
                    ),
                }

            # Step 2: Fetch BOLT11 invoice
            invoice_resp = client.get(callback, params={"amount": amount_msat})
            invoice_resp.raise_for_status()
            invoice_data = invoice_resp.json()

            payment_request = invoice_data.get("pr")
            if not payment_request:
                return {"success": False, "error": "No invoice (pr) in callback response"}

            # Step 3: Pay via Blink GraphQL
            mutation = (
                "mutation { lnInvoicePaymentSend(input: { "
                f'paymentRequest: "{payment_request}", memo: "workout reward"'
                " }) { status errors { message } } }"
            )
            gql_resp = client.post(
                BLINK_GRAPHQL_URL,
                json={"query": mutation},
                headers={"X-Api-Key": settings.blink_api_key},
            )
            gql_resp.raise_for_status()
            gql_data = gql_resp.json()

            payment_result = (
                gql_data.get("data", {}).get("lnInvoicePaymentSend", {})
            )
            gql_errors = payment_result.get("errors", [])
            if gql_errors:
                messages = "; ".join(e.get("message", "unknown") for e in gql_errors)
                return {"success": False, "error": f"Blink GraphQL errors: {messages}"}

            status = payment_result.get("status", "")
            if status == "SUCCESS":
                return {"success": True, "error": None}

            return {"success": False, "error": f"Payment status: {status}"}

    except httpx.HTTPStatusError as exc:
        return {"success": False, "error": f"HTTP error {exc.response.status_code}: {exc.request.url}"}
    except httpx.TimeoutException:
        return {"success": False, "error": "Request timed out"}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in pay_lightning_address")
        return {"success": False, "error": str(exc)}
