/**
 * 核对 File Explorer 菜单、刷新与产品 Home 补齐的源码契约。
 * Verifies File Explorer menu, refresh, and product Home ensure source contracts.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(relativePath), "utf8");
const compact = (source: string) =>
  source
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\(\s+/g, "(")
    .replace(/,\s+\)/g, ")")
    .replace(/\s+\)/g, ")");

describe("File Explorer mobile menu contracts", () => {
  it("delegates context menus to the parent shell", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("appkits.contextMenu.open({");
    expect(source).toContain("appkits.contextMenu.onSelect");
    expect(source).toContain("contextMenuActionsRef");
    expect(source).toContain('type: "action"');
    expect(source).toContain('type: "separator"');
    expect(source).toContain('type: "submenu"');
    expect(source).toContain('type: "localized"');
    expect(source).toContain('type: "token"');
    expect(source).toContain("label: hostLabel(label)");
    expect(source).toContain("icon: hostIcon(icon)");
    expect(source).toContain("values: { en: value }");
    expect(source).toContain("value: token");
    expect(source).toContain("shortcut: options.shortcut");
    expect(source).toContain("checked: options.checked");
    expect(source).toContain('"gallery"');
    expect(source).not.toContain('type: "item"');
    expect(source).not.toContain('type?: "item"');
    expect(source).not.toContain("function ContextMenu(");
    expect(source).not.toContain('className="context-menu"');
  });

  it("delegates file opening and open-with choices to the parent shell", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("appkits.files.open({");
    expect(source).toContain("appkits.files.openers({");
    expect(source).toContain("function openEntryWithShell(");
    expect(source).toContain('"action.openWith"');
    expect(source).toContain('"action.terminal"');
    expect(source).toContain('"action.terminalContainer"');
    expect(source).toContain('appkits.apps');
    expect(source).toContain('open("plugin:bash"');
    expect(source).toContain("opener.id");
    expect(source).not.toContain("setStatus(`Opened ${entry.name}`)");
  });

  it("renders breadcrumb model labels and normalizes virtual navigation", () => {
    const source = readSource("src/main.tsx");
    const breadcrumbSource = source.slice(
      source.indexOf('<nav className="breadcrumb"'),
      source.indexOf('<section className="workspace">'),
    );
    const navigateSource = source.slice(
      source.indexOf("function navigate("),
      source.indexOf("function setSingleSelection("),
    );

    expect(breadcrumbSource).toContain("{segment.label}");
    expect(breadcrumbSource).not.toContain("segment.path === HOME_ROOT ?");
    expect(navigateSource).toContain("const next = normalizePath(path);");
    expect(navigateSource).toContain("setCurrentPath(next);");
    expect(navigateSource).not.toContain("setCurrentPath(path);");
  });

  it("renders LOCATIONS labels separately while actions use canonical authority paths", () => {
    const source = readSource("src/main.tsx");
    const treeSource = source.slice(
      source.indexOf("function Tree("),
      source.indexOf("function ToolbarButton("),
    );
    const compactTreeSource = compact(treeSource);

    expect(source).toContain("buildLocationTree(visibleWorkspaceEntries)");
    expect(compactTreeSource).toContain("data-active={node.activePath === currentPath}");
    expect(compactTreeSource).toContain("onOpen(node.authorityPath)");
    expect(compactTreeSource).toContain("openTreeContextMenu(event, node.authorityPath)");
    expect(compactTreeSource).toContain("moveDroppedEntries(event, node.authorityPath)");
    expect(compactTreeSource).toContain("{node.label}");
    expect(compactTreeSource).toContain("key={child.id}");
    expect(compactTreeSource).not.toContain('t(locale, "path.home")');
    expect(compactTreeSource).not.toContain("onOpen(node.path)");
  });

  it("opens context menus without waiting for opener discovery", () => {
    const source = readSource("src/main.tsx");
    const openContextMenuStart = source.indexOf("function openContextMenu(");
    const openContextMenuEnd = source.indexOf("function clearLongPress(", openContextMenuStart);
    const openContextMenuSource = source.slice(
      openContextMenuStart,
      openContextMenuEnd,
    );

    expect(openContextMenuStart).toBeGreaterThan(-1);
    expect(openContextMenuSource).toContain("cachedOpenersForEntry");
    expect(openContextMenuSource).toContain("prefetchOpenersForEntry");
    expect(openContextMenuSource).not.toContain("await openersForEntry");
  });

  it("coalesces same-directory refresh requests", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("refreshPromisesRef");
    expect(source).toContain("const pendingRefresh = refreshPromisesRef.current.get(targetDirectory)");
    expect(source).toContain("if (pendingRefresh) return pendingRefresh");
    expect(source).toContain("refreshPromisesRef.current.delete(targetDirectory)");
  });

  it("requests host menus from statusbar, list background, rows, tree, and details pane", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("function beginLongPress(");
    expect(source).toContain('className="statusbar"');
    expect(source).toContain('className="tree"');
    expect(source).toContain('className="details"');
    expect(source).toContain('type: selectedCount > 0 ? "selection" : "background"');
    expect(source).toContain('closest("[data-explorer-entry=\'true\']")');
    expect(source).toContain('type: selectedEntriesForMenu.length > 1 ? "selection" : "entry"');
    expect(source).toContain("openTreeContextMenu(event,");
    expect(source).toContain("function openDetailsContextMenu(");
    expect(source).toContain("openDetailsContextMenu(event)");
    expect(source).toContain("onContextMenu={(event) => openDetailsContextMenu(event)}");
  });

  it("routes uploads through a target-aware file picker request", () => {
    const source = readSource("src/main.tsx");
    const requestUploadStart = source.indexOf("function requestUpload(");
    const requestUploadEnd = source.indexOf("function prepareUpload(", requestUploadStart);
    const requestUploadSource = source.slice(requestUploadStart, requestUploadEnd);

    expect(requestUploadStart).toBeGreaterThan(-1);
    expect(requestUploadSource).toContain("uploadTargetDirectoryRef.current = normalizePath(targetDirectory)");
    expect(requestUploadSource).toContain('input.value = ""');
    expect(requestUploadSource).toContain("input.click()");
    expect(source).toContain("uploadTargetDirectoryRef.current");
    expect(source).toContain("prepareUpload(files, uploadTargetDirectoryRef.current)");
    expect(source).toContain("requestUpload(menu.targetDirectory)");
    expect(source).toContain("onClick={() => requestUpload(currentPath)}");
    expect(source).toContain('className="file-picker"');
    expect(source).not.toContain("\n        hidden\n");
  });

  it("keeps mobile controls touch-sized and menus scrollable", () => {
    const styles = readSource("src/styles.css");

    expect(styles).toContain(".toolbar-action::after");
    expect(styles).toContain("content: attr(data-tooltip);");
    expect(styles).toContain(".toolbar button {\n    width: 40px;\n    height: 40px;");
    expect(styles).toContain(".statusbar {\n    min-height: 38px;");
  });

  it("adds view-mode controls and current-directory refresh", () => {
    const source = readSource("src/main.tsx");
    const styles = readSource("src/styles.css");

    expect(source).toContain('React.useState<ExplorerViewMode>("details")');
    expect(source).toContain('setViewMode("icons")');
    expect(source).toContain('setViewMode("gallery")');
    expect(source).toContain("appkits.files.list(targetDirectory)");
    expect(source).toContain("mergeDirectoryListing(");
    expect(source).toContain("readPersistedDirectoryListing()");
    expect(source).toContain("persistDirectoryListing(nextEntries)");
    expect(source).toContain("loadingDirectories");
    expect(source).toContain("loadedDirectories");
    expect(styles).toContain(".refresh-icon.spinning");
    expect(styles).toContain("@keyframes refresh-spin");
    expect(styles).toContain(".files-icons");
    expect(styles).toContain(".files-gallery");
    expect(styles).toContain(".file-thumbnail.large");
  });

  it("treats empty host listings as loaded folders", () => {
    const source = readSource("src/main.tsx");
    const refreshStart = source.indexOf(
      "const result = await appkits.files.list(targetDirectory);",
    );
    const catchStart = source.indexOf("} catch (error) {", refreshStart);
    const successPath = source.slice(refreshStart, catchStart);

    expect(successPath).toContain("const listedEntries = result.entries.map");
    expect(successPath).toContain("next.add(targetDirectory)");
    expect(successPath).toContain("currentPathRef.current === targetDirectory");
    expect(successPath).toContain(
      "filterVisibleEntries(listedEntries, showHiddenFilesRef.current)",
    );
    expect(successPath).not.toContain(
      "folderItemsStatus(locale, targetDirectory, listedEntries)",
    );
    expect(successPath).not.toContain("notify(");
    expect(successPath).not.toContain("status.refreshFailed");
  });

  it("updates folder status when navigating to an already-loaded directory", () => {
    const source = readSource("src/main.tsx");
    const navigateStart = source.indexOf("function navigate(path: string)");
    const navigateEnd = source.indexOf(
      "function setSingleSelection",
      navigateStart,
    );
    const navigate = source.slice(navigateStart, navigateEnd);

    expect(navigateStart).toBeGreaterThan(-1);
    expect(navigate).toContain("loadedDirectoriesRef.current.has(next)");
    expect(navigate).toContain("folderItemsStatus(");
    expect(navigate).toContain("childEntries(entriesRef.current, next");
    expect(navigate).toContain("showHiddenFiles: showHiddenFilesRef.current");
    expect(navigate).not.toContain("showHiddenFiles: true");
    expect(source).toContain('t(locale, "status.folderItems"');
    expect(source).toContain("function setHiddenFilesVisible(next: boolean)");
    expect(source).toContain("setHiddenFilesVisible(!showHiddenFiles)");
  });

  it("materializes product Home directories before listing them", () => {
    const source = readSource("src/main.tsx");
    const refreshStart = source.indexOf("const refresh = React.useCallback");
    const ensureCall = source.indexOf(
      "ensureProductHomeDirectories(",
      refreshStart,
    );
    const listCall = source.indexOf(
      "await appkits.files.list(targetDirectory)",
      refreshStart,
    );

    expect(refreshStart).toBeGreaterThan(-1);
    expect(ensureCall).toBeGreaterThan(refreshStart);
    expect(ensureCall).toBeLessThan(listCall);
    expect(source).not.toContain("isProductHomeDirectory(targetDirectory)");
    expect(source).toContain("appkits.files.mkdir(path)");
    expect(source).toContain("isExplorerRefreshCancellation(");
    expect(source).toContain(
      'explorerNoticeKey(error, "notify.refreshFailed")',
    );
  });

  it("paints local folder rows before Computer create and paste confirm", () => {
    const source = readSource("src/main.tsx");
    const finishRename = source.slice(
      source.indexOf("async function finishRename"),
      source.indexOf("async function deleteEntries"),
    );
    const pasteInto = source.slice(
      source.indexOf("async function pasteInto"),
      source.indexOf("function fileTransferEntries"),
    );

    expect(finishRename).toContain(
      "upsertDirectoryChild(current, pending.directory, optimistic)",
    );
    expect(finishRename.indexOf("upsertDirectoryChild")).toBeLessThan(
      finishRename.indexOf("await appkits.files.mkdir"),
    );
    expect(finishRename).toContain(
      "removeDirectoryChildren(current, pending.directory, [failedPath])",
    );
    expect(pasteInto).toContain("setEntries(working)");
    expect(pasteInto.indexOf("setEntries(working)")).toBeLessThan(
      pasteInto.indexOf("await copyDirectory"),
    );
    expect(pasteInto).toContain("removeDirectoryChildren(");
    expect(pasteInto).toContain(
      "...planned.map(({ entry }) => parentPath(entry.path))",
    );
    expect(pasteInto).toContain(
      "await Promise.all([...refreshTargets].map((path) => refresh(path)))",
    );
    expect(pasteInto).not.toMatch(/await refresh\(\);/);
    expect(finishRename).toContain(
      'explorerNoticeKey(error, "notify.renameFailed")',
    );
    expect(finishRename).toContain("await appkits.files.move(entry.path, target)");
  });

  it("maps rename and drag-move failures through writes_frozen honesty", () => {
    const source = readSource("src/main.tsx");
    const moveDropped = source.slice(
      source.indexOf("async function moveDroppedEntries"),
      source.indexOf("async function copyDirectory"),
    );

    expect(moveDropped).toContain(
      'explorerNoticeKey(error, "notify.moveFailed")',
    );
    expect(moveDropped).not.toContain("notify.refreshFailed");
    expect(moveDropped).not.toContain("status.refreshFailed");
  });

  it("uses localized UI strings and shared desktop file icon ids", () => {
    const source = readSource("src/main.tsx");
    const fileIconSource = readSource("src/file-icon.tsx");
    const styles = readSource("src/styles.css");
    const compactFileIconSource = compact(fileIconSource);

    expect(source).toContain('appkits.locale.current()');
    expect(source).toContain('t(locale, "toolbar.refresh")');
    expect(fileIconSource).toContain("desktopFileIconName(entry)");
    expect(fileIconSource).toContain("getDesktopIconAssetPath(iconName)");
    expect(fileIconSource).not.toContain("parseAppKitsAppFile");
    expect(compactFileIconSource).not.toContain("marketplaceIconUrl || appFile?.iconUrl");
    expect(fileIconSource).toContain('if (type !== "app" || entry.temporary)');
    expect(fileIconSource).toContain("file-app-icon-placeholder");
    expect(styles).toContain(".file-icon-asset");
    expect(styles).toContain(".file-icon-image");
    expect(styles).toContain(".file-app-icon-placeholder");
  });

  it("deduplicates host lifecycle feedback that can loop across multiple windows", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("lastAppliedLocaleRef");
    expect(source).toContain("lastWindowTitleRef");
    expect(source).toContain("lastLaunchSignatureRef");
    expect(source).toContain("lastFilesChangedSignatureRef");
    expect(source).toContain("setWindowTitleForLocale");
    expect(source).toContain("filesChangedEventSignature");
    expect(source).not.toContain(
      "void appkits.window.setTitle(localizedAppTitle(resolvedLocale));",
    );
  });

  it("shares tree and file-list icons without fallback image assets", () => {
    const source = readSource("src/main.tsx");
    const fileIconSource = readSource("src/file-icon.tsx");
    const treeSource = source.slice(
      source.indexOf("function Tree("),
      source.indexOf("function ToolbarButton("),
    );
    const compactTreeSource = compact(treeSource);

    expect(source).not.toContain("DEFAULT_FILE_ICON_ASSET");
    expect(fileIconSource).toContain("BlankFileIcon");
    expect(fileIconSource).toContain("scheduleFileIconBodyRead");
    expect(fileIconSource).toContain("fileIconCache");
    expect(fileIconSource).toContain("resolveInstalledAppMeta");
    expect(fileIconSource).toContain("file-update-badge");
    expect(compactTreeSource).toContain("treeNodeIconEntry(node, entryMap)");
    expect(compactTreeSource).toContain("<FileIcon entry={treeNodeIconEntry(node, entryMap)} />");
    expect(treeSource).not.toContain("<FolderOpen");
    expect(treeSource).not.toContain("<Folder");
  });

  it("hides dot files by default and exposes show hidden in every explorer menu surface", () => {
    const source = readSource("src/main.tsx");
    const model = readSource("src/file-model.ts");

    expect(source).toContain("const [showHiddenFiles, setShowHiddenFiles]");
    expect(source).toContain("filterVisibleEntries(entries, showHiddenFiles)");
    expect(source).toContain('"view-show-hidden-files"');
    expect(source).toContain('t(locale, "view.showHiddenFiles")');
    expect(source).toContain("checked: showHiddenFiles");
    expect(model).toContain("isHiddenPathSegment");
    expect(model).toContain("filterVisibleEntries");
  });

  it("uses host-resolved absolute .app icons inside the plugin iframe", () => {
    const fileIconSource = readSource("src/file-icon.tsx");

    expect(fileIconSource).toContain("pluginSlugCandidateFromAppFileName");
    expect(fileIconSource).toContain("apps.list()");
    expect(fileIconSource).toContain("FILE_ICON_SESSION_CACHE_KEY");
    expect(fileIconSource).toContain("fileIconCacheStorage");
    expect(fileIconSource).toContain("localStorage");
    expect(fileIconSource).toContain("MAX_CONCURRENT_FILE_ICON_BODY_READS = 6");
    expect(fileIconSource).toContain("schedulePersistFileIconCache");
    expect(fileIconSource).not.toContain("FILE_ICON_BODY_READ_DELAY_MS");
    expect(fileIconSource).toContain("readPersistedInstalledApps");
    expect(fileIconSource).toContain("rememberFileIcon");
    expect(fileIconSource).toContain("app?.icon?.trim()");
    expect(fileIconSource).toContain("app?.hasUpdate === true");
    expect(fileIconSource).not.toContain("resolveHostIconUrl");
    expect(fileIconSource).not.toContain("parseAppKitsAppFile");
    expect(fileIconSource).not.toContain("decodeReadResult");
    const appEffect = fileIconSource.slice(
      fileIconSource.indexOf('if (type !== "app" || entry.temporary)'),
    );
    expect(appEffect).not.toContain("scheduleFileIconBodyRead");
  });

  it("reuses loaded folder listings and does not invent icon cache timestamps", () => {
    const source = readSource("src/main.tsx");
    const refreshStart = source.indexOf(
      "const result = await appkits.files.list(targetDirectory);",
    );
    const catchStart = source.indexOf("} catch (error) {", refreshStart);
    const successPath = source.slice(refreshStart, catchStart);

    expect(source).toContain(
      "if (loadedDirectoriesRef.current.has(normalizePath(currentPath))) return;",
    );
    expect(successPath).not.toContain("new Date().toISOString()");
    expect(successPath).toContain('typeof entry.updatedAt === "string"');
  });

  it("follows the host theme while preserving the earlier light surface", () => {
    const styles = readSource("src/styles.css");
    const source = readSource("src/main.tsx");

    expect(source).toContain("appkits.theme.current()");
    expect(source).toContain("appkits.theme.onChange(applyTheme)");
    expect(source).toContain("document.documentElement.dataset.appkitsTheme");
    expect(styles).toContain(':root[data-appkits-theme="dark"]');
    expect(styles).toContain("background: var(--app-surface);");
    expect(styles).toContain("background: var(--app-panel);");
  });

  it("refreshes the visible directory when the host reports changed files", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("appkits.files.onChanged");
    expect(source).toContain("shouldRefreshDirectoryForFilesChanged");
    expect(source).toContain("filesChangedRefreshTimeoutRef");
    expect(source).toContain("void refresh(currentPathRef.current)");
  });

  it("uses the SDK file transfer helper for drag payloads", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("writeAppKitsFileTransferData");
    expect(source).not.toContain(
      'setData("application/x-appkits-file-entry"',
    );
  });
});
