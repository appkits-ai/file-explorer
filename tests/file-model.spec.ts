import { describe, expect, it } from "vitest";
import {
  HOME_ROOT,
  breadcrumbSegments,
  buildDirectoryTree,
  childEntries,
  contextMenuItemIdFromSelection,
  createTargetPath,
  desktopFileIconName,
  fileTypeLabel,
  isTextPreviewable,
  mergeDirectoryListing,
  pendingCreateEntry,
  pendingCreatePath,
  pendingCreateTarget,
  pathFromLaunchParams,
  pathFromVisiblePath,
  planMoveTargets,
  sanitizeFilename,
  searchEntries,
  selectedPathFromLaunchParams,
  shouldRefreshDirectoryForFilesChanged,
  uniquePath,
  uploadTargets,
  visiblePath,
  type ExplorerEntry,
} from "../src/file-model";

const entries: ExplorerEntry[] = [
  { path: "/home/agent/project", name: "project", kind: "directory" },
  { path: "/home/agent/project/a.txt", name: "a.txt", kind: "file" },
  { path: "/home/agent/readme.md", name: "readme.md", kind: "file" },
];

describe("file explorer model", () => {
  it("projects flat desktop entries into folder children", () => {
    expect(childEntries(entries, HOME_ROOT).map((entry) => entry.name)).toEqual([
      "project",
      "readme.md",
    ]);
    expect(
      childEntries(entries, "/home/agent/project").map((entry) => entry.name),
    ).toEqual(["a.txt"]);
  });

  it("replaces only the refreshed directory children", () => {
    const merged = mergeDirectoryListing(entries, "/home/agent/project", [
      { path: "/home/agent/project/b.txt", name: "b.txt", kind: "file" },
    ]);

    expect(childEntries(merged, HOME_ROOT).map((entry) => entry.name)).toEqual([
      "project",
      "readme.md",
    ]);
    expect(
      childEntries(merged, "/home/agent/project").map((entry) => entry.name),
    ).toEqual(["b.txt"]);
  });

  it("keeps directly loaded empty folders navigable", () => {
    const merged = mergeDirectoryListing(entries, "/home/agent/empty", []);

    expect(childEntries(merged, "/home/agent/empty")).toEqual([]);
    expect(merged).toContainEqual({
      path: "/home/agent/empty",
      name: "empty",
      kind: "directory",
    });
    expect(buildDirectoryTree(merged).children.map((child) => child.name)).toEqual([
      "empty",
      "project",
    ]);
  });

  it("builds a directory tree from file paths", () => {
    const tree = buildDirectoryTree(entries);
    expect(tree.children.map((child) => child.name)).toEqual(["project"]);
  });

  it("filters search across the workspace", () => {
    expect(searchEntries(entries, HOME_ROOT, "read").map((entry) => entry.name)).toEqual([
      "readme.md",
    ]);
  });

  it("creates conflict-safe target names", () => {
    expect(uniquePath(entries, HOME_ROOT, "readme.md")).toBe(
      "/home/agent/readme 2.md",
    );
  });

  it("reads launched folder params", () => {
    expect(
      pathFromLaunchParams({
        appkitsOpenFolder: { path: "/home/agent/project" },
      }),
    ).toBe("/home/agent/project");
  });

  it("models pending create rows without committing a real file path", () => {
    expect(pendingCreatePath(HOME_ROOT, "file")).toBe(
      "/home/agent/.__appkits_pending_file",
    );
    expect(pendingCreateEntry(HOME_ROOT, "directory", "New Folder")).toMatchObject({
      path: "/home/agent/.__appkits_pending_directory",
      name: "New Folder",
      kind: "directory",
      temporary: true,
    });
  });

  it("validates committed create target names", () => {
    expect(createTargetPath(HOME_ROOT, "notes.txt")).toBe(
      "/home/agent/notes.txt",
    );
    expect(createTargetPath(HOME_ROOT, "")).toBeNull();
    expect(createTargetPath(HOME_ROOT, "nested/file.txt")).toBeNull();
  });

  it("recomputes the pending create default name but preserves manual conflicts", () => {
    const createEntries: ExplorerEntry[] = [
      { path: "/home/agent/Untitled.txt", name: "Untitled.txt", kind: "file" },
      {
        path: "/home/agent/Untitled 2.txt",
        name: "Untitled 2.txt",
        kind: "file",
      },
      { path: "/home/agent/readme.md", name: "readme.md", kind: "file" },
    ];

    expect(
      pendingCreateTarget(createEntries, HOME_ROOT, "Untitled.txt", "Untitled.txt"),
    ).toEqual({
      path: "/home/agent/Untitled 3.txt",
      name: "Untitled 3.txt",
      exists: false,
    });
    expect(
      pendingCreateTarget(createEntries, HOME_ROOT, "Untitled.txt", "readme.md"),
    ).toEqual({
      path: "/home/agent/readme.md",
      name: "readme.md",
      exists: true,
    });
    expect(
      pendingCreateTarget(createEntries, HOME_ROOT, "Untitled.txt", "nested/file.txt"),
    ).toBeNull();
  });

  it("plans move drops with copy-safe target names and descendant protection", () => {
    const moveEntries: ExplorerEntry[] = [
      { path: "/home/agent/report.md", name: "report.md", kind: "file" },
      { path: "/home/agent/assets", name: "assets", kind: "directory" },
      {
        path: "/home/agent/assets/icon.png",
        name: "icon.png",
        kind: "file",
      },
      { path: "/home/agent/Desktop", name: "Desktop", kind: "directory" },
      {
        path: "/home/agent/Desktop/report.md",
        name: "report.md",
        kind: "file",
      },
    ];

    expect(
      planMoveTargets(
        moveEntries,
        ["/home/agent/report.md", "/home/agent/assets"],
        "/home/agent/Desktop",
      ),
    ).toEqual([
      {
        fromPath: "/home/agent/report.md",
        toPath: "/home/agent/Desktop/report copy.md",
      },
      {
        fromPath: "/home/agent/assets",
        toPath: "/home/agent/Desktop/assets",
      },
    ]);
    expect(
      planMoveTargets(moveEntries, ["/home/agent/assets"], "/home/agent/assets/icon.png"),
    ).toEqual([]);
  });

  it("selects a launched file while opening its containing folder", () => {
    const params = {
      appkitsOpenFile: {
        scope: "desktop-file",
        path: "/home/agent/project/a.txt",
        name: "a.txt",
      },
    };
    expect(pathFromLaunchParams(params)).toBe("/home/agent/project");
    expect(selectedPathFromLaunchParams(params)).toBe("/home/agent/project/a.txt");
  });

  it("maps visible breadcrumb paths back to desktop paths", () => {
    expect(visiblePath("/home/agent/project/src")).toBe("home/project/src");
    expect(pathFromVisiblePath("home/project/src")).toBe(
      "/home/agent/project/src",
    );
    expect(pathFromVisiblePath("Home/project/src")).toBe(
      "/home/agent/project/src",
    );
    expect(pathFromVisiblePath("/home")).toBe(HOME_ROOT);
    expect(breadcrumbSegments("/home/agent/project/src").map((part) => part.label)).toEqual([
      "home",
      "project",
      "src",
    ]);
  });

  it("decides whether file change events affect the current directory", () => {
    expect(
      shouldRefreshDirectoryForFilesChanged("/home/agent/Desktop", undefined),
    ).toBe(true);
    expect(
      shouldRefreshDirectoryForFilesChanged("/home/agent/Desktop", [
        "/home/agent/Desktop/new.txt",
      ]),
    ).toBe(true);
    expect(
      shouldRefreshDirectoryForFilesChanged("/home/agent/Desktop/project", [
        "/home/agent/Desktop",
      ]),
    ).toBe(true);
    expect(
      shouldRefreshDirectoryForFilesChanged("/home/agent/Desktop", [
        "/home/agent/Documents/new.txt",
      ]),
    ).toBe(false);
  });

  it("normalizes context-menu selection payloads across SDK versions", () => {
    expect(contextMenuItemIdFromSelection({ itemId: "rename" })).toBe("rename");
    expect(contextMenuItemIdFromSelection("delete")).toBe("delete");
    expect(contextMenuItemIdFromSelection({ itemId: 42 })).toBeNull();
    expect(contextMenuItemIdFromSelection(null)).toBeNull();
  });

  it("sanitizes unsafe file names for create, upload, and rename", () => {
    expect(sanitizeFilename(" ../bad/name.txt\0 ")).toBe("..-bad-name.txt");
  });

  it("plans upload targets without colliding duplicate batch names", () => {
    expect(
      uploadTargets(entries, HOME_ROOT, ["readme.md", "readme.md"], false).map(
        (target) => target.path,
      ),
    ).toEqual(["/home/agent/readme 2.md", "/home/agent/readme 3.md"]);
  });

  it("reports upload conflicts for overwrite confirmation", () => {
    expect(uploadTargets(entries, HOME_ROOT, ["readme.md"], true)).toEqual([
      {
        sourceName: "readme.md",
        path: "/home/agent/readme.md",
        conflict: true,
      },
    ]);
  });

  it("labels common file types for details and menus", () => {
    expect(fileTypeLabel({ path: "/home/agent/app.ts", name: "app.ts", kind: "file" })).toBe(
      "Code file",
    );
    expect(
      fileTypeLabel({
        path: "/home/agent/photo.png",
        name: "photo.png",
        kind: "file",
        contentType: "image/png",
      }),
    ).toBe("Image");
    expect(fileTypeLabel({ path: "/home/agent/editor.app", name: "editor.app", kind: "file" })).toBe(
      "App launcher",
    );
    expect(desktopFileIconName({ path: "/home/agent/editor.app", name: "editor.app", kind: "file" })).toBe(
      "file-executable",
    );
  });

  it("does not directly preview text, json, or app launcher contents", () => {
    expect(isTextPreviewable({ path: "/home/agent/notes.txt", name: "notes.txt", kind: "file" })).toBe(false);
    expect(isTextPreviewable({ path: "/home/agent/config.json", name: "config.json", kind: "file" })).toBe(false);
    expect(isTextPreviewable({ path: "/home/agent/Desktop/editor.app", name: "editor.app", kind: "file" })).toBe(false);
  });
});
