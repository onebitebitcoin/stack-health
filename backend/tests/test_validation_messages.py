from app.main import _validation_error_message


def test_validation_message_fallbacks_are_user_friendly() -> None:
    assert _validation_error_message([]) == "입력값을 다시 확인해주세요."
    assert _validation_error_message([{"loc": ["body", "password"], "type": "string_too_long", "msg": "String should have at most 100 characters"}]) == "비밀번호는 100자 이하로 입력해주세요."
    assert _validation_error_message([{"loc": ["body", "username"], "type": "string_too_short", "msg": "String should have at least 2 characters"}]) == "닉네임은 2자 이상 입력해주세요."
    assert _validation_error_message([{"loc": ["body", "username"], "type": "string_too_long", "msg": "String should have at most 30 characters"}]) == "닉네임은 30자 이하로 입력해주세요."
    assert _validation_error_message([{"loc": ["body", "caption"], "type": "missing", "msg": "Field required"}]) == "내용을(를) 입력해주세요."
    assert _validation_error_message([{"loc": ["body", "title"], "type": "string_too_short", "msg": "too short"}]) == "제목이(가) 너무 짧습니다."
    assert _validation_error_message([{"loc": ["body", "title"], "type": "string_too_long", "msg": "too long"}]) == "제목이(가) 너무 깁니다."
    assert _validation_error_message([{"loc": ["body", "unknown"], "type": "unknown", "msg": "raw internal detail"}]) == "입력값을(를) 다시 확인해주세요."


def test_unhandled_exception_response_hides_internal_error(monkeypatch) -> None:
    import asyncio
    from types import SimpleNamespace

    from app import main as main_module

    monkeypatch.setattr(main_module, "notify_backend_error", lambda exc, context: None)
    request = SimpleNamespace(method="GET", url=SimpleNamespace(path="/boom"))
    response = asyncio.run(main_module.unhandled_exception_handler(request, RuntimeError("secret stack trace")))

    assert response.status_code == 500
    assert b"secret stack trace" not in response.body
    assert "서버 오류가 발생했습니다" in response.body.decode()
