# Notic Backend

API backend for [Notic](https://getnotic.io): auth, sync, publish, billing, Notion sync, Obsidian export, and image upload. Built with NestJS, Prisma, and PostgreSQL.

## Tech stack

- **Runtime:** Node.js 18+
- **Framework:** [NestJS](https://nestjs.com) 11
- **ORM:** [Prisma](https://www.prisma.io) 7 (PostgreSQL)
- **Auth:** JWT (access + refresh), Google Sign-In
- **Billing:** Lemon Squeezy (subscriptions, webhooks)
- **Storage:** AWS S3 + CloudFront (image uploads)
- **Tests:** Vitest

## Prerequisites

- Node.js 18+
- PostgreSQL (or Supabase/other Postgres host)
- For image uploads: AWS S3 bucket + CloudFront (optional)
- For subscriptions: Lemon Squeezy store (optional)
- For Notion: Notion OAuth app (optional)

## Setup

1. **Clone and install**

   ```bash
   npm install
   ```

2. **Environment**

   Copy env vars into `.env` (no `.env.example` is committed). Required and optional variables are listed below.

3. **Database**

   Set `DATABASE_URL` in `.env`, then run migrations:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate   # dev: creates migration and applies
   # or
   npm run prisma:deploy    # production: applies existing migrations only
   ```

4. **Run**

   ```bash
   npm run start:dev   # development with watch
   npm run start       # single run
   npm run start:prod  # production (node dist/src/main.js)
   ```

   Default port is `3000` (override with `PORT`).

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (e.g. Supabase pooler URL). |
| `JWT_SECRET` | Secret used to sign and verify access and refresh JWTs. |

### Auth (optional)

| Variable | Description | Default |
|----------|-------------|--------|
| `ACCESS_TOKEN_DAYS` | Access token lifetime in days. | 30 |
| `REFRESH_TOKEN_DAYS` | Refresh token lifetime in days. | 90 |

### CORS and clients

| Variable | Description |
|----------|-------------|
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g. `https://getnotic.io,https://www.getnotic.io`). |
| `CHROME_EXTENSION_ID` | Published Chrome extension ID; added to CORS as `chrome-extension://<id>`. Required for extension auth in production. |
| `FRONTEND_URL` | Base URL for frontend (billing redirects, publish share links, Notion OAuth success/error). Default `https://getnotic.io`. |

### Billing (Lemon Squeezy, optional)

| Variable | Description |
|----------|-------------|
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy API key. |
| `LEMONSQUEEZY_STORE_ID` | Store ID. |
| `LEMONSQUEEZY_VARIANT_ID_MONTHLY` | Pro monthly variant ID. |
| `LEMONSQUEEZY_VARIANT_ID_YEARLY` | Pro yearly variant ID. |
| `LEMONSQUEEZY_VARIANT_ID_TRIAL` | Trial variant ID (if used). |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Webhook signing secret (for `POST /billing/webhook`). |
| `LEMONSQUEEZY_TEST_MODE` | `true` or `1` for test mode. |

### Notion (optional)

| Variable | Description |
|----------|-------------|
| `NOTION_OAUTH_REDIRECT_URI` | Backend OAuth callback URL (e.g. `https://api.getnotic.io/notion/oauth/callback`). Must match Notion app config. |

### Image upload (S3 + CloudFront, optional)

| Variable | Description |
|----------|-------------|
| `NOTIC_AWS_REGION` | AWS region for S3. |
| `NOTIC_AWS_ACCESS_KEY_ID` | AWS access key. |
| `NOTIC_AWS_SECRET_ACCESS_KEY` | AWS secret key. |
| `NOTIC_S3_BUCKET_NAME` | S3 bucket name. |
| `NOTIC_CLOUDFRONT_URL` | CloudFront distribution URL (no trailing slash). Used as base for returned image URLs. |

### Other

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` or `production`. Affects CORS defaults, validation error messages, trust proxy. |
| `PORT` | Server port. Default `3000`. |

## Main API surface

- **Auth:** `POST /auth/authenticate`, `POST /auth/refresh`, `POST /auth/billing-link`
- **Sync:** `GET /sync`, `POST /sync` (notes, folders, workspaces; paginated pull, push)
- **Publish:** `POST /publish`, `DELETE /publish`, `GET /p/:code` (public shared note) — Pro only for publish/unpublish
- **Billing:** `GET /billing/status`, `POST /billing/webhook` (Lemon Squeezy)
- **Notion:** `GET /notion/oauth/authorize-url`, `GET /notion/oauth/callback`, `GET /notion/status`, `POST /notion/sync-root`, `POST /notion/sync` — Pro only for sync
- **Export:** `GET /export/obsidian` — Pro only
- **Upload:** `POST /upload/image` (multipart; returns CloudFront URL)

Clients use `Authorization: Bearer <accessToken>` for protected routes. 402 Payment Required is returned for Pro-gated endpoints when the user is not on a Pro plan.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | `prisma generate` + `nest build`. |
| `npm run start` | Start app (single run). |
| `npm run start:dev` | Start with watch. |
| `npm run start:prod` | Run production build: `node dist/src/main.js`. |
| `npm run test` | Run unit tests (Vitest). |
| `npm run test:watch` | Vitest watch mode. |
| `npm run test:cov` | Vitest with coverage. |
| `npm run prisma:generate` | Generate Prisma client. |
| `npm run prisma:migrate` | Create and apply migration (dev). |
| `npm run prisma:deploy` | Apply migrations only (CI/production). |
| `npm run lint` | ESLint. |
| `npm run format` | Prettier. |

## Project structure

- `src/` — NestJS app: auth, billing, sync, publish, notion, export, upload, guards, repositories.
- `prisma/schema/` — Prisma schema (multi-file). `prisma/migrations/` — migrations.
- `.ai-docs/` — Design and implementation notes (see repo root).

## Docs

- Auth flow and env: `.ai-docs/auth-setup.md`
- Prisma migrations: `.ai-docs/prisma-migrations.md`
- Other feature and design notes: `.ai-docs/*.md`

## License

UNLICENSED (private).
