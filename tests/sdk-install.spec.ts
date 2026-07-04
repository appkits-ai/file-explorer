import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(relativePath), "utf8");

describe("AppKits SDK install guard", () => {
  it("rejects stale W3Kits SDK installs before build", () => {
    const script = readSource("scripts/install-appkits-sdk.mjs");

    expect(script).toContain('manifest.name !== "@appkits-ai/sdk"');
    expect(script).toContain('protocol.includes("APPKITS_DESKTOP_REQUEST")');
    expect(script).toContain('!protocol.includes("W3KITS_DESKTOP_REQUEST")');
    expect(script).toContain("dist/desktop-icons.d.ts");
    expect(script).toContain('manifest.name === "@appkits-ai/ui"');
    expect(script).toContain("dist/components/button.d.ts");
    expect(script).toContain("appkits_sdk_invalid");
  });

  it("rejects SDK installs that lack file-change events and object context-menu selections", () => {
    const script = readSource("scripts/install-appkits-sdk.mjs");

    expect(script).toContain("AppKitsFilesChangedEvent");
    expect(script).toContain("files.changed");
    expect(script).toContain("AppKitsContextMenuSelectEvent");
    expect(script).toContain("handler({ itemId: data.itemId })");
    expect(script).toContain('!clientRuntime.includes("handler(data.itemId)")');
    expect(script).toContain("appkits_sdk_source_stale");
  });
});
