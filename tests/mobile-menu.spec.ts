import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(relativePath), "utf8");

describe("File Explorer mobile menu contracts", () => {
  it("clamps local context menus to the viewport", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("function clampContextMenuPoint");
    expect(source).toContain("CONTEXT_MENU_WIDTH = 220");
    expect(source).toContain("CONTEXT_MENU_MAX_HEIGHT = 360");
    expect(source).toContain("openContextMenu({");
    expect(source).not.toContain("ContextMenu.open({");
  });

  it("opens plugin-owned menus from statusbar, list background, and rows", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("function beginLongPress(");
    expect(source).toContain('className="statusbar"');
    expect(source).toContain('type: selectedCount > 0 ? "selection" : "background"');
    expect(source).toContain('closest("[data-explorer-entry=\'true\']")');
    expect(source).toContain('type: selectedEntriesForMenu.length > 1 ? "selection" : "entry"');
  });

  it("keeps mobile controls touch-sized and menus scrollable", () => {
    const styles = readSource("src/styles.css");

    expect(styles).toContain("max-height: min(360px, calc(100vh - 16px));");
    expect(styles).toContain("overflow: auto;");
    expect(styles).toContain(".toolbar button {\n    width: 40px;\n    height: 40px;");
    expect(styles).toContain(".statusbar {\n    min-height: 38px;");
  });

  it("uses the earlier light file manager surface", () => {
    const styles = readSource("src/styles.css");

    expect(styles).toContain("color-scheme: light;");
    expect(styles).toContain("background: #ffffff;");
    expect(styles).toContain(".tree,\n.details {\n  overflow: auto;\n  background: #f8fafc;");
    expect(styles).not.toContain("color-scheme: dark;");
    expect(styles).not.toContain("background: #0f1115;");
  });
});
