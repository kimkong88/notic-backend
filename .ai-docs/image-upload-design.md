# Image upload – backend and extension design

## Backend: image upload endpoint (done)

- **Endpoint:** `POST /upload/image`
- **Auth:** Required (`Authorization: Bearer <token>`).
- **Body:** `multipart/form-data` with field name **`file`** (image file).
- **Response:** `{ "url": "https://<cloudfront>/images/YYYY/MM/DD/..." }` (CloudFront URL).

### Env vars (notic-backend)

| Variable | Description |
|----------|-------------|
| `NOTIC_AWS_REGION` | AWS region (default: `us-east-1`) |
| `NOTIC_AWS_ACCESS_KEY_ID` | AWS access key for S3 |
| `NOTIC_AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `NOTIC_S3_BUCKET_NAME` | S3 bucket name |
| `NOTIC_CLOUDFRONT_URL` | CloudFront distribution URL (no trailing slash) |

If S3/CloudFront env vars are missing, the service logs a warning and returns 400 for upload requests.

### Limits

- **Types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`.
- **Size:** 10 MB max per file.

### S3 key format

`images/YYYY/MM/DD/<timestamp>-<random>-<sanitized-name>.<ext>`

(Returned URL uses `NOTIC_CLOUDFRONT_URL` as base.)

---

## Extension (notic): image support – to implement

Three ways to add images in the editor (dashboard + PiP):

1. **Paste from clipboard** – Paste image (e.g. screenshot) → upload to backend → insert `![alt](cloudfrontUrl)` or Lexical image node.
2. **Drag & drop file** – Drag image file onto PiP or dashboard editor → upload → insert image.
3. **Insert by URL** – User provides URL (or paste URL) → insert image (no upload; optional validation).

### Suggested flow

1. **Backend:** Use existing `POST /upload/image` (form field `file`) with auth token.
2. **Extension API client:** Add `uploadImage(file: File): Promise<{ url: string }>` that POSTs to backend with `Authorization` and `FormData` with key `file`.
3. **Lexical:** Add `ImageNode` (or use link + markdown image) and:
   - **Paste:** Handle `PASTE_COMMAND`; if clipboard has image, upload then insert.
   - **Drop:** Handle `dragover`/`drop` on editor root; if file is image, upload then insert.
   - **URL:** Toolbar or slash command “Insert image” → prompt for URL → insert `![...](url)` or image node.
4. **Markdown:** Store as `![alt](url)` so sync/export stay markdown-compatible.

### Reference

- **project-blue-backend:** `src/common/services/s3.service.ts` – `uploadImageBuffer`; CloudFront URL = `${CLOUDFRONT_URL}/${key}`.
- **project-blue-client:** `src/app/api/s3/upload/route.ts` (Next.js API route), `src/libs/utils/images.ts` – `uploadImageToS3` (FormData POST).
