# Notion API contract (extension / frontend)

Reference for wiring the Notion integration in the extension or any frontend. Backend base URL: `API_BASE` (e.g. `https://api.getnotic.io` or `http://localhost:3000`).

All Notion endpoints except the OAuth callback require **Authentication**: send the same Bearer token used for sync/auth:

```http
Authorization: Bearer <access_token>
```

---

## 1. Connect Notion (OAuth)

**Flow:** User clicks “Connect Notion” → open OAuth URL in browser → user authorizes in Notion → Notion redirects to backend callback → backend redirects to frontend with query params.

### Get OAuth URL and open in browser

- **Endpoint:** `GET {API_BASE}/notion/oauth/authorize-url`
- **Auth:** Required (Bearer).
- **Response (200):** `{ "url": "<notion-oauth-url>" }`.

**Extension implementation:** Call this endpoint, parse the JSON, and open `url` in the user’s browser (e.g. `chrome.tabs.create({ url })` or `vscode.env.openExternal(uri)`):

```ts
const res = await fetch(`${API_BASE}/notion/oauth/authorize-url`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { url } = await res.json();
if (url) openExternal(url);
```

**Alternative:** `GET {API_BASE}/notion/oauth/authorize` (same auth) returns 302 with `Location: <notion-oauth-url>`. Use `fetch(..., { redirect: 'manual' })` and read the `Location` header if you prefer not to use the JSON endpoint.

### After user authorizes (OAuth callback)

Notion redirects to the backend; the backend exchanges the code, stores the connection, then redirects to the frontend. **Redirect URLs:**

- **Success:** `{FRONTEND_URL}/settings?notion=connected`
- **Error:** `{FRONTEND_URL}/settings?notion=error&error={message}`  
  (e.g. `missing_code_or_state`, `invalid_state`, or Notion’s `error` param)

The extension/frontend should:

1. When showing Settings (or Integrations), read `?notion=connected` or `?notion=error&error=...` from the URL (e.g. if the app is a web app that loads at `/settings` after redirect).
2. If `notion=connected`: show success, then call **GET /notion/status** to refresh connection status.
3. If `notion=error`: show the `error` query param to the user and optionally clear it from the URL.

**Note:** `FRONTEND_URL` is set on the backend (env `FRONTEND_URL`, default `https://getnotic.io`). For the extension, the “frontend” may be a webview or a page that the user is redirected to after OAuth; ensure that page can read the query params and show status.

---

## 2. Connection status

- **Endpoint:** `GET {API_BASE}/notion/status`
- **Auth:** Required (Bearer).
- **Response (200):**

```ts
{
  connected: boolean;
  notionWorkspaceId?: string;
  notionWorkspaceName?: string | null;
  syncRootPageId?: string | null;
  lastSyncAt?: string | null;  // ISO date string, e.g. "2025-01-29T12:00:00.000Z"
}
```

Use this to show “Connected to {notionWorkspaceName}”, “Sync root set” / “Set sync page”, and “Last synced: …”.

---

## 3. Set sync root page

User chooses the Notion page under which workspaces/folders/notes will be synced (paste page URL or page ID).

- **Endpoint:** `POST {API_BASE}/notion/sync-root`
- **Auth:** Required (Bearer).
- **Body:**

```json
{ "syncRootPageIdOrUrl": "<Notion page ID or full page URL>" }
```

- **Response (200):** Same shape as **GET /notion/status** (or a simple success message; see implementation).

The backend accepts a Notion page UUID or a URL like `https://www.notion.so/My-Page-abc123...` and parses the page ID.

---

## 4. Sync to Notion (manual)

Trigger a one-way sync: push current workspaces, folders, and notes to Notion (under the sync root).

- **Endpoint:** `POST {API_BASE}/notion/sync`
- **Auth:** Required (Bearer).
- **Body:** None.
- **Response (200):** Implementation-defined (e.g. `{ success: true }` or status with `lastSyncAt`). On failure (e.g. no sync root, Notion API error), the backend returns an error (4xx/5xx).

After a successful sync, call **GET /notion/status** again to update “Last synced at” in the UI.

---

## 5. Summary for extension UI

| Action              | Backend call                          | Then |
|---------------------|----------------------------------------|------|
| Connect Notion      | GET /notion/oauth/authorize (Bearer), open `Location` in browser | User completes OAuth; page loads with `?notion=connected` or `?notion=error&error=...` → refresh status |
| Show status         | GET /notion/status                     | Display connected, workspace name, sync root, lastSyncAt |
| Set sync page       | POST /notion/sync-root with body       | Refresh status |
| Sync to Notion      | POST /notion/sync                     | Refresh status (or show “Last synced” from response) |

See also: [notion-integration-evaluation.md](notion-integration-evaluation.md) (same directory) for design and env vars.
