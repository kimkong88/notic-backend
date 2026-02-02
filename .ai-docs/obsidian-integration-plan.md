# Obsidian integration – plan

**Context:** Obsidian stores notes as **Markdown files in a local vault** (a folder on disk). There is no Obsidian cloud API or OAuth. So “integration” means how we get Notic data in or out of that format/location.

---

## 1. What “Obsidian integration” could mean

| Option | Direction | Description |
|--------|-----------|-------------|
| **A. Export to Obsidian** | Notic → Obsidian | User gets their Notic notes as Markdown files (e.g. a ZIP) they can drop into their vault. One-time or on-demand. |
| **B. Sync vault ↔ Notic** | Two-way | An **Obsidian plugin** (or local app) uses your existing sync API so the vault and Notic stay in sync. |
| **C. Import from Obsidian** | Obsidian → Notic | User uploads or points to a vault (or ZIP); we create/update workspaces/folders/notes in Notic. |

---

## 2. Recommended starting point: Export to Obsidian (A)

**Why it’s “pretty easy”:**

- No Obsidian API, no OAuth, no plugin required.
- Backend (or extension) already has workspaces/folders/notes; we only need to **serialize to Markdown + folder structure** and expose that as a **ZIP download**.
- Same auth as today (Bearer token).
- User flow: Settings → Integrations → “Export to Obsidian” → download ZIP → unzip into vault.

**Backend scope (minimal):**

- **Endpoint:** e.g. `GET /export/obsidian` (or `GET /obsidian/export`) with Bearer auth.
- **Logic:** Load user’s workspaces, folders, notes (reuse existing repos). Build a virtual file tree:
  - One folder per workspace (or a single root folder).
  - Subfolders per folder hierarchy.
  - One `.md` file per note: filename from note title (sanitized), body = note content (already Markdown-friendly).
- **Response:** ZIP bytes with `Content-Disposition: attachment; filename="notic-obsidian-export-{date}.zip"`.
- Optional: query param `?structure=workspace` vs `flat` (flat = all notes in one folder).

**Extension scope:**

- Integrations (or Settings): “Export to Obsidian” button that calls the new endpoint and triggers download (e.g. `chrome.downloads.download` or fetch + blob + save).

**Deduplication / overwrite:**

- Export is a **snapshot**. No mapping table needed (unlike Notion). Each export is a full dump. User can replace a folder in the vault or merge manually.

---

## 3. If you want two-way sync later (B)

- Build an **Obsidian plugin** that uses your **existing sync API** (same as the extension: push/pull, auth).
- Backend stays almost unchanged; the plugin does the work of:
  - Mapping vault files ↔ workspaces/folders/notes.
  - Conflict handling, deleted files, etc.
- More work, but no new backend “Obsidian module” beyond what sync already provides.

---

## 4. If you want import from Obsidian (C)

- **Endpoint:** e.g. `POST /import/obsidian` with a ZIP (or the extension/plugin sends a JSON tree of notes).
- Backend parses Markdown files, creates workspaces/folders/notes (via existing sync or a dedicated import path).
- Need rules for: folder structure → workspaces/folders, filenames → note titles, frontmatter handling (optional).

---

## 5. How to deliver the files: directory picker vs ZIP vs protocol

**Preferred: File System Access API (directory picker + write)**

- Extension shows a **directory picker** (`showDirectoryPicker()`); user selects their **Obsidian vault**.
- Backend returns export **data** (list of `{ path, content }` or tree), extension **writes** `.md` files (and creates folders) directly into the chosen folder.
- No ZIP, no manual unzip; best UX where supported (Chrome, Edge; extension with user gesture).

**Fallback: ZIP download**

- If the API isn’t available (Safari, Firefox, or user declines), offer **ZIP download**: same payload, zipped (by backend or extension). User unzips into vault manually.

**Protocol (optional)**

- **Obsidian’s** `obsidian://` is for opening notes/vaults, not for receiving files. Use it **after** export: “Open in Obsidian” that opens e.g. `obsidian://open?vault=...` when we know the vault path/name. So: protocol = “open vault after export”, not the way we deliver the MD.

**Split of work**

- **Backend:** Endpoint that returns export payload (e.g. `GET /export/obsidian` → JSON `{ files: [{ path, content }] }` or a ZIP for fallback).
- **Extension:** “Export to Obsidian” button → call backend → if File System Access API available, show directory picker and write files; else trigger ZIP download. Optionally “Open in Obsidian” via protocol after write.

---

## 6. Suggested next steps (for Option A)

1. **Backend:** Add `GET /export/obsidian` (auth guard, load user data). Return either:
   - JSON `{ files: [{ path: "Workspace/Folder/note.md", content: "..." }] }` for extension to write via directory picker, and/or
   - ZIP bytes for fallback download.
2. **Extension:** “Export to Obsidian” in Integrations:
   - Call endpoint; if directory picker supported, `showDirectoryPicker()` → write files; else download ZIP.
   - Optional: “Open in Obsidian” after write (protocol) if vault path is known.
3. **Docs:** Short “Obsidian export” section (folder structure, filename rules).
