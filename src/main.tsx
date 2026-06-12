import React from "react";
import { createRoot } from "react-dom/client";
import {
  FilePlus2,
  FolderPlus,
  FolderUp,
  Grid2X2,
  List,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import * as appkits from "@appkits-ai/sdk/client";
import {
  HOME_ROOT,
  buildDirectoryTree,
  filenameFromPath,
  normalizePath,
  parentPath,
  pathFromLaunchParams,
  searchEntries,
  uniquePath,
  type ExplorerEntry,
  type TreeNode,
} from "./file-model";
import "./styles.css";

type ViewMode = "list" | "tiles";

interface PendingUpload {
  file: File;
  targetPath: string;
  conflict: boolean;
}

function App() {
  const [entries, setEntries] = React.useState<ExplorerEntry[]>([]);
  const [currentPath, setCurrentPath] = React.useState(HOME_ROOT);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const [search, setSearch] = React.useState("");
  const [preview, setPreview] = React.useState<string>("");
  const [renamingPath, setRenamingPath] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [pendingUpload, setPendingUpload] = React.useState<PendingUpload | null>(
    null,
  );
  const uploadRef = React.useRef<HTMLInputElement | null>(null);

  const selectedEntries = React.useMemo(
    () => entries.filter((entry) => selected.includes(entry.path)),
    [entries, selected],
  );
  const visibleEntries = React.useMemo(
    () => searchEntries(entries, currentPath, search),
    [currentPath, entries, search],
  );
  const tree = React.useMemo(() => buildDirectoryTree(entries), [entries]);

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
    }));
    setEntries(nextEntries);
  }, []);

  React.useEffect(() => {
    void appkits.Window.setTitle("File Explorer");
    void appkits.Launch.params().then((params) =>
      setCurrentPath(pathFromLaunchParams(params)),
    );
    void refresh();
    const offLaunch = appkits.Launch.onChange((params) => {
      setCurrentPath(pathFromLaunchParams(params));
      setSelected([]);
    });
    const offContext = appkits.ContextMenu.onSelect((itemId) => {
      if (itemId === "open") openSelected();
      if (itemId === "rename") startRename(selectedEntries[0]);
      if (itemId === "delete") void deleteSelected();
      if (itemId === "copy-path") void copySelectedPaths();
    });
    return () => {
      offLaunch();
      offContext();
    };
  }, [refresh, selectedEntries]);

  React.useEffect(() => {
    const entry = selectedEntries[0];
    if (!entry || entry.kind !== "file") {
      setPreview("");
      return;
    }
    void appkits.FileSystem.read(entry.path)
      .then((file) => setPreview(file.body || ""))
      .catch(() => setPreview(""));
  }, [selectedEntries]);

  function selectEntry(entry: ExplorerEntry, event: React.MouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      setSelected((current) =>
        current.includes(entry.path)
          ? current.filter((path) => path !== entry.path)
          : [...current, entry.path],
      );
      return;
    }
    if (event.shiftKey && selected.length > 0) {
      const first = visibleEntries.findIndex((item) => item.path === selected[0]);
      const next = visibleEntries.findIndex((item) => item.path === entry.path);
      const [start, end] = [Math.min(first, next), Math.max(first, next)];
      setSelected(visibleEntries.slice(start, end + 1).map((item) => item.path));
      return;
    }
    setSelected([entry.path]);
  }

  function openEntry(entry: ExplorerEntry) {
    if (entry.kind === "directory") {
      setCurrentPath(entry.path);
      setSelected([]);
      return;
    }
    void appkits.FileSystem.read(entry.path).then((file) => {
      setPreview(file.body || "");
    });
  }

  function openSelected() {
    const entry = selectedEntries[0];
    if (entry) openEntry(entry);
  }

  async function createFolder() {
    const path = uniquePath(entries, currentPath, "New Folder");
    await appkits.FileSystem.mkdir(path);
    await refresh();
    setSelected([path]);
  }

  async function createTextFile() {
    const path = uniquePath(entries, currentPath, "Untitled.txt");
    await appkits.FileSystem.write({
      path,
      body: "",
      contentType: "text/plain;charset=UTF-8",
    });
    await refresh();
    setSelected([path]);
    startRename({ path, name: filenameFromPath(path), kind: "file" });
  }

  function startRename(entry: ExplorerEntry | undefined) {
    if (!entry) return;
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
  }

  async function finishRename(commit: boolean) {
    const entry = entries.find((item) => item.path === renamingPath);
    const nextName = renameValue.trim();
    setRenamingPath(null);
    if (!commit || !entry || !nextName || nextName === entry.name) return;
    const target = `${parentPath(entry.path)}/${nextName}`;
    await appkits.FileSystem.move(entry.path, target);
    await refresh();
    setSelected([target]);
  }

  async function deleteSelected() {
    for (const entry of selectedEntries) {
      await appkits.FileSystem.delete(entry.path);
    }
    setSelected([]);
    await refresh();
    void appkits.Notification.show({
      title: selectedEntries.length === 1 ? "Item deleted" : "Items deleted",
      variant: "success",
    });
  }

  async function copySelectedPaths() {
    await navigator.clipboard.writeText(selectedEntries.map((entry) => entry.path).join("\n"));
  }

  async function handleUpload(file: File, replace = false) {
    const targetPath = replace
      ? pendingUpload?.targetPath || `${currentPath}/${file.name}`
      : uniquePath(entries, currentPath, file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    await appkits.FileSystem.write({
      path: targetPath,
      bodyBase64: btoa(binary),
      contentType: file.type || "application/octet-stream",
    });
    setPendingUpload(null);
    await refresh();
    setSelected([targetPath]);
  }

  function chooseUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const targetPath = `${currentPath}/${file.name}`;
    const conflict = entries.some((entry) => entry.path === targetPath);
    if (conflict) {
      setPendingUpload({ file, targetPath, conflict });
      return;
    }
    void handleUpload(file);
  }

  function showHostContextMenu(entry: ExplorerEntry, event: React.MouseEvent) {
    event.preventDefault();
    setSelected((current) =>
      current.includes(entry.path) ? current : [entry.path],
    );
    void appkits.ContextMenu.open({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: "open", label: "Open" },
        { id: "rename", label: "Rename" },
        { id: "copy-path", label: "Copy Path" },
        { id: "delete", label: "Delete", destructive: true },
      ],
    });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") openSelected();
    if (event.key === "F2") startRename(selectedEntries[0]);
    if (event.key === "Delete") void deleteSelected();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelected(visibleEntries.map((entry) => entry.path));
    }
  }

  return (
    <main className="explorer" onKeyDown={handleKeyDown} tabIndex={0}>
      <header className="toolbar">
        <button onClick={() => setCurrentPath(parentPath(currentPath))} title="Up">
          <FolderUp size={18} />
        </button>
        <button onClick={refresh} title="Refresh">
          <RefreshCw size={18} />
        </button>
        <button onClick={createFolder} title="New folder">
          <FolderPlus size={18} />
        </button>
        <button onClick={createTextFile} title="New text file">
          <FilePlus2 size={18} />
        </button>
        <button onClick={() => uploadRef.current?.click()} title="Upload">
          <Upload size={18} />
        </button>
        <button
          onClick={deleteSelected}
          disabled={selectedEntries.length === 0}
          title="Delete"
        >
          <Trash2 size={18} />
        </button>
        <div className="search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
          />
        </div>
        <div className="view-toggle">
          <button
            data-active={viewMode === "list"}
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <List size={18} />
          </button>
          <button
            data-active={viewMode === "tiles"}
            onClick={() => setViewMode("tiles")}
            title="Tile view"
          >
            <Grid2X2 size={18} />
          </button>
        </div>
        <input
          ref={uploadRef}
          type="file"
          hidden
          onChange={(event) => chooseUpload(event.target.files)}
        />
      </header>
      <nav className="breadcrumb">
        {currentPath
          .replace(HOME_ROOT, "Home")
          .split("/")
          .filter(Boolean)
          .map((part, index, parts) => (
            <button
              key={`${part}-${index}`}
              onClick={() => {
                if (index === 0) setCurrentPath(HOME_ROOT);
                else setCurrentPath(`${HOME_ROOT}/${parts.slice(1, index + 1).join("/")}`);
              }}
            >
              {part}
            </button>
          ))}
      </nav>
      <section className="workspace">
        <aside className="tree">
          <Tree node={tree} currentPath={currentPath} onOpen={setCurrentPath} />
        </aside>
        <section className={`files ${viewMode}`}>
          {visibleEntries.map((entry) => (
            <button
              key={entry.path}
              className="file-row"
              data-selected={selected.includes(entry.path)}
              onClick={(event) => selectEntry(entry, event)}
              onDoubleClick={() => openEntry(entry)}
              onContextMenu={(event) => showHostContextMenu(entry, event)}
            >
              <span className="file-icon">{entry.kind === "directory" ? "DIR" : "FILE"}</span>
              {renamingPath === entry.path ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => void finishRename(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void finishRename(true);
                    if (event.key === "Escape") void finishRename(false);
                  }}
                />
              ) : (
                <span className="file-name">{entry.name}</span>
              )}
              <span className="file-meta">{entry.kind}</span>
              <span className="file-meta">{formatSize(entry.size)}</span>
            </button>
          ))}
        </section>
        <aside className="details">
          <h2>Details</h2>
          {selectedEntries[0] ? (
            <>
              <p className="strong">{selectedEntries[0].name}</p>
              <p>{selectedEntries[0].path}</p>
              <p>{selectedEntries[0].contentType || selectedEntries[0].kind}</p>
              <p>{formatSize(selectedEntries[0].size)}</p>
              <button onClick={() => openEntry(selectedEntries[0]!)}>Open</button>
              <button onClick={() => startRename(selectedEntries[0])}>Rename</button>
              {preview ? <pre>{preview.slice(0, 2400)}</pre> : null}
            </>
          ) : (
            <p>Select an item</p>
          )}
        </aside>
      </section>
      {pendingUpload ? (
        <div className="modal">
          <div className="dialog">
            <h2>File already exists</h2>
            <p>{pendingUpload.targetPath}</p>
            <button onClick={() => handleUpload(pendingUpload.file, true)}>
              Replace
            </button>
            <button onClick={() => handleUpload(pendingUpload.file, false)}>
              Keep both
            </button>
            <button onClick={() => setPendingUpload(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Tree({
  node,
  currentPath,
  onOpen,
}: {
  node: TreeNode;
  currentPath: string;
  onOpen: (path: string) => void;
}) {
  return (
    <div className="tree-node">
      <button data-active={node.path === currentPath} onClick={() => onOpen(node.path)}>
        {node.name}
      </button>
      {node.children.length > 0 ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <Tree
              key={child.path}
              node={child}
              currentPath={currentPath}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatSize(value: number | undefined): string {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

createRoot(document.getElementById("root")!).render(<App />);
