import React from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Images,
  LayoutGrid,
  List,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import * as appkits from "@appkits-ai/sdk/client";
import { Button } from "@appkits-ai/ui";
import {
  HOME_ROOT,
  breadcrumbSegments,
  buildDirectoryTree,
  childEntries,
  createTargetPath,
  fileTypeLabel,
  filenameFromPath,
  formatSize,
  isTextInputTarget,
  joinPath,
  mergeDirectoryListing,
  normalizePath,
  parentPath,
  pendingCreateEntry,
  pendingCreatePath,
  pathFromLaunchParams,
  pathFromVisiblePath,
  rectsIntersect,
  sanitizeFilename,
  searchEntries,
  selectedPathFromLaunchParams,
  uniquePath,
  uploadTargets,
  visiblePath,
  type ExplorerEntry,
  type PendingCreateKind,
  type SelectionRect,
  type SelectionState,
  type TreeNode,
} from "./file-model";
import "./styles.css";

type ContextMenuState =
  | { x: number; y: number; type: "background"; targetDirectory: string }
  | { x: number; y: number; type: "selection"; targetDirectory: string }
  | { x: number; y: number; type: "entry"; targetDirectory: string; entry: ExplorerEntry };

type ExplorerViewMode = "details" | "icons" | "gallery";
type HostContextMenuCommandItem = {
  type?: "item";
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  destructive?: boolean;
};
type HostContextMenuSeparatorItem = {
  type: "separator";
  id?: string;
};
type HostContextMenuSubmenuItem = {
  type: "submenu";
  id?: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  items: HostContextMenuItem[];
};
type HostContextMenuItem =
  | HostContextMenuCommandItem
  | HostContextMenuSeparatorItem
  | HostContextMenuSubmenuItem;

type ShellFileOpenerSummary = {
  id: string;
  label: string;
  kind: string;
  icon?: string;
  appId?: string;
};

interface ClipboardState {
  mode: "copy" | "cut";
  entries: ExplorerEntry[];
}

interface PendingUpload {
  items: File[];
  targetDirectory: string;
  conflicts: string[];
}

type TextFileExtension = ".txt" | ".md" | ".html";

interface PendingCreate {
  kind: PendingCreateKind;
  directory: string;
  extension?: TextFileExtension;
}

const TEXT_FILE_BODY: Record<TextFileExtension, string> = {
  ".txt": "",
  ".md": "# Untitled\n",
  ".html": '<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8" />\n    <title>Untitled</title>\n  </head>\n  <body>\n  </body>\n</html>\n',
};

const TEXT_FILE_TYPE: Record<TextFileExtension, string> = {
  ".txt": "text/plain;charset=UTF-8",
  ".md": "text/markdown;charset=UTF-8",
  ".html": "text/html;charset=UTF-8",
};

const LONG_PRESS_MS = 520;
const LONG_PRESS_MOVE_LIMIT = 10;

function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function normalizeTheme(theme: string | undefined): "light" | "dark" {
  return theme === "dark" || theme === "light" ? theme : systemTheme();
}

function applyTheme(theme: string | undefined) {
  if (typeof document === "undefined") return;
  const normalized = normalizeTheme(theme);
  document.documentElement.dataset.appkitsTheme = normalized;
  document.documentElement.style.colorScheme = normalized;
}

function App() {
  const [entries, setEntries] = React.useState<ExplorerEntry[]>([]);
  const [currentPath, setCurrentPath] = React.useState(HOME_ROOT);
  const [selectedPaths, setSelectedPaths] = React.useState<string[]>([]);
  const [activePath, setActivePath] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [renamingPath, setRenamingPath] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [pathEditing, setPathEditing] = React.useState(false);
  const [pathEditorValue, setPathEditorValue] = React.useState("Home");
  const [viewMode, setViewMode] = React.useState<ExplorerViewMode>("details");
  const [clipboard, setClipboard] = React.useState<ClipboardState | null>(null);
  const [selectionRect, setSelectionRect] = React.useState<SelectionRect | null>(null);
  const [pendingCreate, setPendingCreate] = React.useState<PendingCreate | null>(null);
  const [pendingUpload, setPendingUpload] = React.useState<PendingUpload | null>(null);
  const [draggingFiles, setDraggingFiles] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [status, setStatus] = React.useState("Ready");
  const [preview, setPreview] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const uploadRef = React.useRef<HTMLInputElement | null>(null);
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);
  const pathInputRef = React.useRef<HTMLInputElement | null>(null);
  const selectionStartRef = React.useRef<SelectionState | null>(null);
  const dragDepthRef = React.useRef(0);
  const selectedPathsRef = React.useRef<string[]>([]);
  const entriesRef = React.useRef<ExplorerEntry[]>([]);
  const currentPathRef = React.useRef(currentPath);
  const pendingLaunchSelectionRef = React.useRef<string | null>(null);
  const pendingCreateCommitRef = React.useRef(false);
  const contextMenuActionsRef = React.useRef(new Map<string, () => void>());
  const longPressRef = React.useRef<{
    pointerId: number;
    x: number;
    y: number;
    timeoutId: number;
  } | null>(null);

  React.useEffect(() => {
    applyTheme(systemTheme());
    void appkits.Theme.current().then(applyTheme).catch(() => undefined);
    return appkits.Theme.onChange(applyTheme);
  }, []);

  React.useEffect(() => {
    selectedPathsRef.current = selectedPaths;
  }, [selectedPaths]);

  React.useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  React.useEffect(() => {
    currentPathRef.current = currentPath;
    setPathEditorValue(visiblePath(currentPath));
  }, [currentPath]);

  const refresh = React.useCallback(async (directory = currentPathRef.current) => {
    const targetDirectory = normalizePath(directory);
    setIsRefreshing(true);
    setStatus(`Refreshing ${visiblePath(targetDirectory)}`);
    try {
      const result = await appkits.FileSystem.list(targetDirectory);
      const listedEntries = result.entries.map((entry) => ({
        path: normalizePath(entry.path),
        name: entry.name || filenameFromPath(entry.path),
        kind: entry.kind,
        contentType: entry.contentType,
        size: entry.size,
        local: entry.local,
        temporary: entry.temporary,
        updatedAt:
          "updatedAt" in entry && typeof entry.updatedAt === "string"
            ? entry.updatedAt
            : new Date().toISOString(),
      }));
      setEntries((current) => {
        const nextEntries = mergeDirectoryListing(
          current,
          targetDirectory,
          listedEntries,
        );
        const launchSelection = pendingLaunchSelectionRef.current;
        if (
          launchSelection &&
          nextEntries.some((entry) => entry.path === launchSelection)
        ) {
          setSelectedPaths([launchSelection]);
          setActivePath(launchSelection);
          pendingLaunchSelectionRef.current = null;
        } else {
          setSelectedPaths((selection) =>
            selection.filter((path) =>
              nextEntries.some((entry) => entry.path === path),
            ),
          );
        }
        return nextEntries;
      });
      setStatus(`${listedEntries.length} item${listedEntries.length === 1 ? "" : "s"} in ${visiblePath(targetDirectory)}`);
    } catch {
      notify("Could not refresh folder", "error");
      setStatus(`Refresh failed for ${visiblePath(targetDirectory)}`);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void appkits.Window.setTitle("File Explorer");
    void appkits.Launch.params().then((params) => {
      const next = pathFromLaunchParams(params);
      pendingLaunchSelectionRef.current = selectedPathFromLaunchParams(params);
      setCurrentPath(next);
    });
    const offLaunch = appkits.Launch.onChange((params) => {
      pendingLaunchSelectionRef.current = selectedPathFromLaunchParams(params);
      setCurrentPath(pathFromLaunchParams(params));
      setSelectedPaths([]);
      setActivePath(null);
    });
    return () => offLaunch();
  }, []);

  React.useEffect(() => {
    void refresh(currentPath);
  }, [currentPath, refresh]);

  React.useEffect(() => {
    if (!renamingPath) return;
    window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }, [renamingPath]);

  React.useEffect(() => {
    if (!pathEditing) return;
    window.setTimeout(() => {
      pathInputRef.current?.focus();
      pathInputRef.current?.select();
    }, 0);
  }, [pathEditing]);

  React.useEffect(() => {
    return () => clearLongPress();
  }, []);

  React.useEffect(() => {
    return appkits.ContextMenu.onSelect((itemId) => {
      const action = contextMenuActionsRef.current.get(itemId);
      contextMenuActionsRef.current.clear();
      action?.();
    });
  }, []);

  const visibleEntries = React.useMemo(() => {
    return query.trim() ? searchEntries(entries, currentPath, query) : childEntries(entries, currentPath);
  }, [currentPath, entries, query]);
  const visibleEntriesWithPending = React.useMemo(() => {
    if (!pendingCreate || pendingCreate.directory !== currentPath || query.trim()) {
      return visibleEntries;
    }
    return [
      pendingCreateEntry(currentPath, pendingCreate.kind, renameValue),
      ...visibleEntries,
    ];
  }, [currentPath, pendingCreate, query, renameValue, visibleEntries]);
  const tree = React.useMemo(() => buildDirectoryTree(entries), [entries]);
  const entryMap = React.useMemo(() => new Map(entries.map((entry) => [entry.path, entry])), [entries]);
  const selectedEntrySet = React.useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectedEntries = React.useMemo(
    () => selectedPaths.map((path) => entryMap.get(path)).filter((entry): entry is ExplorerEntry => Boolean(entry)),
    [entryMap, selectedPaths],
  );
  const activeEntry = activePath ? entryMap.get(activePath) || null : selectedEntries[0] || null;
  const detailsEntry = selectedEntries.length === 1 ? activeEntry : null;

  React.useEffect(() => {
    if (!detailsEntry || detailsEntry.kind !== "file") {
      setPreview("");
      return;
    }
    const label = fileTypeLabel(detailsEntry);
    if (!["Text document", "Markdown document", "HTML document", "Code file"].includes(label)) {
      setPreview("");
      return;
    }
    let cancelled = false;
    void appkits.FileSystem.read(detailsEntry.path)
      .then((file) => {
        if (!cancelled) setPreview(decodeReadResult(file).slice(0, 4000));
      })
      .catch(() => {
        if (!cancelled) setPreview("");
      });
    return () => {
      cancelled = true;
    };
  }, [detailsEntry]);

  function registerContextAction(
    actions: Map<string, () => void>,
    id: string,
    action: () => void,
  ) {
    actions.set(id, action);
    return id;
  }

  async function openContextMenu(menu: ContextMenuState) {
    const actions = new Map<string, () => void>();
    const targetItems = menu.type === "entry" ? [menu.entry] : selectedEntries;
    const item = (
      id: string,
      label: string,
      icon: string,
      action: () => void,
      options: {
        checked?: boolean;
        disabled?: boolean;
        destructive?: boolean;
        shortcut?: string;
      } = {},
    ): HostContextMenuCommandItem => ({
      type: "item",
      id: registerContextAction(actions, id, action),
      label,
      icon,
      shortcut: options.shortcut,
      checked: options.checked,
      disabled: options.disabled,
      destructive: options.destructive,
    });
    const separator = (id: string): HostContextMenuItem => ({
      type: "separator",
      id,
    });
    const submenu = (
      id: string,
      label: string,
      icon: string,
      items: HostContextMenuItem[],
    ): HostContextMenuItem => ({
      type: "submenu",
      id,
      label,
      icon,
      items,
    });
    const viewItems: HostContextMenuItem[] = [
      item("view-details", "Details", "list", () => setViewMode("details"), {
        checked: viewMode === "details",
      }),
      item("view-icons", "Icons", "grid", () => setViewMode("icons"), {
        checked: viewMode === "icons",
      }),
      item("view-gallery", "Gallery", "gallery", () => setViewMode("gallery"), {
        checked: viewMode === "gallery",
      }),
    ];
    const viewMenu = () => submenu("view", "View", "view", viewItems);
    const newMenu = () =>
      submenu("new", "New", "new-file", [
        item(
          "new-folder",
          "New Folder",
          "new-folder",
          () => void createFolder(),
          { shortcut: "Ctrl+Shift+N" },
        ),
        separator("new-separator"),
        item("new-text", "Text File", "new-file", () => void createFile(".txt")),
        item("new-markdown", "Markdown File", "new-file", () =>
          void createFile(".md"),
        ),
        item("new-html", "HTML File", "new-file", () =>
          void createFile(".html"),
        ),
      ]);
    const openersForEntry = async (
      entry: ExplorerEntry | undefined,
    ): Promise<ShellFileOpenerSummary[]> => {
      if (!entry || entry.kind !== "file") return [];
      try {
        const result = await appkits.FileSystem.openers({
          path: entry.path,
          name: entry.name,
          kind: "file",
          contentType: entry.contentType,
          local: entry.local,
        });
        return result.openers;
      } catch {
        return [];
      }
    };
    const openWithMenu = (
      entry: ExplorerEntry | undefined,
      openers: ShellFileOpenerSummary[],
      keyPrefix: string,
    ): HostContextMenuItem | null => {
      if (!entry || entry.kind !== "file" || openers.length === 0) return null;
      return submenu(
        `${keyPrefix}-open-with`,
        "Open With",
        "open",
        openers.map((opener) =>
          item(
            `${keyPrefix}-open-with-${opener.id}`,
            opener.label,
            opener.icon || "open",
            () => openEntryWithShell(entry, opener.id),
          ),
        ),
      );
    };
    const selectionOpeners =
      menu.type === "selection" && targetItems.length === 1
        ? await openersForEntry(targetItems[0])
        : [];
    const entryOpeners =
      menu.type === "entry" ? await openersForEntry(menu.entry) : [];
    const menuItems: Array<HostContextMenuItem | null> =
      menu.type === "background"
        ? [
            clipboard
              ? item(
                  "paste",
                  "Paste",
                  "paste",
                  () => void pasteInto(menu.targetDirectory),
                  { shortcut: "Ctrl+V" },
                )
              : null,
            clipboard ? separator("clipboard-separator") : null,
            viewMenu(),
            newMenu(),
            separator("background-action-separator"),
            item("upload", "Upload Files", "upload", () =>
              uploadRef.current?.click(),
            ),
            item(
              "refresh",
              "Refresh",
              "refresh",
              () => void refresh(menu.targetDirectory),
              { shortcut: "Ctrl+R" },
            ),
          ]
        : menu.type === "selection"
          ? [
              item(
                "open",
                "Open",
                "open",
                () => targetItems[0] && openEntry(targetItems[0]),
                { disabled: targetItems.length !== 1, shortcut: "Enter" },
              ),
              openWithMenu(targetItems[0], selectionOpeners, "selection"),
              separator("selection-open-separator"),
              item(
                "copy",
                "Copy Selected",
                "copy",
                () => copyEntries("copy", targetItems),
                { shortcut: "Ctrl+C" },
              ),
              item(
                "cut",
                "Cut Selected",
                "cut",
                () => copyEntries("cut", targetItems),
                { shortcut: "Ctrl+X" },
              ),
              clipboard
                ? item(
                    "paste",
                    "Paste",
                    "paste",
                    () => void pasteInto(menu.targetDirectory),
                    { shortcut: "Ctrl+V" },
                  )
                : null,
              separator("selection-action-separator"),
              item(
                "rename",
                "Rename",
                "rename",
                () => startRename(targetItems[0]?.path),
                { disabled: targetItems.length !== 1, shortcut: "F2" },
              ),
              item(
                "delete",
                "Delete Selected",
                "delete",
                () => void deleteEntries(targetItems),
                {
                  destructive: true,
                  disabled: targetItems.length === 0,
                  shortcut: "Del",
                },
              ),
              separator("selection-view-separator"),
              viewMenu(),
            ]
          : [
              item(
                "open",
                "Open",
                menu.entry.kind === "directory" ? "folder" : "file",
                () => openEntry(menu.entry),
                { shortcut: "Enter" },
              ),
              openWithMenu(menu.entry, entryOpeners, "entry"),
              separator("entry-open-separator"),
              item("copy", "Copy", "copy", () => copyEntries("copy", targetItems), {
                shortcut: "Ctrl+C",
              }),
              item("cut", "Cut", "cut", () => copyEntries("cut", targetItems), {
                shortcut: "Ctrl+X",
              }),
              menu.entry.kind === "directory" && clipboard
                ? item(
                    "paste",
                    "Paste",
                    "paste",
                    () => void pasteInto(menu.entry.path),
                    { shortcut: "Ctrl+V" },
                  )
                : null,
              separator("entry-action-separator"),
              item(
                "download",
                "Download",
                "download",
                () => void downloadEntry(menu.entry),
                { disabled: menu.entry.kind !== "file" },
              ),
              item(
                "rename",
                "Rename",
                "rename",
                () => startRename(menu.entry.path),
                { shortcut: "F2" },
              ),
              item(
                "delete",
                "Delete",
                "delete",
                () => void deleteEntries(targetItems),
                { destructive: true, shortcut: "Del" },
              ),
              separator("entry-view-separator"),
              viewMenu(),
              menu.entry.kind === "directory"
                ? separator("entry-folder-separator")
                : null,
              item(
                "refresh-folder",
                "Refresh Folder",
                "refresh",
                () =>
                  void refresh(
                    menu.entry.kind === "directory"
                      ? menu.entry.path
                      : menu.targetDirectory,
                  ),
                {
                  disabled: menu.entry.kind !== "directory",
                  shortcut: "Ctrl+R",
                },
              ),
            ];
    const hostMenuItems = menuItems.filter(
      (entry): entry is HostContextMenuItem => Boolean(entry),
    );
    contextMenuActionsRef.current = actions;
    void appkits.ContextMenu.open({
      x: menu.x,
      y: menu.y,
      items: hostMenuItems as appkits.AppKitsContextMenuItem[],
    }).catch(() => {
      contextMenuActionsRef.current.clear();
      notify("Could not open context menu", "error");
    });
  }

  function clearLongPress() {
    const longPress = longPressRef.current;
    if (!longPress) return;
    window.clearTimeout(longPress.timeoutId);
    longPressRef.current = null;
  }

  function beginLongPress(
    event: React.PointerEvent,
    open: (point: { x: number; y: number }) => void,
  ) {
    if (event.button !== 0 || event.pointerType === "mouse") return;
    clearLongPress();
    const point = { x: event.clientX, y: event.clientY };
    longPressRef.current = {
      pointerId: event.pointerId,
      ...point,
      timeoutId: window.setTimeout(() => {
        longPressRef.current = null;
        open(point);
      }, LONG_PRESS_MS),
    };
  }

  function moveLongPress(event: React.PointerEvent) {
    const longPress = longPressRef.current;
    if (!longPress || longPress.pointerId !== event.pointerId) return;
    if (
      Math.abs(event.clientX - longPress.x) > LONG_PRESS_MOVE_LIMIT ||
      Math.abs(event.clientY - longPress.y) > LONG_PRESS_MOVE_LIMIT
    ) {
      clearLongPress();
    }
  }

  function navigate(path: string) {
    setPendingCreate(null);
    setRenamingPath(null);
    setCurrentPath(normalizePath(path));
    setSelectedPaths([]);
    setActivePath(null);
    void appkits.ContextMenu.close().catch(() => undefined);
  }

  function setSingleSelection(path: string | null) {
    setSelectedPaths(path ? [path] : []);
    setActivePath(path);
  }

  function openEntry(entry: ExplorerEntry) {
    if (entry.kind === "directory") {
      navigate(entry.path);
      return;
    }
    setSingleSelection(entry.path);
    setPreview("");
    setStatus(`Opening ${entry.name}`);
    void appkits.FileSystem.open({
      path: entry.path,
      name: entry.name,
      kind: "file",
      contentType: entry.contentType,
      local: entry.local,
    })
      .then((result) => {
        setStatus(
          `Opening ${entry.name}${result.openerLabel ? ` with ${result.openerLabel}` : ""}`,
        );
      })
      .catch(() => {
        notify("No shell opener could open this file", "error");
        setStatus(`Could not open ${entry.name}`);
      });
  }

  function openEntryWithShell(entry: ExplorerEntry, openerId?: string) {
    if (entry.kind === "directory") {
      navigate(entry.path);
      return;
    }
    setSingleSelection(entry.path);
    setPreview("");
    setStatus(`Opening ${entry.name}`);
    void appkits.FileSystem.open({
      path: entry.path,
      name: entry.name,
      kind: "file",
      contentType: entry.contentType,
      local: entry.local,
      openerId,
    })
      .then((result) => {
        setStatus(
          `Opening ${entry.name}${result.openerLabel ? ` with ${result.openerLabel}` : ""}`,
        );
      })
      .catch(() => {
        notify("Could not open file with this app", "error");
        setStatus(`Could not open ${entry.name}`);
      });
  }

  function handleRowClick(event: React.MouseEvent, entry: ExplorerEntry) {
    if (event.metaKey || event.ctrlKey) {
      setSelectedPaths((current) => {
        const next = current.includes(entry.path)
          ? current.filter((path) => path !== entry.path)
          : [...current, entry.path];
        setActivePath(entry.path);
        return next;
      });
      return;
    }
    if (event.shiftKey && activePath) {
      const first = visibleEntriesWithPending.findIndex((item) => item.path === activePath);
      const second = visibleEntriesWithPending.findIndex((item) => item.path === entry.path);
      if (first >= 0 && second >= 0) {
        const [start, end] = [Math.min(first, second), Math.max(first, second)];
        setSelectedPaths(visibleEntriesWithPending.slice(start, end + 1).map((item) => item.path));
        setActivePath(entry.path);
        return;
      }
    }
    setSingleSelection(entry.path);
  }

  async function createFolder() {
    startPendingCreate("directory");
  }

  async function createFile(extension: TextFileExtension) {
    startPendingCreate("file", extension);
  }

  function startPendingCreate(kind: PendingCreateKind, extension: TextFileExtension = ".txt") {
    const directory = currentPathRef.current;
    const defaultName = kind === "directory" ? "New Folder" : `Untitled${extension}`;
    const path = uniquePath(entriesRef.current, directory, defaultName);
    const pendingPath = pendingCreatePath(directory, kind);
    void appkits.ContextMenu.close().catch(() => undefined);
    setPendingCreate({ kind, directory, extension: kind === "file" ? extension : undefined });
    setRenamingPath(pendingPath);
    setRenameValue(filenameFromPath(path));
    setSingleSelection(pendingPath);
    setStatus(kind === "directory" ? "Creating folder" : "Creating file");
  }

  function startRename(path: string | null | undefined) {
    if (!path) return;
    const entry = entriesRef.current.find((item) => item.path === path);
    if (!entry) return;
    setPendingCreate(null);
    setRenameValue(entry.name);
    setRenamingPath(entry.path);
  }

  async function finishRename(commit: boolean) {
    const pending = pendingCreate;
    if (pending) {
      if (pendingCreateCommitRef.current) return;
      pendingCreateCommitRef.current = true;
      setRenamingPath(null);
      setPendingCreate(null);
      setSingleSelection(null);
      try {
        if (!commit) return;
        const target = createTargetPath(pending.directory, renameValue);
        if (!target) return;
        const exists = entriesRef.current.some(
          (entry) => entry.path.toLowerCase() === target.toLowerCase(),
        );
        if (exists) {
          notify("An item with that name already exists", "error");
          return;
        }
        if (pending.kind === "directory") {
          await appkits.FileSystem.mkdir(target);
        } else {
          const extension = pending.extension || ".txt";
          await appkits.FileSystem.write({
            path: target,
            body: TEXT_FILE_BODY[extension],
            contentType: TEXT_FILE_TYPE[extension],
          });
        }
        await refresh();
        setSingleSelection(target);
        setStatus(pending.kind === "directory" ? "Folder created" : "File created");
      } finally {
        pendingCreateCommitRef.current = false;
      }
      return;
    }

    const entry = entriesRef.current.find((item) => item.path === renamingPath);
    const nextName = sanitizeFilename(renameValue);
    setRenamingPath(null);
    if (!commit || !entry || !nextName || nextName === entry.name) return;
    const target = joinPath(parentPath(entry.path), nextName);
    await appkits.FileSystem.move(entry.path, target);
    await refresh();
    setSingleSelection(target);
    setStatus("Item renamed");
  }

  async function deleteEntries(items: ExplorerEntry[]) {
    if (items.length === 0) {
      setStatus("Select items to delete");
      return;
    }
    setStatus(`Deleting ${items.length} item${items.length === 1 ? "" : "s"}`);
    try {
      for (const entry of items) await appkits.FileSystem.delete(entry.path);
      setSelectedPaths([]);
      setActivePath(null);
      await refresh();
      notify(items.length === 1 ? "Item deleted" : "Items deleted", "success");
    } catch {
      notify("Could not delete selected items", "error");
      setStatus("Delete failed");
    }
  }

  function copyEntries(mode: "copy" | "cut", items = selectedEntries) {
    if (items.length === 0) return;
    setClipboard({ mode, entries: items });
    setStatus(`${mode === "copy" ? "Copied" : "Cut"} ${items.length} item${items.length === 1 ? "" : "s"}`);
  }

  async function pasteInto(targetDirectory: string) {
    if (!clipboard) return;
    for (const entry of clipboard.entries) {
      const target = uniquePath(entriesRef.current, targetDirectory, entry.name);
      if (entry.kind === "directory") {
        await copyDirectory(entry.path, target);
      } else {
        const file = await appkits.FileSystem.read(entry.path);
        await appkits.FileSystem.write({
          path: target,
          body: file.body,
          bodyBase64: file.bodyBase64,
          contentType: file.contentType || entry.contentType,
        });
      }
      if (clipboard.mode === "cut") await appkits.FileSystem.delete(entry.path);
    }
    if (clipboard.mode === "cut") setClipboard(null);
    await refresh();
    setStatus("Paste complete");
  }

  async function copyDirectory(fromPath: string, toPath: string) {
    await appkits.FileSystem.mkdir(toPath);
    const descendants = entriesRef.current
      .filter((entry) => entry.path.startsWith(`${fromPath}/`))
      .sort((left, right) => (left.kind === right.kind ? left.path.localeCompare(right.path) : left.kind === "directory" ? -1 : 1));
    for (const child of descendants) {
      const target = `${toPath}${child.path.slice(fromPath.length)}`;
      if (child.kind === "directory") await appkits.FileSystem.mkdir(target);
      else {
        const file = await appkits.FileSystem.read(child.path);
        await appkits.FileSystem.write({
          path: target,
          body: file.body,
          bodyBase64: file.bodyBase64,
          contentType: file.contentType || child.contentType,
        });
      }
    }
  }

  async function downloadEntry(entry: ExplorerEntry) {
    if (entry.kind !== "file") return;
    const file = await appkits.FileSystem.read(entry.path);
    const blob = file.bodyBase64
      ? base64ToBlob(file.bodyBase64, file.contentType || entry.contentType)
      : new Blob([file.body || ""], { type: file.contentType || entry.contentType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = entry.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function uploadFiles(files: File[], targetDirectory = currentPathRef.current, replace = false) {
    const targets = uploadTargets(
      entriesRef.current,
      targetDirectory,
      files.map((file) => file.name),
      replace,
    );
    for (const [index, file] of files.entries()) {
      const target = targets[index]?.path || joinPath(targetDirectory, sanitizeFilename(file.name) || "upload.bin");
      await appkits.FileSystem.write({
        path: target,
        bodyBase64: await fileToBase64(file),
        contentType: file.type || "application/octet-stream",
      });
    }
    setPendingUpload(null);
    await refresh();
    notify(files.length === 1 ? "Upload complete" : `${files.length} uploads complete`, "success");
  }

  function prepareUpload(files: File[], targetDirectory = currentPathRef.current) {
    if (files.length === 0) return;
    const conflicts = uploadTargets(
      entriesRef.current,
      targetDirectory,
      files.map((file) => file.name),
      true,
    )
      .filter((target) => target.conflict)
      .map((target) => target.path);
    if (conflicts.length > 0) {
      setPendingUpload({ items: files, targetDirectory, conflicts });
      return;
    }
    void uploadFiles(files, targetDirectory);
  }

  function commitPathEditor() {
    const next = pathFromVisiblePath(pathEditorValue);
    setPathEditing(false);
    navigate(next);
  }

  function startSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !listRef.current) return;
    if ((event.target as HTMLElement | null)?.closest("[data-explorer-entry='true']")) return;
    const rect = listRef.current.getBoundingClientRect();
    selectionStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      additive: event.metaKey || event.ctrlKey,
      baseSelection: event.metaKey || event.ctrlKey ? [...selectedPathsRef.current] : [],
    };
    setSelectionRect({
      left: event.clientX - rect.left + listRef.current.scrollLeft,
      top: event.clientY - rect.top + listRef.current.scrollTop,
      width: 0,
      height: 0,
    });
    if (!(event.metaKey || event.ctrlKey)) setSingleSelection(null);
  }

  React.useEffect(() => {
    const move = (event: PointerEvent) => {
      const selection = selectionStartRef.current;
      const list = listRef.current;
      if (!selection || !list) return;
      const listRect = list.getBoundingClientRect();
      const nextX = Math.max(listRect.left, Math.min(listRect.right, event.clientX));
      const nextY = Math.max(listRect.top, Math.min(listRect.bottom, event.clientY));
      const viewportRect = new DOMRect(
        Math.min(selection.x, nextX),
        Math.min(selection.y, nextY),
        Math.abs(nextX - selection.x),
        Math.abs(nextY - selection.y),
      );
      setSelectionRect({
        left: viewportRect.left - listRect.left + list.scrollLeft,
        top: viewportRect.top - listRect.top + list.scrollTop,
        width: viewportRect.width,
        height: viewportRect.height,
      });
      const hits = visibleEntriesWithPending
        .filter((entry) => {
          const element = rowRefs.current.get(entry.path);
          return element ? rectsIntersect(viewportRect, element.getBoundingClientRect()) : false;
        })
        .map((entry) => entry.path);
      setSelectedPaths(selection.additive ? [...new Set([...selection.baseSelection, ...hits])] : hits);
      setActivePath(hits[0] || selection.baseSelection[0] || null);
    };
    const up = () => {
      selectionStartRef.current = null;
      setSelectionRect(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [visibleEntriesWithPending]);

  const keyboardActionsRef = React.useRef<{
    activeEntry: ExplorerEntry | null;
    copyEntries: (mode: "copy" | "cut") => void;
    deleteEntries: (items: ExplorerEntry[]) => Promise<void>;
    openEntry: (entry: ExplorerEntry) => void;
    pasteInto: (targetDirectory: string) => Promise<void>;
    selectedEntries: ExplorerEntry[];
    startRename: (path: string | undefined) => void;
    visibleEntriesWithPending: ExplorerEntry[];
  } | null>(null);

  keyboardActionsRef.current = {
    activeEntry,
    copyEntries,
    deleteEntries,
    openEntry,
    pasteInto,
    selectedEntries,
    startRename,
    visibleEntriesWithPending,
  };

  React.useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!rootRef.current?.contains(document.activeElement)) return;
      if (isTextInputTarget(event.target)) return;
      const actions = keyboardActionsRef.current;
      if (!actions) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedPaths(actions.visibleEntriesWithPending.map((entry) => entry.path));
        setActivePath(actions.visibleEntriesWithPending[0]?.path || null);
      } else if (meta && event.key.toLowerCase() === "c") {
        event.preventDefault();
        actions.copyEntries("copy");
      } else if (meta && event.key.toLowerCase() === "x") {
        event.preventDefault();
        actions.copyEntries("cut");
      } else if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void actions.pasteInto(actions.activeEntry?.kind === "directory" ? actions.activeEntry.path : currentPathRef.current);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void actions.deleteEntries(actions.selectedEntries);
      } else if (event.key === "F2") {
        event.preventDefault();
        actions.startRename(actions.activeEntry?.path);
      } else if (event.key === "Enter" && actions.activeEntry) {
        event.preventDefault();
        actions.openEntry(actions.activeEntry);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const selectedCount = selectedEntries.length;
  const pasteTarget = activeEntry?.kind === "directory" ? activeEntry.path : currentPath;

  return (
    <div
      ref={rootRef}
      className="explorer"
      tabIndex={0}
      onPointerDown={() => rootRef.current?.focus()}
      onDragEnter={(event) => {
        if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDraggingFiles(true);
      }}
      onDragLeave={(event) => {
        if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDraggingFiles(false);
      }}
      onDrop={(event) => {
        if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
        event.preventDefault();
        dragDepthRef.current = 0;
        setDraggingFiles(false);
        prepareUpload(Array.from(event.dataTransfer.files || []), currentPath);
      }}
    >
      <input
        ref={uploadRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = "";
          prepareUpload(files, currentPath);
        }}
      />
      <header className="toolbar">
        <ToolbarButton label="Up" onClick={() => navigate(parentPath(currentPath))} disabled={currentPath === HOME_ROOT}>
          <FolderUp size={17} />
        </ToolbarButton>
        <ToolbarButton label="Refresh" onClick={() => void refresh()} disabled={isRefreshing}>
          <RefreshCw size={17} />
        </ToolbarButton>
        <ToolbarButton label="New folder" onClick={() => void createFolder()}>
          <FolderPlus size={17} />
        </ToolbarButton>
        <ToolbarButton label="New text file" onClick={() => void createFile(".txt")}>
          <FilePlus2 size={17} />
        </ToolbarButton>
        <ToolbarButton label="Upload" onClick={() => uploadRef.current?.click()}>
          <Upload size={17} />
        </ToolbarButton>
        <ToolbarButton label="Copy" onClick={() => copyEntries("copy")} disabled={selectedCount === 0}>
          <Copy size={17} />
        </ToolbarButton>
        <ToolbarButton label="Cut" onClick={() => copyEntries("cut")} disabled={selectedCount === 0}>
          <Scissors size={17} />
        </ToolbarButton>
        <ToolbarButton label="Paste" onClick={() => void pasteInto(pasteTarget)} disabled={!clipboard}>
          <ClipboardPaste size={17} />
        </ToolbarButton>
        <ToolbarButton label="Delete" onClick={() => void deleteEntries(selectedEntries)} disabled={selectedCount === 0}>
          <Trash2 size={17} />
        </ToolbarButton>
        <div className="view-switch" role="group" aria-label="View mode">
          <ToolbarButton label="Details view" onClick={() => setViewMode("details")} active={viewMode === "details"}>
            <List size={17} />
          </ToolbarButton>
          <ToolbarButton label="Icon view" onClick={() => setViewMode("icons")} active={viewMode === "icons"}>
            <LayoutGrid size={17} />
          </ToolbarButton>
          <ToolbarButton label="Gallery view" onClick={() => setViewMode("gallery")} active={viewMode === "gallery"}>
            <Images size={17} />
          </ToolbarButton>
        </div>
        <label className="search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this folder" />
        </label>
      </header>

      <nav className="breadcrumb" onDoubleClick={() => setPathEditing(true)}>
        {pathEditing ? (
          <input
            ref={pathInputRef}
            value={pathEditorValue}
            onChange={(event) => setPathEditorValue(event.target.value)}
            onBlur={commitPathEditor}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitPathEditor();
              if (event.key === "Escape") {
                setPathEditing(false);
                setPathEditorValue(visiblePath(currentPath));
              }
            }}
          />
        ) : (
          breadcrumbSegments(currentPath).map((segment, index) => (
            <React.Fragment key={segment.path}>
              {index > 0 ? <ChevronRight size={14} /> : null}
              <button onClick={() => navigate(segment.path)}>{segment.label}</button>
            </React.Fragment>
          ))
        )}
      </nav>

      <section className="workspace">
        <aside className="tree">
          <div className="pane-title">Locations</div>
          <Tree node={tree} currentPath={currentPath} onOpen={navigate} />
        </aside>

        <section className="files-pane" data-view={viewMode}>
          {viewMode === "details" ? (
            <div className="file-header">
              <span>Name</span>
              <span>Type</span>
              <span>Size</span>
            </div>
          ) : null}
          <div
            ref={listRef}
            className={`files files-${viewMode}`}
            onPointerDown={(event) => {
              startSelection(event);
              if ((event.target as HTMLElement | null)?.closest("[data-explorer-entry='true']")) return;
              beginLongPress(event, (point) => {
                void openContextMenu({
                  ...point,
                  type: selectedCount > 1 ? "selection" : "background",
                  targetDirectory: pasteTarget,
                });
              });
            }}
            onPointerMove={moveLongPress}
            onPointerCancel={clearLongPress}
            onPointerUp={clearLongPress}
            onContextMenu={(event) => {
              if ((event.target as HTMLElement | null)?.closest("[data-explorer-entry='true']")) return;
              event.preventDefault();
              void openContextMenu({
                x: event.clientX,
                y: event.clientY,
                type: selectedCount > 1 ? "selection" : "background",
                targetDirectory: pasteTarget,
              });
            }}
          >
            {visibleEntriesWithPending.map((entry) => {
              const selected = selectedEntrySet.has(entry.path);
              return (
                <button
                  key={entry.path}
                  ref={(element) => {
                    if (element) rowRefs.current.set(entry.path, element);
                    else rowRefs.current.delete(entry.path);
                  }}
                  type="button"
                  data-explorer-entry="true"
                  className="file-row"
                  data-view={viewMode}
                  data-selected={selected}
                  draggable={!entry.temporary}
                  onClick={(event) => handleRowClick(event, entry)}
                  onDoubleClick={() => {
                    if (!entry.temporary) openEntry(entry);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (entry.temporary) return;
                    beginLongPress(event, (point) => {
                      const selectedEntriesForMenu = selected && selectedEntries.length > 1 ? selectedEntries : [entry];
                      setSelectedPaths(selectedEntriesForMenu.map((item) => item.path));
                      setActivePath(entry.path);
                      void openContextMenu({
                        ...point,
                        type: selectedEntriesForMenu.length > 1 ? "selection" : "entry",
                        targetDirectory: entry.kind === "directory" ? entry.path : currentPath,
                        entry,
                      });
                    });
                  }}
                  onPointerMove={moveLongPress}
                  onPointerCancel={clearLongPress}
                  onPointerUp={clearLongPress}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (entry.temporary) return;
                    const menuSelection = selected && selectedEntries.length > 1 ? selectedEntries : [entry];
                    setSelectedPaths(menuSelection.map((item) => item.path));
                    setActivePath(entry.path);
                    void openContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      type: menuSelection.length > 1 ? "selection" : "entry",
                      targetDirectory: entry.kind === "directory" ? entry.path : currentPath,
                      entry,
                    });
                  }}
                  onDragStart={(event) => {
                    if (entry.temporary) {
                      event.preventDefault();
                      return;
                    }
                    const dragEntries = selected ? selectedEntries : [entry];
                    event.dataTransfer.effectAllowed = "copyMove";
                    event.dataTransfer.setData("application/x-appkits-file-entry", JSON.stringify(dragEntries.map((item) => item.path)));
                    event.dataTransfer.setData("text/plain", dragEntries.map((item) => item.name).join("\n"));
                  }}
                  onDragOver={(event) => {
                    if (entry.kind !== "directory") return;
                    if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(event) => {
                    if (entry.kind !== "directory") return;
                    const files = Array.from(event.dataTransfer.files || []);
                    if (files.length === 0) return;
                    event.preventDefault();
                    prepareUpload(files, entry.path);
                  }}
                >
                  <span className="file-main">
                    <FileIcon entry={entry} large={viewMode !== "details"} />
                    {renamingPath === entry.path ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onBlur={() => void finishRename(!pendingCreate)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void finishRename(true);
                          if (event.key === "Escape") void finishRename(false);
                        }}
                      />
                    ) : (
                      <span className="file-name">{entry.name}</span>
                    )}
                  </span>
                  <span className="file-meta">{fileTypeLabel(entry)}</span>
                  <span className="file-meta">{entry.kind === "directory" ? "--" : formatSize(entry.size)}</span>
                </button>
              );
            })}
            {visibleEntriesWithPending.length === 0 ? <div className="empty">This folder is empty.</div> : null}
            {selectionRect ? <div className="selection-rect" style={selectionRect as React.CSSProperties} /> : null}
          </div>
        </section>

        <aside className="details">
          <div className="pane-title">Details</div>
          {detailsEntry ? (
            <div className="details-content">
              <div className="details-heading">
                <FileIcon entry={detailsEntry} large />
                <div>
                  <h2>{detailsEntry.name}</h2>
                  <p>{fileTypeLabel(detailsEntry)}</p>
                </div>
              </div>
              <dl>
                <dt>Path</dt>
                <dd>{visiblePath(detailsEntry.path)}</dd>
                <dt>Size</dt>
                <dd>{detailsEntry.kind === "directory" ? "--" : formatSize(detailsEntry.size)}</dd>
                <dt>Content type</dt>
                <dd>{detailsEntry.contentType || detailsEntry.kind}</dd>
              </dl>
              <div className="details-actions">
                <button onClick={() => openEntry(detailsEntry)}>Open</button>
                <button onClick={() => startRename(detailsEntry.path)}>Rename</button>
                {detailsEntry.kind === "file" ? <button onClick={() => void downloadEntry(detailsEntry)}>Download</button> : null}
              </div>
              {preview ? <pre>{preview}</pre> : null}
            </div>
          ) : selectedCount > 1 ? (
            <p>{selectedCount} items selected</p>
          ) : (
            <p>Select a file or folder to inspect it.</p>
          )}
        </aside>
      </section>

      <footer
        className="statusbar"
        onPointerDown={(event) => {
          beginLongPress(event, (point) => {
            void openContextMenu({
              ...point,
              type: selectedCount > 0 ? "selection" : "background",
              targetDirectory: pasteTarget,
            });
          });
        }}
        onPointerMove={moveLongPress}
        onPointerCancel={clearLongPress}
        onPointerUp={clearLongPress}
        onContextMenu={(event) => {
          event.preventDefault();
          void openContextMenu({
            x: event.clientX,
            y: event.clientY,
            type: selectedCount > 0 ? "selection" : "background",
            targetDirectory: pasteTarget,
          });
        }}
      >
        <span>{status}</span>
        <span>{selectedCount > 0 ? `${selectedCount} selected` : visiblePath(currentPath)}</span>
      </footer>

      {draggingFiles ? (
        <div className="drop-overlay">
          <div>
            <strong>Drop files here</strong>
            <span>Upload to {visiblePath(currentPath)}</span>
          </div>
        </div>
      ) : null}

      {pendingUpload ? (
        <div className="modal">
          <div className="dialog">
            <h2>Overwrite existing files?</h2>
            <p>{pendingUpload.conflicts.length} item{pendingUpload.conflicts.length === 1 ? "" : "s"} already exist in this folder.</p>
            <div className="conflicts">
              {pendingUpload.conflicts.map((path) => (
                <div key={path}>{visiblePath(path)}</div>
              ))}
            </div>
            <div className="dialog-actions">
              <button onClick={() => setPendingUpload(null)}>Cancel</button>
              <button onClick={() => void uploadFiles(pendingUpload.items, pendingUpload.targetDirectory, false)}>Keep both</button>
              <button onClick={() => void uploadFiles(pendingUpload.items, pendingUpload.targetDirectory, true)}>Overwrite</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tree({ node, currentPath, onOpen }: { node: TreeNode; currentPath: string; onOpen: (path: string) => void }) {
  return (
    <div className="tree-node">
      <button data-active={node.path === currentPath} onClick={() => onOpen(node.path)}>
        {node.path === HOME_ROOT ? <FolderOpen size={16} /> : <Folder size={16} />}
        <span>{node.name}</span>
      </button>
      {node.children.length > 0 ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <Tree key={child.path} node={child} currentPath={currentPath} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className="toolbar-action" data-tooltip={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={label}
        data-active={active}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </span>
  );
}

function FileIcon({ entry, large = false }: { entry: ExplorerEntry; large?: boolean }) {
  const size = large ? 34 : 18;
  const [thumbnail, setThumbnail] = React.useState("");
  const label = fileTypeLabel(entry);

  React.useEffect(() => {
    if (label !== "Image" || entry.temporary) {
      setThumbnail("");
      return;
    }
    let cancelled = false;
    void appkits.FileSystem.read(entry.path)
      .then((file) => {
        if (cancelled || !file.bodyBase64) return;
        const contentType =
          file.contentType || entry.contentType || "image/png";
        setThumbnail(`data:${contentType};base64,${file.bodyBase64}`);
      })
      .catch(() => {
        if (!cancelled) setThumbnail("");
      });
    return () => {
      cancelled = true;
    };
  }, [entry.contentType, entry.path, entry.temporary, label]);

  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        className={large ? "file-thumbnail large" : "file-thumbnail"}
      />
    );
  }
  if (entry.kind === "directory") return <Folder size={size} className="icon-folder" />;
  if (label === "Image") return <FileImage size={size} className="icon-image" />;
  if (label === "Code file" || label === "HTML document") return <FileCode2 size={size} className="icon-code" />;
  return <FileText size={size} className="icon-file" />;
}

function decodeReadResult(file: Awaited<ReturnType<typeof appkits.FileSystem.read>>): string {
  if (typeof file.body === "string") return file.body;
  if (!file.bodyBase64) return "";
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(file.bodyBase64), (char) => char.charCodeAt(0)));
  } catch {
    return "";
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBlob(bodyBase64: string, contentType?: string): Blob {
  const bytes = Uint8Array.from(atob(bodyBase64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

function notify(title: string, variant: "success" | "error" | "info" = "info") {
  void appkits.Notification.show({ title, variant }).catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(<App />);
