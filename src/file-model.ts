export const HOME_ROOT = "/home/agent";

export interface ExplorerEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  contentType?: string;
  size?: number;
  local?: boolean;
  temporary?: boolean;
}

export type PendingCreateKind = "file" | "directory";

export interface TreeNode {
  path: string;
  name: string;
  children: TreeNode[];
}

export function filenameFromPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === HOME_ROOT) return "Home";
  return normalized.split("/").pop() || normalized;
}

export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === HOME_ROOT) return HOME_ROOT;
  const parent = normalized.slice(0, normalized.lastIndexOf("/")) || HOME_ROOT;
  return parent.startsWith(HOME_ROOT) ? parent : HOME_ROOT;
}

export function normalizePath(path: string): string {
  const normalized = (path || HOME_ROOT).replace(/\\/g, "/").replace(/\/+/g, "/");
  const trimmed = normalized.replace(/\/+$/, "") || HOME_ROOT;
  if (trimmed === "/" || trimmed === "/home") return HOME_ROOT;
  return trimmed.startsWith(HOME_ROOT)
    ? trimmed
    : `${HOME_ROOT}/${trimmed.replace(/^\/+/, "")}`;
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
  return nodes.get(HOME_ROOT) ?? { path: HOME_ROOT, name: "Home", children: [] };
}

export function searchEntries(
  entries: ExplorerEntry[],
  directory: string,
  query: string,
): ExplorerEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return childEntries(entries, directory);
  return entries
    .filter((entry) => entry.name.toLowerCase().includes(trimmed))
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
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\"))
    return null;
  if (trimmed === "." || trimmed === "..") return null;
  return `${normalizePath(directory)}/${trimmed}`;
}

export function pathFromLaunchParams(params: Record<string, unknown>): string {
  const folder = params.w3kitsOpenFolder;
  if (folder && typeof folder === "object") {
    const path = (folder as Record<string, unknown>).path;
    if (typeof path === "string") return normalizePath(path);
  }
  return HOME_ROOT;
}
