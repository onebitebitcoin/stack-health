## Handoff: team-plan → team-exec

- **Decided**: 
  - Google OAuth: backend redirect flow (GET /auth/google → Google → GET /auth/google/callback → JWT → redirect frontend /?google_token=xxx)
  - LNAuth: challenge-response with polling (POST /auth/lnauth/challenge → LNURL QR → wallet callback GET /auth/lnauth → verify GET /auth/lnauth/verify → JWT)
  - Email login: keep as-is, shown as collapsible option
  - User.email: nullable=True (LNAuth users have no email)
  - User.password_hash: nullable=True (OAuth users have no password)
  - New fields on users: oauth_provider (nullable string), oauth_sub (nullable string)
  - New table: lnauth_challenges (k1 PK, pubkey nullable, verified bool, created_at)

- **Rejected**: 
  - Popup OAuth (redirect simpler, more compatible)
  - Separate registration for OAuth (auto create on first login)
  - Storing LNAuth token in DB (use polling with k1 as key)

- **API Contract**:
  - GET /api/v1/auth/google → 302 redirect to Google consent
  - GET /api/v1/auth/google/callback?code=xxx → find/create user → redirect to {FRONTEND_URL}/?google_token=JWT
  - GET /api/v1/auth/lnauth/challenge → {k1, lnurl} (lnurl is bech32 LNURL string for QR)
  - GET /api/v1/auth/lnauth?tag=login&k1=xxx → {tag, k1, action, callback} (wallet metadata)
  - GET /api/v1/auth/lnauth?tag=login&k1=xxx&sig=xxx&key=xxx → {status: "OK"} (wallet callback)
  - GET /api/v1/auth/lnauth/verify?k1=xxx → {verified: bool, token?: string}

- **New env vars needed**: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_BASE_URL (e.g. https://yourapp.railway.app), FRONTEND_URL (e.g. http://localhost:5173 in dev)

- **Packages**: coincurve (secp256k1), bech32 (LNURL encoding), httpx already installed

- **Files**:
  - backend/app/models/user.py (email nullable, password_hash nullable, oauth fields)
  - backend/app/models/challenge.py (new LNAuthChallenge model in new file lnauth_challenge.py)
  - backend/app/services/google_oauth.py (new)
  - backend/app/services/lnauth.py (new)
  - backend/app/routes/auth.py (add Google + LNAuth routes)
  - backend/app/config.py (new env vars)
  - backend/app/models/__init__.py (import LNAuthChallenge)
  - Alembic migration (batch mode for SQLite compat)
  - frontend/src/pages/LoginPage.tsx (redesign)
  - frontend/src/App.tsx (handle ?google_token= on mount)

- **Remaining**: Workers implement, run migration, install packages, run tests
