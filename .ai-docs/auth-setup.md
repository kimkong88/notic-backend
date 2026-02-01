# Auth setup (vs my-saju-backend)

## Comparison

| Aspect | my-saju-backend | note-light-backend |
|--------|-----------------|---------------------|
| **Providers** | Google + Apple | Google only |
| **Model** | Account (platform, email) → many Users | Single User per Google (email, platform) |
| **Flow** | Optional auth: ghost user can link to account on sign-up | Simple: POST token → find or create User → return tokens |
| **Access token** | `JWT_EXPIRATION_TIME_HOURS` (env) | `ACCESS_TOKEN_DAYS` (default **30 days**) |
| **Refresh token** | `REFRESH_TOKEN_EXPIRATION_TIME_DAYS` (env) | `REFRESH_TOKEN_DAYS` (default **90 days**) |
| **Guards** | AuthGuard, OptionalAuthGuard | Same (user-only context) |
| **Endpoints** | `POST /auth/authenticate`, `POST /auth/refresh` | Same |

## Env vars

- `JWT_SECRET` – used to sign/verify access and refresh JWTs.
- `ACCESS_TOKEN_DAYS` – optional; access token lifetime in days (default 30).
- `REFRESH_TOKEN_DAYS` – optional; refresh token lifetime in days (default 90).

## Client flow

1. Frontend uses Google Sign-In, gets ID token.
2. `POST /auth/authenticate` with body: `{ "token": "<google-id-token>", "provider": "google" }`.
3. Response: `{ user, tokens: { access: { token, expires }, refresh: { token, expires } }, action: "sign_in" | "sign_up" }`.
4. Use `Authorization: Bearer <access.token>` on protected routes.
5. When access expires, `POST /auth/refresh` with `{ "refreshToken": "<refresh.token>" }` to get new tokens.
