# Publish & Share – ideal path and UI/UX flow

Lightweight Notion-style “publish to web” for a single note: get a public read-only link, copy it, or unpublish. No permissions (no “can edit” vs “can view”) to keep scope small.

---

## Reference: Notion (lighter version)

- **Notion:** Share → Publish to web → toggle “Share to web” → public link; optional “Search engine indexing”; “Unpublish” to revoke.
- **Note-light (lighter):** One note = one public link. Publish → copy link; Unpublish to revoke. No search indexing toggle in v1.

---

## Ideal path (extension)

1. **Entry points**
   - **Note detail header:** “Share” button (next to Edit, Open, More) — primary for “I’m viewing this note, I want to share it.”
   - **Note context menu:** “Share” or “Publish” (right-click on note in sidebar or list, or via “More” in detail) — same destination.

2. **Share / Publish panel (modal or slide-out)**
   - **If note is not published:**
     - Short copy: “Anyone with the link can view this note (read-only).”
     - Primary action: **Publish to web**
     - After publish: show public link + **Copy link** + **Unpublish**.
   - **If note is already published:**
     - Show public link + **Copy link** + **Unpublish**.
   - Optional (v1): “Open shared page” (opens link in new tab) for quick check.

3. **Visual state in extension**
   - **List/sidebar:** Small “shared” indicator (e.g. link icon) next to note title when published (optional, for discoverability).
   - **Detail header:** When published, “Share” button can show a filled/link state so it’s obvious the note is shared.

4. **Unpublish**
   - From the same Share panel: “Unpublish” → confirm (“Link will stop working. You can publish again anytime.”) → revoke link.

5. **Trash / delete**
   - If user moves note to trash or permanently deletes: treat as unpublish (revoke link). No need for extra prompt if delete flow already confirms.

---

## Data (backend – to implement later)

- **Note:** Add `shareCode: String?` (null = not published). **No `publishedAt`** — published state is implied: if `shareCode` is set, the note is shared; if null, it’s not. Unpublish = set `shareCode` to null.
- **Code generation:** Same pattern as **my-saju-backend**: generate random string, ensure uniqueness in DB, retry on collision.
  - **Reference:** `my-saju-backend/src/utils/string.ts` — `generateRandomString(length)` (alphanumeric).
  - **Reference:** `my-saju-backend/src/reports/reports.service.ts` — `generateUniqueCode()`: loop with `generateRandomString(6)`, check `findByCode(code)`, return when unique; throw after max attempts.
- **note-light-backend:** Add a shared helper (or use the same util): generate e.g. 8–10 char code, check `notesRepository.findByShareCode(code)` (or unique index on `shareCode`), retry until unique. Store on note when user clicks “Publish”; clear when “Unpublish”.
- **Public view:** `GET /p/:code` (or `/share/:code`) — no auth; lookup note by `shareCode`. Return HTML or JSON for the shared note content (read-only). If no note with that code or note deleted → 404.

---

## Extension UI/UX flow (visualization first)

Before wiring to backend:

1. Add **Share** to note context menu (`getNoteContextMenuItems`) and a **Share** button in the note detail header.
2. On Share click, open a **Publish & Share** modal/panel that:
   - Shows the two states: “Not published” (with “Publish to web” button) and “Published” (with link + Copy + Unpublish).
   - For visualization, use **mock state** (e.g. “published” if user clicked Publish in the session; no persistence). This lets you click through and validate the flow.
3. Copy link: for now copy a placeholder URL (e.g. `https://getnotic.io/p/notes/<noteId>`); replace with real backend URL when API exists.
4. Unpublish: in mock, just close or switch panel back to “Not published”.

Once the flow feels right, add backend (publish endpoint, public page, `shareCode`) and replace mock state with real API + persistence.

---

## Summary

| Step | Extension | Backend (later) |
|------|-----------|------------------|
| Entry | Share in context menu + Share in note detail header | — |
| Panel | Publish to web → show link, Copy, Unpublish | POST to set `shareCode` (generate unique); GET public page by code |
| State | Mock “published” for flow; then sync from API | `shareCode`: set = published, null = not published |
| Link | Placeholder then real URL with code | Public route `GET /p/:code` or `/share/:code`; lookup by `shareCode` |
| Code gen | — | Same pattern as my-saju-backend: `generateRandomString` + unique check + retry |
