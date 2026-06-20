import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(relativePath), "utf8");

describe("File Explorer mobile menu contracts", () => {
  it("delegates context menus to the parent shell", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("appkits.ContextMenu.open({");
    expect(source).toContain("appkits.ContextMenu.onSelect");
    expect(source).toContain("contextMenuActionsRef");
    expect(source).toContain('type: "separator"');
    expect(source).toContain('type: "submenu"');
    expect(source).toContain("shortcut: options.shortcut");
    expect(source).toContain("checked: options.checked");
    expect(source).toContain('"gallery"');
    expect(source).not.toContain("function ContextMenu(");
    expect(source).not.toContain('className="context-menu"');
  });

  it("delegates file opening and open-with choices to the parent shell", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("appkits.FileSystem.open({");
    expect(source).toContain("appkits.FileSystem.openers({");
    expect(source).toContain("function openEntryWithShell(");
    expect(source).toContain('"action.openWith"');
    expect(source).toContain("opener.id");
    expect(source).not.toContain("setStatus(`Opened ${entry.name}`)");
  });

  it("requests host menus from statusbar, list background, and rows", () => {
    const source = readSource("src/main.tsx");

    expect(source).toContain("function beginLongPress(");
    expect(source).toContain('className="statusbar"');
    expect(source).toContain('type: selectedCount > 0 ? "selection" : "background"');
    expect(source).toContain('closest("[data-explorer-entry=\'true\']")');
    expect(source).toContain('type: selectedEntriesForMenu.length > 1 ? "selection" : "entry"');
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
    expect(source).toContain("appkits.FileSystem.list(targetDirectory)");
    expect(source).toContain("mergeDirectoryListing(");
    expect(source).toContain("loadingDirectories");
    expect(source).toContain("loadedDirectories");
    expect(styles).toContain(".refresh-icon.spinning");
    expect(styles).toContain("@keyframes refresh-spin");
    expect(styles).toContain(".files-icons");
    expect(styles).toContain(".files-gallery");
    expect(styles).toContain(".file-thumbnail.large");
  });

  it("uses localized UI strings and shared desktop file icon ids", () => {
    const source = readSource("src/main.tsx");
    const styles = readSource("src/styles.css");

    expect(source).toContain('appkits.Locale.current()');
    expect(source).toContain('t(locale, "toolbar.refresh")');
    expect(source).toContain("desktopFileIconName(entry)");
    expect(source).toContain("getDesktopIconAssetPath(iconName)");
    expect(source).toContain("parseAppKitsAppFile");
    expect(styles).toContain(".file-icon-asset");
    expect(styles).toContain(".file-icon-image");
  });

  it("follows the host theme while preserving the earlier light surface", () => {
    const styles = readSource("src/styles.css");
    const source = readSource("src/main.tsx");

    expect(source).toContain("appkits.Theme.current()");
    expect(source).toContain("appkits.Theme.onChange(applyTheme)");
    expect(source).toContain("document.documentElement.dataset.appkitsTheme");
    expect(styles).toContain(':root[data-appkits-theme="dark"]');
    expect(styles).toContain("background: var(--app-surface);");
    expect(styles).toContain("background: var(--app-panel);");
  });
});
