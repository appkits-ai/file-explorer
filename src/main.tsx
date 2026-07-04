import React from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  FilePlus2,
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
import { parseAppKitsAppFile } from "@appkits-ai/sdk/app-file";
import * as appkits from "@appkits-ai/sdk/client";
import { getDesktopIconAssetPath } from "@appkits-ai/sdk/desktop-icons";
import { Button } from "@appkits-ai/ui";
import {
  HOME_ROOT,
  breadcrumbSegments,
  buildDirectoryTree,
  childEntries,
  contextMenuItemIdFromSelection,
  desktopFileIconName,
  fileTypeKind,
  filenameFromPath,
  formatSize,
  isTextPreviewable,
  isTextInputTarget,
  joinPath,
  mergeDirectoryListing,
  normalizePath,
  parentPath,
  pendingCreateEntry,
  pendingCreatePath,
  pendingCreateTarget,
  planMoveTargets,
  pathFromLaunchParams,
  pathFromVisiblePath,
  rectsIntersect,
  sanitizeFilename,
  searchEntries,
  selectedPathFromLaunchParams,
  shouldRefreshDirectoryForFilesChanged,
  uniquePath,
  uploadTargets,
  visiblePath,
  type ExplorerEntry,
  type FileTypeKind,
  type PendingCreateKind,
  type SelectionRect,
  type SelectionState,
  type TreeNode,
} from "./file-model";
import { pluralSuffix, t, type TranslationKey } from "./i18n";
import "./styles.css";

const DEFAULT_FILE_ICON_ASSET = "/icons/stitch/document_icon.svg";

type ContextMenuState =
  | { x: number; y: number; type: "background"; targetDirectory: string }
  | { x: number; y: number; type: "selection"; targetDirectory: string }
  | { x: number; y: number; type: "entry"; targetDirectory: string; entry: ExplorerEntry };

type ExplorerViewMode = "details" | "icons" | "gallery";
type HostContextMenuLabel = {
  type: "localized";
  values: Record<string, string>;
};
type HostContextMenuIcon = {
  type: "token";
  value: string;
};
type HostContextMenuCommandItem = {
  type: "action";
  id: string;
  label: HostContextMenuLabel;
  icon?: HostContextMenuIcon;
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
  label: HostContextMenuLabel;
  icon?: HostContextMenuIcon;
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
  initialName: string;
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

const FILE_TYPE_TRANSLATION_KEYS: Record<FileTypeKind, TranslationKey> = {
  select: "file.select",
  folder: "file.folder",
  app: "file.app",
  image: "file.image",
  audio: "file.audio",
  video: "file.video",
  archive: "file.archive",
  pdf: "file.pdf",
  document: "file.document",
  spreadsheet: "file.spreadsheet",
  presentation: "file.presentation",
  database: "file.database",
  markdown: "file.markdown",
  html: "file.html",
  json: "file.json",
  code: "file.code",
  text: "file.text",
  file: "file.file",
};

function systemLocale(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.language || "en";
}

function localizedAppTitle(locale: string | undefined): string {
  return t(locale, "app.title");
}

function displayPath(locale: string | undefined, path: string): string {
  void locale;
  return visiblePath(path);
}

function pathFromDisplayPath(locale: string | undefined, path: string): string {
  const trimmed = path.trim();
  const home = t(locale, "path.home");
  const aliases = [home, "home", "Home", "主页"];
  const matchedAlias = aliases.find(
    (alias) => trimmed.toLowerCase() === alias.toLowerCase(),
  );
  if (matchedAlias) {
    return pathFromVisiblePath("home");
  }
  const pathAlias = aliases.find((alias) =>
    trimmed.toLowerCase().startsWith(`${alias.toLowerCase()}/`),
  );
  if (pathAlias) {
    return pathFromVisiblePath(`home/${trimmed.slice(pathAlias.length + 1)}`);
  }
  return pathFromVisiblePath(trimmed);
}

function localizedFileType(locale: string | undefined, entry: ExplorerEntry | null | undefined): string {
  return t(locale, FILE_TYPE_TRANSLATION_KEYS[fileTypeKind(entry)]);
}

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
  const [pathEditorValue, setPathEditorValue] = React.useState(() => t(systemLocale(), "path.home"));
  const [viewMode, setViewMode] = React.useState<ExplorerViewMode>("details");
  const [clipboard, setClipboard] = React.useState<ClipboardState | null>(null);
  const [selectionRect, setSelectionRect] = React.useState<SelectionRect | null>(null);
  const [pendingCreate, setPendingCreate] = React.useState<PendingCreate | null>(null);
  const [pendingUpload, setPendingUpload] = React.useState<PendingUpload | null>(null);
  const [draggingFiles, setDraggingFiles] = React.useState(false);
  const [loadingDirectories, setLoadingDirectories] = React.useState<Set<string>>(() => new Set([HOME_ROOT]));
  const [loadedDirectories, setLoadedDirectories] = React.useState<Set<string>>(() => new Set());
  const [locale, setLocale] = React.useState(systemLocale);
  const [status, setStatus] = React.useState(() => t(systemLocale(), "status.ready"));
  const [preview, setPreview] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const uploadRef = React.useRef<HTMLInputElement | null>(null);
  const uploadTargetDirectoryRef = React.useRef(currentPath);
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);
  const pathInputRef = React.useRef<HTMLInputElement | null>(null);
  const selectionStartRef = React.useRef<SelectionState | null>(null);
  const dragDepthRef = React.useRef(0);
  const selectedPathsRef = React.useRef<string[]>([]);
  const entriesRef = React.useRef<ExplorerEntry[]>([]);
  const currentPathRef = React.useRef(currentPath);
  const loadedDirectoriesRef = React.useRef(loadedDirectories);
  const pendingLaunchSelectionRef = React.useRef<string | null>(null);
  const pendingCreateCommitRef = React.useRef(false);
  const contextMenuActionsRef = React.useRef(new Map<string, () => void>());
  const filesChangedRefreshTimeoutRef = React.useRef<number | null>(null);
  const refreshPromisesRef = React.useRef(new Map<string, Promise<void>>());
  const openerCacheRef = React.useRef(
    new Map<string, ShellFileOpenerSummary[]>(),
  );
  const openerRequestRef = React.useRef(
    new Map<string, Promise<ShellFileOpenerSummary[]>>(),
  );
  const longPressRef = React.useRef<{
    pointerId: number;
    x: number;
    y: number;
    timeoutId: number;
  } | null>(null);

  React.useEffect(() => {
    applyTheme(systemTheme());
    void appkits.theme.current().then(applyTheme).catch(() => undefined);
    return appkits.theme.onChange(applyTheme);
  }, []);

  React.useEffect(() => {
    selectedPathsRef.current = selectedPaths;
  }, [selectedPaths]);

  React.useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  React.useEffect(() => {
    loadedDirectoriesRef.current = loadedDirectories;
  }, [loadedDirectories]);

  React.useEffect(() => {
    currentPathRef.current = currentPath;
    setPathEditorValue(displayPath(locale, currentPath));
  }, [currentPath, locale]);

  const refresh = React.useCallback((directory = currentPathRef.current) => {
    const targetDirectory = normalizePath(directory);
    const pendingRefresh = refreshPromisesRef.current.get(targetDirectory);
    if (pendingRefresh) return pendingRefresh;
    const refreshPromise = (async () => {
      setLoadingDirectories((current) => {
        const next = new Set(current);
        next.add(targetDirectory);
        return next;
      });
      setStatus(
        t(locale, "status.refreshing", {
          path: displayPath(locale, targetDirectory),
        }),
      );
      try {
        const result = await appkits.files.list(targetDirectory);
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
        setLoadedDirectories((current) => {
          const next = new Set(current);
          next.add(targetDirectory);
          return next;
        });
        setStatus(
          t(locale, "status.folderItems", {
            count: listedEntries.length,
            path: displayPath(locale, targetDirectory),
            plural: pluralSuffix(locale, listedEntries.length),
          }),
        );
      } catch {
        notify(t(locale, "notify.refreshFailed"), "error");
        setStatus(
          t(locale, "status.refreshFailed", {
            path: displayPath(locale, targetDirectory),
          }),
        );
      } finally {
        setLoadingDirectories((current) => {
          const next = new Set(current);
          next.delete(targetDirectory);
          return next;
        });
      }
    })().finally(() => {
      refreshPromisesRef.current.delete(targetDirectory);
    });
    refreshPromisesRef.current.set(targetDirectory, refreshPromise);
    return refreshPromise;
  }, [locale]);

  React.useEffect(() => {
    const applyLocale = (nextLocale: string | undefined) => {
      const resolvedLocale = nextLocale || systemLocale();
      setLocale(resolvedLocale);
      void appkits.window.setTitle(localizedAppTitle(resolvedLocale));
    };
    applyLocale(systemLocale());
    void appkits.locale.current().then(applyLocale).catch(() => undefined);
    const offLocale = appkits.locale.onChange(applyLocale);
    void appkits.launch.params().then((params) => {
      const next = pathFromLaunchParams(params);
      pendingLaunchSelectionRef.current = selectedPathFromLaunchParams(params);
      markDirectoryLoading(next);
      setCurrentPath(next);
    });
    const offLaunch = appkits.launch.onChange((params) => {
      const next = pathFromLaunchParams(params);
      pendingLaunchSelectionRef.current = selectedPathFromLaunchParams(params);
      markDirectoryLoading(next);
      setCurrentPath(next);
      setSelectedPaths([]);
      setActivePath(null);
    });
    return () => {
      offLaunch();
      offLocale();
    };
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
    return appkits.contextMenu.onSelect((event) => {
      const itemId = contextMenuItemIdFromSelection(event);
      if (!itemId) return;
      const action = contextMenuActionsRef.current.get(itemId);
      contextMenuActionsRef.current.clear();
      action?.();
    });
  }, []);

  React.useEffect(() => {
    return appkits.files.onChanged((event) => {
      openerCacheRef.current.clear();
      openerRequestRef.current.clear();
      if (
        !shouldRefreshDirectoryForFilesChanged(
          currentPathRef.current,
          event.paths,
        )
      ) {
        return;
      }
      if (filesChangedRefreshTimeoutRef.current !== null) {
        window.clearTimeout(filesChangedRefreshTimeoutRef.current);
      }
      filesChangedRefreshTimeoutRef.current = window.setTimeout(() => {
        filesChangedRefreshTimeoutRef.current = null;
        void refresh(currentPathRef.current);
      }, 80);
    });
  }, [refresh]);

  React.useEffect(() => {
    return () => {
      if (filesChangedRefreshTimeoutRef.current !== null) {
        window.clearTimeout(filesChangedRefreshTimeoutRef.current);
      }
    };
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
  const isRefreshing = loadingDirectories.size > 0;
  const isCurrentDirectoryLoading = loadingDirectories.has(currentPath);
  const isCurrentDirectoryLoaded = loadedDirectories.has(currentPath);
  const showLoadingState =
    isCurrentDirectoryLoading && visibleEntriesWithPending.length === 0;
  const showEmptyState =
    !showLoadingState &&
    visibleEntriesWithPending.length === 0 &&
    (Boolean(query.trim()) || isCurrentDirectoryLoaded);

  React.useEffect(() => {
    if (!detailsEntry || detailsEntry.kind !== "file") {
      setPreview("");
      return;
    }
    if (!isTextPreviewable(detailsEntry)) {
      setPreview("");
      return;
    }
    let cancelled = false;
    void appkits.files.read(detailsEntry.path)
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

  function openerCacheKey(entry: ExplorerEntry): string {
    return [
      entry.path,
      entry.contentType || "",
      entry.local === true ? "local" : "remote",
    ].join("\n");
  }

  function cachedOpenersForEntry(
    entry: ExplorerEntry | undefined,
  ): ShellFileOpenerSummary[] {
    if (!entry || entry.kind !== "file") return [];
    return openerCacheRef.current.get(openerCacheKey(entry)) ?? [];
  }

  function prefetchOpenersForEntry(entry: ExplorerEntry | undefined): void {
    if (!entry || entry.kind !== "file") return;
    const key = openerCacheKey(entry);
    if (openerCacheRef.current.has(key) || openerRequestRef.current.has(key)) {
      return;
    }
    const request = appkits.files.openers({
      path: entry.path,
      name: entry.name,
      kind: "file",
      contentType: entry.contentType,
      local: entry.local,
    })
      .then((result) => {
        openerCacheRef.current.set(key, result.openers);
        return result.openers;
      })
      .catch(() => [])
      .finally(() => {
        openerRequestRef.current.delete(key);
      });
    openerRequestRef.current.set(key, request);
  }

  function openContextMenu(menu: ContextMenuState) {
    const actions = new Map<string, () => void>();
    const targetItems = menu.type === "entry" ? [menu.entry] : selectedEntries;
    const hostLabel = (value: string): HostContextMenuLabel => ({
      type: "localized",
      values: { en: value },
    });
    const hostIcon = (token: string): HostContextMenuIcon => ({
      type: "token",
      value: token,
    });
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
      type: "action",
      id: registerContextAction(actions, id, action),
      label: hostLabel(label),
      icon: hostIcon(icon),
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
      label: hostLabel(label),
      icon: hostIcon(icon),
      items,
    });
    const viewItems: HostContextMenuItem[] = [
      item("view-details", t(locale, "view.details"), "list", () => setViewMode("details"), {
        checked: viewMode === "details",
      }),
      item("view-icons", t(locale, "view.icons"), "grid", () => setViewMode("icons"), {
        checked: viewMode === "icons",
      }),
      item("view-gallery", t(locale, "view.gallery"), "gallery", () => setViewMode("gallery"), {
        checked: viewMode === "gallery",
      }),
    ];
    const viewMenu = () => submenu("view", t(locale, "view.mode"), "view", viewItems);
    const newMenu = () =>
      submenu("new", t(locale, "menu.new"), "new-file", [
        item(
          "new-folder",
          t(locale, "menu.newFolder"),
          "new-folder",
          () => void createFolder(),
          { shortcut: "Ctrl+Shift+N" },
        ),
        separator("new-separator"),
        item("new-text", t(locale, "menu.newText"), "new-file", () => void createFile(".txt")),
        item("new-markdown", t(locale, "menu.newMarkdown"), "new-file", () =>
          void createFile(".md"),
        ),
        item("new-html", t(locale, "menu.newHtml"), "new-file", () =>
          void createFile(".html"),
        ),
      ]);
    const openWithMenu = (
      entry: ExplorerEntry | undefined,
      openers: ShellFileOpenerSummary[],
      keyPrefix: string,
    ): HostContextMenuItem | null => {
      if (!entry || entry.kind !== "file" || openers.length === 0) return null;
      return submenu(
        `${keyPrefix}-open-with`,
        t(locale, "action.openWith"),
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
    if (menu.type === "selection" && targetItems.length === 1) {
      prefetchOpenersForEntry(targetItems[0]);
    }
    if (menu.type === "entry") prefetchOpenersForEntry(menu.entry);
    const selectionOpeners =
      menu.type === "selection" && targetItems.length === 1
        ? cachedOpenersForEntry(targetItems[0])
        : [];
    const entryOpeners =
      menu.type === "entry" ? cachedOpenersForEntry(menu.entry) : [];
    const menuItems: Array<HostContextMenuItem | null> =
      menu.type === "background"
        ? [
            clipboard
              ? item(
                  "paste",
                  t(locale, "action.paste"),
                  "paste",
                  () => void pasteInto(menu.targetDirectory),
                  { shortcut: "Ctrl+V" },
                )
              : null,
            clipboard ? separator("clipboard-separator") : null,
            viewMenu(),
            newMenu(),
            separator("background-action-separator"),
            item("upload", t(locale, "action.uploadFiles"), "upload", () =>
              requestUpload(menu.targetDirectory),
            ),
            item(
              "refresh",
              t(locale, "action.refresh"),
              "refresh",
              () => void refresh(menu.targetDirectory),
              { shortcut: "Ctrl+R" },
            ),
          ]
        : menu.type === "selection"
          ? [
              item(
                "open",
                t(locale, "action.open"),
                "open",
                () => targetItems[0] && openEntry(targetItems[0]),
                { disabled: targetItems.length !== 1, shortcut: "Enter" },
              ),
              openWithMenu(targetItems[0], selectionOpeners, "selection"),
              separator("selection-open-separator"),
              item(
                "copy",
                t(locale, "action.copySelected"),
                "copy",
                () => copyEntries("copy", targetItems),
                { shortcut: "Ctrl+C" },
              ),
              item(
                "cut",
                t(locale, "action.cutSelected"),
                "cut",
                () => copyEntries("cut", targetItems),
                { shortcut: "Ctrl+X" },
              ),
              clipboard
                ? item(
                    "paste",
                    t(locale, "action.paste"),
                    "paste",
                    () => void pasteInto(menu.targetDirectory),
                    { shortcut: "Ctrl+V" },
                  )
                : null,
              separator("selection-action-separator"),
              item(
                "rename",
                t(locale, "action.rename"),
                "rename",
                () => startRename(targetItems[0]?.path),
                { disabled: targetItems.length !== 1, shortcut: "F2" },
              ),
              item(
                "delete",
                t(locale, "action.deleteSelected"),
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
                t(locale, "action.open"),
                menu.entry.kind === "directory" ? "folder" : "file",
                () => openEntry(menu.entry),
                { shortcut: "Enter" },
              ),
              openWithMenu(menu.entry, entryOpeners, "entry"),
              separator("entry-open-separator"),
              item("copy", t(locale, "action.copy"), "copy", () => copyEntries("copy", targetItems), {
                shortcut: "Ctrl+C",
              }),
              item("cut", t(locale, "action.cut"), "cut", () => copyEntries("cut", targetItems), {
                shortcut: "Ctrl+X",
              }),
              menu.entry.kind === "directory" && clipboard
                ? item(
                    "paste",
                    t(locale, "action.paste"),
                    "paste",
                    () => void pasteInto(menu.entry.path),
                    { shortcut: "Ctrl+V" },
                  )
                : null,
              separator("entry-action-separator"),
              item(
                "download",
                t(locale, "action.download"),
                "download",
                () => void downloadEntry(menu.entry),
                { disabled: menu.entry.kind !== "file" },
              ),
              item(
                "rename",
                t(locale, "action.rename"),
                "rename",
                () => startRename(menu.entry.path),
                { shortcut: "F2" },
              ),
              item(
                "delete",
                t(locale, "action.delete"),
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
                t(locale, "action.refreshFolder"),
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
    void appkits.contextMenu.open({
      x: menu.x,
      y: menu.y,
      items: hostMenuItems as appkits.AppKitsContextMenuItem[],
    }).catch(() => {
      contextMenuActionsRef.current.clear();
      notify(t(locale, "notify.contextMenuFailed"), "error");
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

  function markDirectoryLoading(path: string) {
    const next = normalizePath(path);
    if (loadedDirectoriesRef.current.has(next)) return;
    setLoadingDirectories((current) => {
      if (current.has(next)) return current;
      const updated = new Set(current);
      updated.add(next);
      return updated;
    });
  }

  function navigate(path: string) {
    const next = normalizePath(path);
    setPendingCreate(null);
    setRenamingPath(null);
    markDirectoryLoading(next);
    setCurrentPath(next);
    setSelectedPaths([]);
    setActivePath(null);
    void appkits.contextMenu.close().catch(() => undefined);
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
    setStatus(t(locale, "status.opening", { name: entry.name }));
    void appkits.files.open({
      path: entry.path,
      name: entry.name,
      kind: "file",
      contentType: entry.contentType,
      local: entry.local,
    })
      .then((result) => {
        setStatus(
          result.openerLabel
            ? t(locale, "status.openingWith", { name: entry.name, opener: result.openerLabel })
            : t(locale, "status.opening", { name: entry.name }),
        );
      })
      .catch(() => {
        notify(t(locale, "notify.noShellOpener"), "error");
        setStatus(t(locale, "status.couldNotOpen", { name: entry.name }));
      });
  }

  function openEntryWithShell(entry: ExplorerEntry, openerId?: string) {
    if (entry.kind === "directory") {
      navigate(entry.path);
      return;
    }
    setSingleSelection(entry.path);
    setPreview("");
    setStatus(t(locale, "status.opening", { name: entry.name }));
    void appkits.files.open({
      path: entry.path,
      name: entry.name,
      kind: "file",
      contentType: entry.contentType,
      local: entry.local,
      openerId,
    })
      .then((result) => {
        setStatus(
          result.openerLabel
            ? t(locale, "status.openingWith", { name: entry.name, opener: result.openerLabel })
            : t(locale, "status.opening", { name: entry.name }),
        );
      })
      .catch(() => {
        notify(t(locale, "notify.openWithFailed"), "error");
        setStatus(t(locale, "status.couldNotOpen", { name: entry.name }));
      });
  }

  function openFilesPaneContextMenu(event: React.MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement | null)?.closest("[data-explorer-entry='true']")) return;
    event.preventDefault();
    void openContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: selectedCount > 1 ? "selection" : "background",
      targetDirectory: pasteTarget,
    });
  }

  function openTreeContextMenu(event: React.MouseEvent<HTMLElement>, targetDirectory = currentPath) {
    event.preventDefault();
    event.stopPropagation();
    void openContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: "background",
      targetDirectory,
    });
  }

  function openDetailsContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    if (detailsEntry) {
      void openContextMenu({
        x: event.clientX,
        y: event.clientY,
        type: "entry",
        targetDirectory:
          detailsEntry.kind === "directory" ? detailsEntry.path : parentPath(detailsEntry.path),
        entry: detailsEntry,
      });
      return;
    }
    void openContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: selectedCount > 0 ? "selection" : "background",
      targetDirectory: pasteTarget,
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
    const defaultName =
      kind === "directory"
        ? t(locale, "new.folderName")
        : `${t(locale, "new.untitled")}${extension}`;
    const path = uniquePath(entriesRef.current, directory, defaultName);
    const pendingPath = pendingCreatePath(directory, kind);
    const initialName = filenameFromPath(path);
    void appkits.contextMenu.close().catch(() => undefined);
    setPendingCreate({
      kind,
      directory,
      initialName,
      extension: kind === "file" ? extension : undefined,
    });
    setRenamingPath(pendingPath);
    setRenameValue(initialName);
    setSingleSelection(pendingPath);
    setStatus(kind === "directory" ? t(locale, "status.creatingFolder") : t(locale, "status.creatingFile"));
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
        const target = pendingCreateTarget(
          entriesRef.current,
          pending.directory,
          pending.initialName,
          renameValue,
        );
        if (!target) return;
        if (target.exists) {
          notify(t(locale, "notify.nameExists"), "error");
          return;
        }
        if (pending.kind === "directory") {
          await appkits.files.mkdir(target.path);
        } else {
          const extension = pending.extension || ".txt";
          await appkits.files.write({
            path: target.path,
            body: TEXT_FILE_BODY[extension],
            contentType: TEXT_FILE_TYPE[extension],
          });
        }
        await refresh();
        setSingleSelection(target.path);
        setStatus(pending.kind === "directory" ? t(locale, "status.folderCreated") : t(locale, "status.fileCreated"));
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
    await appkits.files.move(entry.path, target);
    await refresh();
    setSingleSelection(target);
    setStatus(t(locale, "status.itemRenamed"));
  }

  async function deleteEntries(items: ExplorerEntry[]) {
    if (items.length === 0) {
      setStatus(t(locale, "status.selectItemsToDelete"));
      return;
    }
    setStatus(
      t(locale, "status.deleting", {
        count: items.length,
        plural: pluralSuffix(locale, items.length),
      }),
    );
    try {
      for (const entry of items) await appkits.files.delete(entry.path);
      setSelectedPaths([]);
      setActivePath(null);
      await refresh();
      notify(t(locale, items.length === 1 ? "notify.deletedOne" : "notify.deletedMany"), "success");
    } catch {
      notify(t(locale, "notify.deleteFailed"), "error");
      setStatus(t(locale, "status.deleteFailed"));
    }
  }

  function copyEntries(mode: "copy" | "cut", items = selectedEntries) {
    if (items.length === 0) return;
    setClipboard({ mode, entries: items });
    setStatus(
      t(locale, mode === "copy" ? "status.copied" : "status.cut", {
        count: items.length,
        plural: pluralSuffix(locale, items.length),
      }),
    );
  }

  async function pasteInto(targetDirectory: string) {
    if (!clipboard) return;
    for (const entry of clipboard.entries) {
      const target = uniquePath(entriesRef.current, targetDirectory, entry.name);
      if (entry.kind === "directory") {
        await copyDirectory(entry.path, target);
      } else {
        const file = await appkits.files.read(entry.path);
        await appkits.files.write({
          path: target,
          body: file.body,
          bodyBase64: file.bodyBase64,
          contentType: file.contentType || entry.contentType,
        });
      }
      if (clipboard.mode === "cut") await appkits.files.delete(entry.path);
    }
    if (clipboard.mode === "cut") setClipboard(null);
    await refresh();
    setStatus(t(locale, "status.pasteComplete"));
  }

  function fileTransferEntries(items: ExplorerEntry[]): appkits.AppKitsFileTransferEntry[] {
    return items.map((entry) => ({
      path: entry.path,
      name: entry.name,
      kind: entry.kind,
      ...(entry.contentType ? { contentType: entry.contentType } : {}),
      local: entry.local === true,
    }));
  }

  function draggedFileTransferPaths(dataTransfer: DataTransfer): string[] {
    const shared = appkits.parseAppKitsFileTransferEntries(
      dataTransfer.getData(appkits.APPKITS_FILE_TRANSFER_MIME),
    );
    if (shared.length > 0) return shared.map((entry) => entry.path);
    try {
      const legacy = JSON.parse(
        dataTransfer.getData(appkits.APPKITS_FILE_TRANSFER_LEGACY_MIME),
      ) as unknown;
      if (!Array.isArray(legacy)) return [];
      return legacy.filter(
        (path): path is string =>
          typeof path === "string" && path.trim().length > 0,
      );
    } catch {
      return [];
    }
  }

  function hasInternalFileTransfer(types: readonly string[]): boolean {
    return (
      types.includes(appkits.APPKITS_FILE_TRANSFER_MIME) ||
      types.includes(appkits.APPKITS_FILE_TRANSFER_LEGACY_MIME)
    );
  }

  async function moveDroppedEntries(
    event: React.DragEvent,
    targetDirectory: string,
  ): Promise<boolean> {
    const paths = draggedFileTransferPaths(event.dataTransfer);
    if (paths.length === 0) return false;
    event.preventDefault();
    event.stopPropagation();
    const targets = planMoveTargets(
      entriesRef.current,
      paths,
      targetDirectory,
    );
    if (targets.length === 0) return true;
    try {
      for (const target of targets) {
        await appkits.files.move(target.fromPath, target.toPath);
      }
      const refreshTargets = new Set([
        currentPathRef.current,
        normalizePath(targetDirectory),
        ...targets.map((target) => parentPath(target.fromPath)),
      ]);
      await Promise.all([...refreshTargets].map((path) => refresh(path)));
      setSingleSelection(targets[targets.length - 1]?.toPath || null);
      setStatus(t(locale, "status.pasteComplete"));
    } catch {
      notify(t(locale, "notify.refreshFailed"), "error");
      setStatus(t(locale, "status.refreshFailed", { path: displayPath(locale, targetDirectory) }));
    }
    return true;
  }

  async function copyDirectory(fromPath: string, toPath: string) {
    await appkits.files.mkdir(toPath);
    const descendants = entriesRef.current
      .filter((entry) => entry.path.startsWith(`${fromPath}/`))
      .sort((left, right) => (left.kind === right.kind ? left.path.localeCompare(right.path) : left.kind === "directory" ? -1 : 1));
    for (const child of descendants) {
      const target = `${toPath}${child.path.slice(fromPath.length)}`;
      if (child.kind === "directory") await appkits.files.mkdir(target);
      else {
        const file = await appkits.files.read(child.path);
        await appkits.files.write({
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
    const file = await appkits.files.read(entry.path);
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
      await appkits.files.write({
        path: target,
        bodyBase64: await fileToBase64(file),
        contentType: file.type || "application/octet-stream",
      });
    }
    setPendingUpload(null);
    await refresh();
    notify(
      files.length === 1
        ? t(locale, "notify.uploadOne")
        : t(locale, "notify.uploadMany", { count: files.length }),
      "success",
    );
  }

  function requestUpload(targetDirectory = currentPathRef.current) {
    const input = uploadRef.current;
    uploadTargetDirectoryRef.current = normalizePath(targetDirectory);
    if (!input) return;
    input.value = "";
    input.click();
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
    const next = pathFromDisplayPath(locale, pathEditorValue);
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
        const types = Array.from(event.dataTransfer.types || []);
        if (hasInternalFileTransfer(types)) {
          event.preventDefault();
          return;
        }
        if (!types.includes("Files")) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setDraggingFiles(true);
      }}
      onDragOver={(event) => {
        const types = Array.from(event.dataTransfer.types || []);
        if (hasInternalFileTransfer(types)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          return;
        }
        if (!types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDraggingFiles(true);
      }}
      onDragLeave={(event) => {
        const types = Array.from(event.dataTransfer.types || []);
        if (hasInternalFileTransfer(types)) return;
        if (!types.includes("Files")) return;
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDraggingFiles(false);
      }}
      onDrop={(event) => {
        void (async () => {
          if (await moveDroppedEntries(event, currentPath)) return;
          if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
          event.preventDefault();
          dragDepthRef.current = 0;
          setDraggingFiles(false);
          prepareUpload(Array.from(event.dataTransfer.files || []), currentPath);
        })();
      }}
    >
      <input
        ref={uploadRef}
        type="file"
        multiple
        className="file-picker"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = "";
          prepareUpload(files, uploadTargetDirectoryRef.current);
          uploadTargetDirectoryRef.current = currentPathRef.current;
        }}
      />
      <header className="toolbar">
        <ToolbarButton label={t(locale, "toolbar.up")} onClick={() => navigate(parentPath(currentPath))} disabled={currentPath === HOME_ROOT}>
          <FolderUp size={17} />
        </ToolbarButton>
        <ToolbarButton label={t(locale, "toolbar.refresh")} onClick={() => void refresh()} disabled={isRefreshing}>
          <RefreshCw size={17} className={isRefreshing ? "refresh-icon spinning" : "refresh-icon"} />
        </ToolbarButton>
        <ToolbarButton label={t(locale, "toolbar.newFolder")} onClick={() => void createFolder()}>
          <FolderPlus size={17} />
        </ToolbarButton>
        <ToolbarButton label={t(locale, "toolbar.newTextFile")} onClick={() => void createFile(".txt")}>
          <FilePlus2 size={17} />
        </ToolbarButton>
        <ToolbarButton label={t(locale, "toolbar.upload")} onClick={() => requestUpload(currentPath)}>
          <Upload size={17} />
        </ToolbarButton>
        <ToolbarButton label={t(locale, "toolbar.copy")} onClick={() => copyEntries("copy")} disabled={selectedCount === 0}>
          <Copy size={17} />
        </ToolbarButton>
        <ToolbarButton label={t(locale, "toolbar.cut")} onClick={() => copyEntries("cut")} disabled={selectedCount === 0}>
          <Scissors size={17} />
        </ToolbarButton>
        <ToolbarButton label={t(locale, "toolbar.paste")} onClick={() => void pasteInto(pasteTarget)} disabled={!clipboard}>
          <ClipboardPaste size={17} />
        </ToolbarButton>
        <ToolbarButton label={t(locale, "toolbar.delete")} onClick={() => void deleteEntries(selectedEntries)} disabled={selectedCount === 0}>
          <Trash2 size={17} />
        </ToolbarButton>
        <div className="view-switch" role="group" aria-label={t(locale, "view.mode")}>
          <ToolbarButton label={t(locale, "toolbar.detailsView")} onClick={() => setViewMode("details")} active={viewMode === "details"}>
            <List size={17} />
          </ToolbarButton>
          <ToolbarButton label={t(locale, "toolbar.iconView")} onClick={() => setViewMode("icons")} active={viewMode === "icons"}>
            <LayoutGrid size={17} />
          </ToolbarButton>
          <ToolbarButton label={t(locale, "toolbar.galleryView")} onClick={() => setViewMode("gallery")} active={viewMode === "gallery"}>
            <Images size={17} />
          </ToolbarButton>
        </div>
        <label className="search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t(locale, "placeholder.search")} />
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
                setPathEditorValue(displayPath(locale, currentPath));
              }
            }}
          />
        ) : (
          breadcrumbSegments(currentPath).map((segment, index) => (
            <React.Fragment key={segment.path}>
              {index > 0 ? <ChevronRight size={14} /> : null}
              <button onClick={() => navigate(segment.path)}>
                {segment.path === HOME_ROOT ? t(locale, "path.home") : segment.label}
              </button>
            </React.Fragment>
          ))
        )}
      </nav>

      <section className="workspace">
        <aside className="tree" onContextMenu={(event) => openTreeContextMenu(event, currentPath)}>
          <div className="pane-title">{t(locale, "pane.locations")}</div>
          <Tree
            node={tree}
            currentPath={currentPath}
            locale={locale}
            onOpen={navigate}
            openTreeContextMenu={openTreeContextMenu}
            moveDroppedEntries={moveDroppedEntries}
          />
        </aside>

        <section className="files-pane" data-view={viewMode} onContextMenu={openFilesPaneContextMenu}>
          {viewMode === "details" ? (
            <div className="file-header">
              <span>{t(locale, "header.name")}</span>
              <span>{t(locale, "header.type")}</span>
              <span>{t(locale, "header.size")}</span>
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
              event.stopPropagation();
              openFilesPaneContextMenu(event);
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
                    appkits.writeAppKitsFileTransferData(
                      event.dataTransfer,
                      fileTransferEntries(dragEntries),
                    );
                  }}
                  onDragOver={(event) => {
                    if (entry.kind !== "directory") return;
                    const types = Array.from(event.dataTransfer.types || []);
                    if (!hasInternalFileTransfer(types) && !types.includes("Files")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = hasInternalFileTransfer(types) ? "move" : "copy";
                  }}
                  onDrop={(event) => {
                    if (entry.kind !== "directory") return;
                    void (async () => {
                      if (await moveDroppedEntries(event, entry.path)) return;
                      const files = Array.from(event.dataTransfer.files || []);
                      if (files.length === 0) return;
                      event.preventDefault();
                      prepareUpload(files, entry.path);
                    })();
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
                        onBlur={() => void finishRename(true)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void finishRename(true);
                          if (event.key === "Escape") void finishRename(false);
                        }}
                      />
                    ) : (
                      <span className="file-name">{entry.name}</span>
                    )}
                  </span>
                  <span className="file-meta">{localizedFileType(locale, entry)}</span>
                  <span className="file-meta">{entry.kind === "directory" ? "--" : formatSize(entry.size)}</span>
                </button>
              );
            })}
            {showLoadingState ? (
              <div
                className="empty loading-state"
                role="status"
                aria-label={t(locale, "loading.folder")}
              >
                <RefreshCw size={16} className="refresh-icon spinning" />
              </div>
            ) : null}
            {showEmptyState ? (
              <div className="empty">
                {query.trim() ? t(locale, "empty.search") : t(locale, "empty.folder")}
              </div>
            ) : null}
            {selectionRect ? <div className="selection-rect" style={selectionRect as React.CSSProperties} /> : null}
          </div>
        </section>

        <aside className="details" onContextMenu={(event) => openDetailsContextMenu(event)}>
          <div className="pane-title">{t(locale, "pane.details")}</div>
          {detailsEntry ? (
            <div className="details-content">
              <div className="details-heading">
                <FileIcon entry={detailsEntry} large />
                <div>
                  <h2>{detailsEntry.name}</h2>
                  <p>{localizedFileType(locale, detailsEntry)}</p>
                </div>
              </div>
              <dl>
                <dt>{t(locale, "details.path")}</dt>
                <dd>{displayPath(locale, detailsEntry.path)}</dd>
                <dt>{t(locale, "details.size")}</dt>
                <dd>{detailsEntry.kind === "directory" ? "--" : formatSize(detailsEntry.size)}</dd>
                <dt>{t(locale, "details.contentType")}</dt>
                <dd>{detailsEntry.contentType || detailsEntry.kind}</dd>
              </dl>
              <div className="details-actions">
                <button onClick={() => openEntry(detailsEntry)}>{t(locale, "action.open")}</button>
                <button onClick={() => startRename(detailsEntry.path)}>{t(locale, "action.rename")}</button>
                {detailsEntry.kind === "file" ? (
                  <button onClick={() => void downloadEntry(detailsEntry)}>{t(locale, "action.download")}</button>
                ) : null}
              </div>
              {preview ? <pre>{preview}</pre> : null}
            </div>
          ) : selectedCount > 1 ? (
            <p>{t(locale, "status.selectedMany", { count: selectedCount })}</p>
          ) : (
            <p>{t(locale, "file.select")}</p>
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
        <span>
          {selectedCount > 0
            ? t(locale, "status.selected", { count: selectedCount })
            : displayPath(locale, currentPath)}
        </span>
      </footer>

      {draggingFiles ? (
        <div className="drop-overlay">
          <div>
            <strong>{t(locale, "drop.title")}</strong>
            <span>{t(locale, "drop.subtitle", { path: displayPath(locale, currentPath) })}</span>
          </div>
        </div>
      ) : null}

      {pendingUpload ? (
        <div className="modal">
          <div className="dialog">
            <h2>{t(locale, "dialog.overwriteTitle")}</h2>
            <p>
              {t(locale, "dialog.conflictMessage", {
                count: pendingUpload.conflicts.length,
                plural: pluralSuffix(locale, pendingUpload.conflicts.length),
              })}
            </p>
            <div className="conflicts">
              {pendingUpload.conflicts.map((path) => (
                <div key={path}>{displayPath(locale, path)}</div>
              ))}
            </div>
            <div className="dialog-actions">
              <button onClick={() => setPendingUpload(null)}>{t(locale, "action.cancel")}</button>
              <button onClick={() => void uploadFiles(pendingUpload.items, pendingUpload.targetDirectory, false)}>{t(locale, "action.keepBoth")}</button>
              <button onClick={() => void uploadFiles(pendingUpload.items, pendingUpload.targetDirectory, true)}>{t(locale, "action.overwrite")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tree({
  node,
  currentPath,
  locale,
  onOpen,
  openTreeContextMenu,
  moveDroppedEntries,
}: {
  node: TreeNode;
  currentPath: string;
  locale: string;
  onOpen: (path: string) => void;
  openTreeContextMenu: (event: React.MouseEvent<HTMLElement>, targetDirectory: string) => void;
  moveDroppedEntries: (
    event: React.DragEvent,
    targetDirectory: string,
  ) => Promise<boolean>;
}) {
  return (
    <div className="tree-node">
      <button
        data-active={node.path === currentPath}
        onClick={() => onOpen(node.path)}
        onContextMenu={(event) => openTreeContextMenu(event, node.path)}
        onDragOver={(event) => {
          const types = Array.from(event.dataTransfer.types || []);
          if (
            !types.includes(appkits.APPKITS_FILE_TRANSFER_MIME) &&
            !types.includes(appkits.APPKITS_FILE_TRANSFER_LEGACY_MIME)
          ) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          void moveDroppedEntries(event, node.path);
        }}
      >
        {node.path === HOME_ROOT ? <FolderOpen size={16} /> : <Folder size={16} />}
        <span>{node.path === HOME_ROOT ? t(locale, "path.home") : node.name}</span>
      </button>
      {node.children.length > 0 ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <Tree
              key={child.path}
              node={child}
              currentPath={currentPath}
              locale={locale}
              onOpen={onOpen}
              openTreeContextMenu={openTreeContextMenu}
              moveDroppedEntries={moveDroppedEntries}
            />
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
  const [thumbnail, setThumbnail] = React.useState("");
  const [appIconUrl, setAppIconUrl] = React.useState("");
  const [appIconFailed, setAppIconFailed] = React.useState(false);
  const type = fileTypeKind(entry);
  const iconName = desktopFileIconName(entry);
  const iconAsset = getDesktopIconAssetPath(iconName) || DEFAULT_FILE_ICON_ASSET;

  React.useEffect(() => {
    if (type !== "image" || entry.temporary) {
      setThumbnail("");
      return;
    }
    let cancelled = false;
    void appkits.files.read(entry.path)
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
  }, [entry.contentType, entry.path, entry.temporary, type]);

  React.useEffect(() => {
    if (type !== "app" || entry.temporary) {
      setAppIconUrl("");
      setAppIconFailed(false);
      return;
    }
    let cancelled = false;
    void appkits.files.read(entry.path)
      .then((file) => {
        if (cancelled) return;
        const appFile = parseAppKitsAppFile(decodeReadResult(file));
        setAppIconUrl(appFile?.marketplaceIconUrl || appFile?.iconUrl || "");
        setAppIconFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setAppIconUrl("");
          setAppIconFailed(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry.path, entry.temporary, entry.updatedAt, type]);

  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        className={large ? "file-thumbnail large" : "file-thumbnail"}
      />
    );
  }
  if (appIconUrl && !appIconFailed) {
    return (
      <img
        src={appIconUrl}
        alt=""
        className={large ? "file-icon-image large" : "file-icon-image"}
        onError={() => setAppIconFailed(true)}
      />
    );
  }
  if (type === "app") {
    return (
      <span
        className={large ? "file-app-icon-placeholder large" : "file-app-icon-placeholder"}
        aria-hidden="true"
      />
    );
  }
  return (
    <span className="file-icon" data-icon={iconName} data-large={large ? "true" : undefined}>
      <img src={iconAsset} alt="" className="file-icon-asset" />
    </span>
  );
}

function decodeReadResult(file: Awaited<ReturnType<typeof appkits.files.read>>): string {
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
  void appkits.notifications.show({ title, variant }).catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(<App />);
