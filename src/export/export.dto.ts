/** Response shape for GET /export/obsidian. */
export interface ObsidianExportResponse {
  files: Array<{ path: string; content: string }>;
}
