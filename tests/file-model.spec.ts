import { describe, expect, it } from "vitest";
import {
  HOME_ROOT,
  buildDirectoryTree,
  childEntries,
  createTargetPath,
  pendingCreateEntry,
  pendingCreatePath,
  pathFromLaunchParams,
  searchEntries,
  uniquePath,
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
        w3kitsOpenFolder: { path: "/home/agent/project" },
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
});
