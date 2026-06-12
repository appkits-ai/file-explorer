import React from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import * as appkits from "@appkits-ai/sdk/client";
import {
  HOME_ROOT,
  breadcrumbSegments,
  buildDirectoryTree,
  childEntries,
  fileTypeLabel,
  filenameFromPath,
  formatSize,
  isTextInputTarget,
  joinPath,
  normalizePath,
  parentPath,
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
  type SelectionRect,
  type SelectionState,
  type TreeNode,
} from "./file-model";
import "./styles.css";

type ContextMenuState =
  | { x: number; y: number; type: "background"; targetDirectory: string }
  | { x: number; y: number; type: "selection"; targetDirectory: string }
  | { x: number; y: number; type: "entry"; targetDirectory: string; entry: ExplorerEntry };

interface ClipboardState {
  mode: "copy" | "cut";
  entries: ExplorerEntry[];
}

interface PendingUpload {
  items: File[];
  targetDirectory: string;
  conflicts: string[];
}

const TEXT_FILE_BODY: Record<".txt" | ".md" | ".html", string> = {
  ".txt": "",
  ".md": "# Untitled\n",
  ".html": '<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8" />\n    <title>Untitled</title>\n  </head>\n  <body>\n  </body>\n</html>\n',
};

const TEXT_FILE_TYPE: Record<".txt" | ".md" | ".html", string> = {
  ".txt": "text/plain;charset=UTF-8",
  ".md": "text/markdown;charset=UTF-8",
  ".html": "text/html;charset=UTF-8",
};

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
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [clipboard, setClipboard] = React.useState<ClipboardState | null>(null);
  const [selectionRect, setSelectionRect] = React.useState<SelectionRect | null>(null);
  const [pendingUpload, setPendingUpload] = React.useState<PendingUpload | null>(null);
  const [draggingFiles, setDraggingFiles] = React.useState(false);
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

  const refresh = React.useCallback(async () => {
    const result = await appkits.FileSystem.list(HOME_ROOT);
    const nextEntries = result.entries.map((entry) => ({
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
    setEntries(nextEntries);
    const launchSelection = pendingLaunchSelectionRef.current;
    if (launchSelection && nextEntries.some((entry) => entry.path === launchSelection)) {
      setSelectedPaths([launchSelection]);
      setActivePath(launchSelection);
      pendingLaunchSelectionRef.current = null;
    } else {
      setSelectedPaths((current) =>
        current.filter((path) => nextEntries.some((entry) => entry.path === path)),
      );
    }
    setStatus(`${nextEntries.length} items indexed`);
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
    void refresh();
    return () => offLaunch();
  }, [refresh]);

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
    if (!contextMenu) return;
    const close = (event: MouseEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest(".context-menu")) return;
      setContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("contextmenu", close, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("contextmenu", close, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const visibleEntries = React.useMemo(() => {
    return query.trim() ? searchEntries(entries, currentPath, query) : childEntries(entries, currentPath);
  }, [currentPath, entries, query]);
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

  function navigate(path: string) {
    setCurrentPath(normalizePath(path));
    setSelectedPaths([]);
    setActivePath(null);
    setContextMenu(null);
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
    void appkits.FileSystem.read(entry.path)
      .then((file) => {
        const text = decodeReadResult(file);
        setPreview(text.slice(0, 4000));
        setStatus(`Opened ${entry.name}`);
      })
      .catch(() => notify("Could not open file", "error"));
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
      const first = visibleEntries.findIndex((item) => item.path === activePath);
      const second = visibleEntries.findIndex((item) => item.path === entry.path);
      if (first >= 0 && second >= 0) {
        const [start, end] = [Math.min(first, second), Math.max(first, second)];
        setSelectedPaths(visibleEntries.slice(start, end + 1).map((item) => item.path));
        setActivePath(entry.path);
        return;
      }
    }
    setSingleSelection(entry.path);
  }

  async function createFolder() {
    const path = uniquePath(entriesRef.current, currentPathRef.current, "New Folder");
    await appkits.FileSystem.mkdir(path);
    await refresh();
    setSingleSelection(path);
    startRename(path);
    setStatus("Folder created");
  }

  async function createFile(extension: ".txt" | ".md" | ".html") {
    const path = uniquePath(entriesRef.current, currentPathRef.current, `Untitled${extension}`);
    await appkits.FileSystem.write({
      path,
      body: TEXT_FILE_BODY[extension],
      contentType: TEXT_FILE_TYPE[extension],
    });
    await refresh();
    setSingleSelection(path);
    startRename(path);
    setStatus("File created");
  }

  function startRename(path: string | null | undefined) {
    if (!path) return;
    const entry = entriesRef.current.find((item) => item.path === path);
    if (!entry) return;
    setRenameValue(entry.name);
    setRenamingPath(entry.path);
  }

  async function finishRename(commit: boolean) {
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
    if (items.length === 0) return;
    for (const entry of items) await appkits.FileSystem.delete(entry.path);
    setSelectedPaths([]);
    setActivePath(null);
    await refresh();
    notify(items.length === 1 ? "Item deleted" : "Items deleted", "success");
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
      const hits = visibleEntries
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
  }, [visibleEntries]);

  React.useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!rootRef.current?.contains(document.activeElement)) return;
      if (isTextInputTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedPaths(visibleEntries.map((entry) => entry.path));
        setActivePath(visibleEntries[0]?.path || null);
      } else if (meta && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copyEntries("copy");
      } else if (meta && event.key.toLowerCase() === "x") {
        event.preventDefault();
        copyEntries("cut");
      } else if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteInto(activeEntry?.kind === "directory" ? activeEntry.path : currentPathRef.current);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void deleteEntries(selectedEntries);
      } else if (event.key === "F2") {
        event.preventDefault();
        startRename(activeEntry?.path);
      } else if (event.key === "Enter" && activeEntry) {
        event.preventDefault();
        openEntry(activeEntry);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [activeEntry, selectedEntries, visibleEntries, clipboard]);

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
        <button onClick={() => navigate(parentPath(currentPath))} disabled={currentPath === HOME_ROOT} title="Up">
          <FolderUp size={17} />
        </button>
        <button onClick={() => void refresh()} title="Refresh">
          <RefreshCw size={17} />
        </button>
        <button onClick={() => void createFolder()} title="New folder">
          <FolderPlus size={17} />
        </button>
        <button onClick={() => void createFile(".txt")} title="New text file">
          <FilePlus2 size={17} />
        </button>
        <button onClick={() => uploadRef.current?.click()} title="Upload">
          <Upload size={17} />
        </button>
        <button onClick={() => copyEntries("copy")} disabled={selectedCount === 0} title="Copy">
          <Copy size={17} />
        </button>
        <button onClick={() => copyEntries("cut")} disabled={selectedCount === 0} title="Cut">
          <Scissors size={17} />
        </button>
        <button onClick={() => void pasteInto(pasteTarget)} disabled={!clipboard} title="Paste">
          <ClipboardPaste size={17} />
        </button>
        <button onClick={() => void deleteEntries(selectedEntries)} disabled={selectedCount === 0} title="Delete">
          <Trash2 size={17} />
        </button>
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

        <section className="files-pane">
          <div className="file-header">
            <span>Name</span>
            <span>Type</span>
            <span>Size</span>
          </div>
          <div
            ref={listRef}
            className="files"
            onPointerDown={startSelection}
            onContextMenu={(event) => {
              if ((event.target as HTMLElement | null)?.closest("[data-explorer-entry='true']")) return;
              event.preventDefault();
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                type: selectedCount > 1 ? "selection" : "background",
                targetDirectory: pasteTarget,
              });
            }}
          >
            {visibleEntries.map((entry) => {
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
                  data-selected={selected}
                  draggable
                  onClick={(event) => handleRowClick(event, entry)}
                  onDoubleClick={() => openEntry(entry)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const menuSelection = selected && selectedEntries.length > 1 ? selectedEntries : [entry];
                    setSelectedPaths(menuSelection.map((item) => item.path));
                    setActivePath(entry.path);
                    setContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      type: menuSelection.length > 1 ? "selection" : "entry",
                      targetDirectory: entry.kind === "directory" ? entry.path : currentPath,
                      entry,
                    });
                  }}
                  onDragStart={(event) => {
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
                    <FileIcon entry={entry} />
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
                  <span className="file-meta">{fileTypeLabel(entry)}</span>
                  <span className="file-meta">{entry.kind === "directory" ? "--" : formatSize(entry.size)}</span>
                </button>
              );
            })}
            {visibleEntries.length === 0 ? <div className="empty">This folder is empty.</div> : null}
            {selectionRect ? <div className="selection-rect" style={selectionRect} /> : null}
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

      <footer className="statusbar">
        <span>{status}</span>
        <span>{selectedCount > 0 ? `${selectedCount} selected` : visiblePath(currentPath)}</span>
      </footer>

      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
          clipboard={clipboard}
          selectedCount={selectedCount}
          onClose={() => setContextMenu(null)}
          onOpen={(entry) => openEntry(entry)}
          onCreateFolder={() => void createFolder()}
          onCreateFile={(extension) => void createFile(extension)}
          onUpload={() => uploadRef.current?.click()}
          onCopy={(items) => copyEntries("copy", items)}
          onCut={(items) => copyEntries("cut", items)}
          onPaste={(path) => void pasteInto(path)}
          onRename={(entry) => startRename(entry.path)}
          onDownload={(entry) => void downloadEntry(entry)}
          onDelete={(items) => void deleteEntries(items)}
          selectedEntries={selectedEntries}
        />
      ) : null}

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

function FileIcon({ entry, large = false }: { entry: ExplorerEntry; large?: boolean }) {
  const size = large ? 34 : 18;
  if (entry.kind === "directory") return <Folder size={size} className="icon-folder" />;
  const label = fileTypeLabel(entry);
  if (label === "Image") return <FileImage size={size} className="icon-image" />;
  if (label === "Code file" || label === "HTML document") return <FileCode2 size={size} className="icon-code" />;
  return <FileText size={size} className="icon-file" />;
}

function ContextMenu({
  state,
  selectedEntries,
  selectedCount,
  clipboard,
  onClose,
  onOpen,
  onCreateFolder,
  onCreateFile,
  onUpload,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onDownload,
  onDelete,
}: {
  state: ContextMenuState;
  selectedEntries: ExplorerEntry[];
  selectedCount: number;
  clipboard: ClipboardState | null;
  onClose: () => void;
  onOpen: (entry: ExplorerEntry) => void;
  onCreateFolder: () => void;
  onCreateFile: (extension: ".txt" | ".md" | ".html") => void;
  onUpload: () => void;
  onCopy: (items: ExplorerEntry[]) => void;
  onCut: (items: ExplorerEntry[]) => void;
  onPaste: (path: string) => void;
  onRename: (entry: ExplorerEntry) => void;
  onDownload: (entry: ExplorerEntry) => void;
  onDelete: (items: ExplorerEntry[]) => void;
}) {
  const targetItems = state.type === "entry" ? [state.entry] : selectedEntries;
  const button = (label: string, icon: React.ReactNode, action: () => void, disabled = false, destructive = false) => (
    <button
      type="button"
      disabled={disabled}
      data-destructive={destructive}
      onClick={() => {
        if (disabled) return;
        onClose();
        action();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div className="context-menu" style={{ left: state.x, top: state.y }} onContextMenu={(event) => event.preventDefault()}>
      {state.type === "background" ? (
        <>
          {clipboard ? button("Paste", <ClipboardPaste size={15} />, () => onPaste(state.targetDirectory)) : null}
          {button("New Folder", <FolderPlus size={15} />, onCreateFolder)}
          {button("Text File", <FilePlus2 size={15} />, () => onCreateFile(".txt"))}
          {button("Markdown File", <FilePlus2 size={15} />, () => onCreateFile(".md"))}
          {button("HTML File", <FilePlus2 size={15} />, () => onCreateFile(".html"))}
          <hr />
          {button("Upload Files", <Upload size={15} />, onUpload)}
        </>
      ) : state.type === "selection" ? (
        <>
          {button("Open", <FolderOpen size={15} />, () => onOpen(selectedEntries[0]!), selectedCount !== 1)}
          {button("Copy Selected", <Copy size={15} />, () => onCopy(targetItems), targetItems.length === 0)}
          {button("Cut Selected", <Scissors size={15} />, () => onCut(targetItems), targetItems.length === 0)}
          {clipboard ? button("Paste", <ClipboardPaste size={15} />, () => onPaste(state.targetDirectory)) : null}
          <hr />
          {button("Delete Selected", <Trash2 size={15} />, () => onDelete(targetItems), targetItems.length === 0, true)}
        </>
      ) : (
        <>
          {button("Open", state.entry.kind === "directory" ? <FolderOpen size={15} /> : <FileText size={15} />, () => onOpen(state.entry))}
          {button("Copy", <Copy size={15} />, () => onCopy(targetItems))}
          {button("Cut", <Scissors size={15} />, () => onCut(targetItems))}
          {state.entry.kind === "directory" && clipboard ? button("Paste", <ClipboardPaste size={15} />, () => onPaste(state.entry.path)) : null}
          <hr />
          {button("Download", <Download size={15} />, () => onDownload(state.entry), state.entry.kind !== "file")}
          {button("Rename", <Pencil size={15} />, () => onRename(state.entry))}
          {button("Delete", <Trash2 size={15} />, () => onDelete(targetItems), false, true)}
        </>
      )}
    </div>
  );
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
