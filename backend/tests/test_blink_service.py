from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx

from app.services.blink import pay_lightning_address


def test_invalid_ln_address_format() -> None:
    result = pay_lightning_address("notvalid", 1000)
    assert result["success"] is False
    assert "Invalid Lightning Address" in result["error"]


def test_invalid_ln_address_empty_user() -> None:
    result = pay_lightning_address("@domain.com", 500)
    assert result["success"] is False


def test_success_path() -> None:
    mock_lnurlp = MagicMock()
    mock_lnurlp.raise_for_status = MagicMock()
    mock_lnurlp.json.return_value = {
        "callback": "https://domain.com/callback",
        "minSendable": 1000,
        "maxSendable": 100_000_000,
    }

    mock_invoice = MagicMock()
    mock_invoice.raise_for_status = MagicMock()
    mock_invoice.json.return_value = {"pr": "lnbc1234"}

    mock_gql = MagicMock()
    mock_gql.raise_for_status = MagicMock()
    mock_gql.json.return_value = {
        "data": {"lnInvoicePaymentSend": {"status": "SUCCESS", "errors": []}}
    }

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = [mock_lnurlp, mock_invoice]
    mock_client.post.return_value = mock_gql

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 1000)

    assert result["success"] is True
    assert result["error"] is None


def test_no_callback_in_lnurlp() -> None:
    mock_lnurlp = MagicMock()
    mock_lnurlp.raise_for_status = MagicMock()
    mock_lnurlp.json.return_value = {"minSendable": 1000, "maxSendable": 1_000_000}

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.return_value = mock_lnurlp

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 1000)

    assert result["success"] is False
    assert "callback" in result["error"]


def test_amount_out_of_range() -> None:
    mock_lnurlp = MagicMock()
    mock_lnurlp.raise_for_status = MagicMock()
    mock_lnurlp.json.return_value = {
        "callback": "https://domain.com/cb",
        "minSendable": 10_000_000,  # 10000 sats minimum
        "maxSendable": 100_000_000,
    }

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.return_value = mock_lnurlp

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 100)  # 100 sats < 10000 min

    assert result["success"] is False
    assert "out of range" in result["error"]


def test_no_invoice_in_callback() -> None:
    mock_lnurlp = MagicMock()
    mock_lnurlp.raise_for_status = MagicMock()
    mock_lnurlp.json.return_value = {
        "callback": "https://domain.com/cb",
        "minSendable": 1000,
        "maxSendable": 100_000_000,
    }
    mock_invoice = MagicMock()
    mock_invoice.raise_for_status = MagicMock()
    mock_invoice.json.return_value = {}  # no "pr" key

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = [mock_lnurlp, mock_invoice]

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 1000)

    assert result["success"] is False
    assert "pr" in result["error"]


def test_graphql_errors() -> None:
    mock_lnurlp = MagicMock()
    mock_lnurlp.raise_for_status = MagicMock()
    mock_lnurlp.json.return_value = {
        "callback": "https://domain.com/cb",
        "minSendable": 1000,
        "maxSendable": 100_000_000,
    }
    mock_invoice = MagicMock()
    mock_invoice.raise_for_status = MagicMock()
    mock_invoice.json.return_value = {"pr": "lnbc1234"}

    mock_gql = MagicMock()
    mock_gql.raise_for_status = MagicMock()
    mock_gql.json.return_value = {
        "data": {"lnInvoicePaymentSend": {"errors": [{"message": "insufficient funds"}]}}
    }

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = [mock_lnurlp, mock_invoice]
    mock_client.post.return_value = mock_gql

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 1000)

    assert result["success"] is False
    assert "insufficient funds" in result["error"]


def test_http_status_error() -> None:
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    mock_request = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_client.get.side_effect = httpx.HTTPStatusError(
        "404", request=mock_request, response=mock_response
    )

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 1000)

    assert result["success"] is False
    assert "HTTP error 404" in result["error"]


def test_timeout_error() -> None:
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = httpx.TimeoutException("timeout")

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 1000)

    assert result["success"] is False
    assert "timed out" in result["error"]


def test_unexpected_exception() -> None:
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = RuntimeError("unexpected")

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 1000)

    assert result["success"] is False
    assert "unexpected" in result["error"]


def test_payment_non_success_status() -> None:
    mock_lnurlp = MagicMock()
    mock_lnurlp.raise_for_status = MagicMock()
    mock_lnurlp.json.return_value = {
        "callback": "https://domain.com/cb",
        "minSendable": 1000,
        "maxSendable": 100_000_000,
    }
    mock_invoice = MagicMock()
    mock_invoice.raise_for_status = MagicMock()
    mock_invoice.json.return_value = {"pr": "lnbc1234"}

    mock_gql = MagicMock()
    mock_gql.raise_for_status = MagicMock()
    mock_gql.json.return_value = {
        "data": {"lnInvoicePaymentSend": {"status": "PENDING", "errors": []}}
    }

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = [mock_lnurlp, mock_invoice]
    mock_client.post.return_value = mock_gql

    with patch("httpx.Client", return_value=mock_client):
        result = pay_lightning_address("user@domain.com", 1000)

    assert result["success"] is False
    assert "PENDING" in result["error"]
