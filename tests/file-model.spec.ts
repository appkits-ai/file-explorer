import { describe, expect, it } from "vitest";
import {
  HOME_ROOT,
  breadcrumbSegments,
  buildDirectoryTree,
  childEntries,
  createTargetPath,
  fileTypeLabel,
  mergeDirectoryListing,
  pendingCreateEntry,
  pendingCreatePath,
  pathFromLaunchParams,
  pathFromVisiblePath,
  sanitizeFilename,
  searchEntries,
  selectedPathFromLaunchParams,
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
    expect(visiblePath("/home/agent/project/src")).toBe("Home/project/src");
    expect(pathFromVisiblePath("Home/project/src")).toBe(
      "/home/agent/project/src",
    );
    expect(breadcrumbSegments("/home/agent/project/src").map((part) => part.label)).toEqual([
      "Home",
      "project",
      "src",
    ]);
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
  });
});
