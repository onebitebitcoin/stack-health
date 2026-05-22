from __future__ import annotations

from fastapi.testclient import TestClient


def test_register_success(client: TestClient) -> None:
    res = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123",
    })
    assert res.status_code == 200
    data = res.json()["data"]
    assert "access_token" in data
    assert data["user"]["email"] == "test@example.com"
    assert data["user"]["username"] == "testuser"


def test_register_duplicate_email(client: TestClient) -> None:
    payload = {"email": "dup@example.com", "username": "user1", "password": "pw"}
    client.post("/api/v1/auth/register", json=payload)
    res = client.post("/api/v1/auth/register", json={**payload, "username": "user2"})
    assert res.status_code == 400


def test_login_success(client: TestClient) -> None:
    client.post("/api/v1/auth/register", json={
        "email": "login@example.com", "username": "loginuser", "password": "secret",
    })
    res = client.post("/api/v1/auth/login", json={
        "email": "login@example.com", "password": "secret",
    })
    assert res.status_code == 200
    assert "access_token" in res.json()["data"]


def test_login_wrong_password(client: TestClient) -> None:
    client.post("/api/v1/auth/register", json={
        "email": "pw@example.com", "username": "pwuser", "password": "correct",
    })
    res = client.post("/api/v1/auth/login", json={
        "email": "pw@example.com", "password": "wrong",
    })
    assert res.status_code == 401


def test_get_me_valid_token(client: TestClient) -> None:
    reg = client.post("/api/v1/auth/register", json={
        "email": "me@example.com", "username": "meuser", "password": "pw",
    })
    token = reg.json()["data"]["access_token"]
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["data"]["email"] == "me@example.com"


def test_get_me_no_token(client: TestClient) -> None:
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 403  # HTTPBearer returns 403 when no credentials


def test_patch_me_lightning_address(client: TestClient) -> None:
    reg = client.post("/api/v1/auth/register", json={
        "email": "ln@example.com", "username": "lnuser", "password": "pw",
    })
    token = reg.json()["data"]["access_token"]
    res = client.patch(
        "/api/v1/auth/me",
        json={"lightning_address": "lnuser@walletofsatoshi.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["lightning_address"] == "lnuser@walletofsatoshi.com"


def test_password_not_stored_plaintext(client: TestClient) -> None:
    from app.models.user import User

    client.post("/api/v1/auth/register", json={
        "email": "hash@example.com", "username": "hashuser", "password": "mypassword",
    })

    # Directly query DB to verify bcrypt hash
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine("sqlite:///./test.db", connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine)
    with Session() as s:
        user = s.query(User).filter(User.email == "hash@example.com").first()
        assert user is not None
        assert user.password_hash != "mypassword"
        assert user.password_hash.startswith("$2b$")
