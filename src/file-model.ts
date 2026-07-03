import {
  getDesktopFileIconName,
  type DesktopFileIconName,
} from "@appkits-ai/sdk/desktop-icons";

export const HOME_ROOT = "/home/agent";
export const HOME_DISPLAY_NAME = "home";

export interface ExplorerEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  contentType?: string;
  size?: number;
  updatedAt?: string;
  local?: boolean;
  temporary?: boolean;
}

export interface UploadTarget {
  sourceName: string;
  path: string;
  conflict: boolean;
}

export type PendingCreateKind = "file" | "directory";

export type FileTypeKind =
  | "select"
  | "folder"
  | "app"
  | "image"
  | "audio"
  | "video"
  | "archive"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "database"
  | "markdown"
  | "html"
  | "json"
  | "code"
  | "text"
  | "file";

export type { DesktopFileIconName };

export interface TreeNode {
  path: string;
  name: string;
  children: TreeNode[];
}

export interface BreadcrumbSegment {
  label: string;
  path: string;
}

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SelectionState {
  x: number;
  y: number;
  additive: boolean;
  baseSelection: string[];
}

export function filenameFromPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === HOME_ROOT) return HOME_DISPLAY_NAME;
  return normalized.split("/").pop() || normalized;
}

export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === HOME_ROOT) return HOME_ROOT;
  const parent = normalized.slice(0, normalized.lastIndexOf("/")) || HOME_ROOT;
  return parent.startsWith(HOME_ROOT) ? parent : HOME_ROOT;
}

export function joinPath(directory: string, filename: string): string {
  return normalizePath(`${normalizePath(directory)}/${filename}`);
}

export function normalizePath(path: string): string {
  const normalized = (path || HOME_ROOT).replace(/\\/g, "/").replace(/\/+/g, "/");
  const trimmed = normalized.replace(/\/+$/, "") || HOME_ROOT;
  if (trimmed === "/" || trimmed === "/home") return HOME_ROOT;
  return trimmed.startsWith(HOME_ROOT)
    ? trimmed
    : `${HOME_ROOT}/${trimmed.replace(/^\/+/, "")}`;
}

export function visiblePath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === HOME_ROOT) return HOME_DISPLAY_NAME;
  return `${HOME_DISPLAY_NAME}/${normalized.slice(HOME_ROOT.length + 1)}`;
}

export function pathFromVisiblePath(path: string): string {
  const trimmed = path.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed || normalized === "home" || trimmed === "/home") return HOME_ROOT;
  if (normalized.startsWith("home/")) {
    return normalizePath(`${HOME_ROOT}/${trimmed.slice(5)}`);
  }
  if (trimmed.startsWith("/home/") && !trimmed.startsWith(HOME_ROOT)) {
    return normalizePath(`${HOME_ROOT}/${trimmed.slice("/home/".length)}`);
  }
  return normalizePath(trimmed);
}

export function breadcrumbSegments(path: string): BreadcrumbSegment[] {
  const normalized = normalizePath(path);
  const relative = normalized === HOME_ROOT ? [] : normalized.slice(HOME_ROOT.length + 1).split("/");
  return [
    { label: HOME_DISPLAY_NAME, path: HOME_ROOT },
    ...relative.map((part, index) => ({
      label: part,
      path: `${HOME_ROOT}/${relative.slice(0, index + 1).join("/")}`,
    })),
  ];
}

export function childEntries(
  entries: ExplorerEntry[],
  directory: string,
): ExplorerEntry[] {
  const root = normalizePath(directory);
  return entries
    .filter((entry) => parentPath(entry.path) === root)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function mergeDirectoryListing(
  entries: ExplorerEntry[],
  directory: string,
  children: ExplorerEntry[],
): ExplorerEntry[] {
  const root = normalizePath(directory);
  const nextChildren = children.map((entry) => ({
    ...entry,
    path: normalizePath(entry.path),
  }));
  if (root !== HOME_ROOT && !nextChildren.some((entry) => entry.path === root)) {
    const existingDirectory = entries.find(
      (entry) => entry.path === root && entry.kind === "directory",
    );
    nextChildren.unshift({
      ...existingDirectory,
      path: root,
      name: existingDirectory?.name || filenameFromPath(root),
      kind: "directory",
    });
  }
  const childPaths = new Set(nextChildren.map((entry) => entry.path));
  const retained = entries.filter(
    (entry) => parentPath(entry.path) !== root && !childPaths.has(entry.path),
  );
  return [...retained, ...nextChildren].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}

export function buildDirectoryTree(entries: ExplorerEntry[]): TreeNode {
  const directories = new Set([HOME_ROOT]);
  for (const entry of entries) {
    let current = entry.kind === "directory" ? entry.path : parentPath(entry.path);
    while (current.startsWith(HOME_ROOT)) {
      directories.add(current);
      if (current === HOME_ROOT) break;
      current = parentPath(current);
    }
  }

  const nodes = new Map<string, TreeNode>();
  for (const path of [...directories].sort()) {
    nodes.set(path, { path, name: filenameFromPath(path), children: [] });
  }
  for (const node of nodes.values()) {
    if (node.path === HOME_ROOT) continue;
    const parent = nodes.get(parentPath(node.path));
    parent?.children.push(node);
  }
  for (const node of nodes.values()) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
  }
  return nodes.get(HOME_ROOT) ?? { path: HOME_ROOT, name: HOME_DISPLAY_NAME, children: [] };
}

export function searchEntries(
  entries: ExplorerEntry[],
  directory: string,
  query: string,
): ExplorerEntry[] {
  const root = normalizePath(directory);
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return childEntries(entries, directory);
  return entries
    .filter((entry) => entry.path !== root && entry.name.toLowerCase().includes(trimmed))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function uniquePath(
  entries: ExplorerEntry[],
  directory: string,
  filename: string,
): string {
  const base = filename.replace(/\.[^.]+$/, "") || "Untitled";
  const extension = filename.includes(".")
    ? filename.slice(filename.lastIndexOf("."))
    : "";
  const existing = new Set(entries.map((entry) => entry.path.toLowerCase()));
  let candidate = `${normalizePath(directory)}/${filename}`;
  let index = 2;
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${normalizePath(directory)}/${base} ${index}${extension}`;
    index += 1;
  }
  return candidate;
}

export function pendingCreatePath(
  directory: string,
  kind: PendingCreateKind,
): string {
  return `${normalizePath(directory)}/.__appkits_pending_${kind}`;
}

export function pendingCreateEntry(
  directory: string,
  kind: PendingCreateKind,
  name: string,
): ExplorerEntry {
  return {
    path: pendingCreatePath(directory, kind),
    name,
    kind,
    size: 0,
    temporary: true,
  };
}

export function createTargetPath(
  directory: string,
  name: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed === "." || trimmed === "..") return null;
  return joinPath(directory, trimmed);
}

export function uploadTargets(
  entries: ExplorerEntry[],
  directory: string,
  filenames: string[],
  replace: boolean,
): UploadTarget[] {
  const existing = new Set(entries.map((entry) => entry.path.toLowerCase()));
  const allocated: ExplorerEntry[] = [];
  return filenames.map((filename) => {
    const cleanName = sanitizeFilename(filename) || "upload.bin";
    const directPath = joinPath(directory, cleanName);
    const conflict = existing.has(directPath.toLowerCase());
    if (replace) {
      return { sourceName: filename, path: directPath, conflict };
    }
    const candidate = uniquePath([...entries, ...allocated], directory, cleanName);
    allocated.push({ path: candidate, name: filename, kind: "file" });
    return { sourceName: filename, path: candidate, conflict };
  });
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim()
    .slice(0, 180);
}

export function fileTypeKind(entry: ExplorerEntry | null | undefined): FileTypeKind {
  if (!entry) return "select";
  if (entry.kind === "directory") return "folder";
  const name = entry.name.toLowerCase();
  const contentType = ((entry.contentType || "").split(";")[0] || "").trim().toLowerCase();
  if (/\.app$/i.test(name)) return "app";
  if (
    contentType.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?)$/i.test(name)
  ) {
    return "image";
  }
  if (
    contentType.startsWith("audio/") ||
    /\.(mp3|wav|ogg|flac|m4a|aac|aiff?)$/i.test(name)
  ) {
    return "audio";
  }
  if (
    contentType.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name)
  ) {
    return "video";
  }
  if (/\.(zip|gz|tgz|tar|rar|7z|bz2|xz)$/i.test(name)) return "archive";
  if (/\.pdf$/i.test(name) || contentType === "application/pdf") return "pdf";
  if (/\.(doc|docx|rtf|odt)$/i.test(name)) return "document";
  if (/\.(xls|xlsx|ods)$/i.test(name)) return "spreadsheet";
  if (/\.(ppt|pptx|odp)$/i.test(name)) return "presentation";
  if (/\.(sqlite|sqlite3|db|duckdb)$/i.test(name)) return "database";
  if (/\.(md|markdown|mdx)$/i.test(name) || contentType === "text/markdown") return "markdown";
  if (/\.(html|htm)$/i.test(name) || contentType === "text/html") return "html";
  if (/\.(json|jsonc)$/i.test(name) || contentType.includes("json")) return "json";
  if (
    /\.(ts|tsx|js|jsx|mjs|cjs|css|scss|sass|less|yml|yaml|toml|xml|sql|py|rb|go|rs|java|kt|swift|php|c|cc|cpp|h|hpp|vue|svelte|sh|bash|zsh|env|ini|conf|dockerfile)$/i.test(
      name,
    ) ||
    contentType.includes("javascript") ||
    contentType.includes("typescript")
  ) {
    return "code";
  }
  if (contentType.startsWith("text/") || /\.(txt|log|csv)$/i.test(name)) return "text";
  return "file";
}

const FILE_TYPE_LABELS: Record<FileTypeKind, string> = {
  select: "Select an item",
  folder: "Folder",
  app: "App launcher",
  image: "Image",
  audio: "Audio",
  video: "Video",
  archive: "Archive",
  pdf: "PDF document",
  document: "Document",
  spreadsheet: "Spreadsheet",
  presentation: "Presentation",
  database: "Database file",
  markdown: "Markdown document",
  html: "HTML document",
  json: "JSON document",
  code: "Code file",
  text: "Text document",
  file: "File",
};

export function fileTypeLabel(entry: ExplorerEntry | null | undefined): string {
  return FILE_TYPE_LABELS[fileTypeKind(entry)];
}

export function desktopFileIconName(entry: ExplorerEntry): DesktopFileIconName {
  return getDesktopFileIconName({
    name: entry.name,
    kind: entry.kind,
    contentType: entry.contentType,
  });
}

export function isTextPreviewable(entry: ExplorerEntry): boolean {
  return ["code", "html", "markdown"].includes(fileTypeKind(entry));
}

export function formatSize(value: number | undefined): string {
  if (!Number.isFinite(value) || !value || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function isTextInputTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function pathFromLaunchParams(params: Record<string, unknown>): string {
  const folder = params.appkitsOpenFolder;
  if (folder && typeof folder === "object") {
    const path = (folder as Record<string, unknown>).path;
    if (typeof path === "string") return normalizePath(path);
  }
  const file = params.appkitsOpenFile;
  if (file && typeof file === "object") {
    const path = (file as Record<string, unknown>).path;
    if (typeof path === "string") return parentPath(path);
  }
  return HOME_ROOT;
}

export function selectedPathFromLaunchParams(
  params: Record<string, unknown>,
): string | null {
  const file = params.appkitsOpenFile;
  if (file && typeof file === "object") {
    const path = (file as Record<string, unknown>).path;
    if (typeof path === "string") return normalizePath(path);
  }
  return null;
}
