import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CORE_REF = "0a28e5e0fda8169bf5df877ad2db365260d0d263";
const sdkInstallRoot = path.resolve("node_modules/@appkits-ai/sdk");
const uiInstallRoot = path.resolve("node_modules/@appkits-ai/ui");
const sdkClientTypes = path.join(sdkInstallRoot, "dist/client/index.d.ts");
const sdkClientRuntime = path.join(sdkInstallRoot, "dist/client/index.js");
const sdkDesktopIconTypes = path.join(sdkInstallRoot, "dist/desktop-icons.d.ts");
const sdkPackageJson = path.join(sdkInstallRoot, "package.json");
const sdkClientProtocol = path.join(sdkInstallRoot, "dist/client/protocol.js");
const uiComponentTypes = path.join(uiInstallRoot, "dist/components/button.d.ts");
const uiPackageJson = path.join(uiInstallRoot, "package.json");
const requiredSdkClientTypeMarkers = [
  "open(input: AppKitsFileOpenInput)",
  "openers(input: AppKitsFileOpenTarget)",
  "AppKitsFilesChangedEvent",
  "onChanged(handler: (event: AppKitsFilesChangedEvent) => void)",
  "AppKitsContextMenuSelectEvent",
  "onSelect(handler: (event: AppKitsContextMenuSelectEvent) => void)",
];
const requiredSdkClientRuntimeMarkers = [
  'on("files.changed"',
  "handler({ itemId: data.itemId })",
];

if (installedSdkIsCurrent() && installedUiIsCurrent()) {
  process.exit(0);
}

const { sdkRoot: sourceSdkRoot, uiRoot: sourceUiRoot } = resolvePackageSources();

const builtClientTypes = path.join(sourceSdkRoot, "dist/client/index.d.ts");
if (!fs.existsSync(builtClientTypes)) {
  throw new Error(`appkits_sdk_client_missing:${sourceSdkRoot}`);
}
if (!sdkBuildSupportsRequiredDesktopBridge(sourceSdkRoot)) {
  throw new Error(`appkits_sdk_source_stale:${sourceSdkRoot}`);
}
const builtUiTypes = path.join(sourceUiRoot, "dist/components/button.d.ts");
if (!fs.existsSync(builtUiTypes)) {
  throw new Error(`appkits_ui_component_missing:${sourceUiRoot}`);
}

fs.rmSync(sdkInstallRoot, { recursive: true, force: true });
fs.mkdirSync(sdkInstallRoot, { recursive: true });
copyPackage(sourceSdkRoot, sdkInstallRoot, "appkits_sdk");

fs.rmSync(uiInstallRoot, { recursive: true, force: true });
fs.mkdirSync(uiInstallRoot, { recursive: true });
copyPackage(sourceUiRoot, uiInstallRoot, "appkits_ui");

if (!installedSdkIsCurrent() || !installedUiIsCurrent()) {
  throw new Error(`appkits_sdk_invalid:${sdkInstallRoot}`);
}

function installedSdkIsCurrent() {
  if (
    !fs.existsSync(sdkClientTypes) ||
    !fs.existsSync(sdkClientRuntime) ||
    !fs.existsSync(sdkDesktopIconTypes) ||
    !fs.existsSync(sdkPackageJson)
  ) {
    return false;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(sdkPackageJson, "utf8"));
    if (manifest.name !== "@appkits-ai/sdk") return false;
    if (typeof manifest.description === "string" && /w3kits/i.test(manifest.description)) return false;
  } catch {
    return false;
  }

  if (!fs.existsSync(sdkClientProtocol)) return false;
  const protocol = fs.readFileSync(sdkClientProtocol, "utf8");
  return (
    protocol.includes("APPKITS_DESKTOP_REQUEST") &&
    !protocol.includes("W3KITS_DESKTOP_REQUEST") &&
    sdkBuildSupportsRequiredDesktopBridge(sdkInstallRoot)
  );
}

function sdkBuildSupportsRequiredDesktopBridge(packageRoot) {
  const clientTypesPath = path.join(packageRoot, "dist/client/index.d.ts");
  const clientRuntimePath = path.join(packageRoot, "dist/client/index.js");
  if (!fs.existsSync(clientTypesPath) || !fs.existsSync(clientRuntimePath)) {
    return false;
  }

  const clientTypes = fs.readFileSync(clientTypesPath, "utf8");
  const clientRuntime = fs.readFileSync(clientRuntimePath, "utf8");
  return (
    requiredSdkClientTypeMarkers.every((marker) => clientTypes.includes(marker)) &&
    requiredSdkClientRuntimeMarkers.every((marker) =>
      clientRuntime.includes(marker),
    ) &&
    !clientRuntime.includes("handler(data.itemId)")
  );
}

function installedUiIsCurrent() {
  if (!fs.existsSync(uiComponentTypes) || !fs.existsSync(uiPackageJson)) {
    return false;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(uiPackageJson, "utf8"));
    return manifest.name === "@appkits-ai/ui";
  } catch {
    return false;
  }
}

function resolvePackageSources() {
  if (process.env.APPKITS_CORE_SDK_PATH && process.env.APPKITS_CORE_UI_PATH) {
    return {
      sdkRoot: path.resolve(process.env.APPKITS_CORE_SDK_PATH),
      uiRoot: path.resolve(process.env.APPKITS_CORE_UI_PATH),
    };
  }

  const coreRoot = process.env.APPKITS_CORE_ROOT
    ? path.resolve(process.env.APPKITS_CORE_ROOT)
    : prepareCore();
  return {
    sdkRoot: process.env.APPKITS_CORE_SDK_PATH
      ? path.resolve(process.env.APPKITS_CORE_SDK_PATH)
      : path.join(coreRoot, "packages/sdk"),
    uiRoot: process.env.APPKITS_CORE_UI_PATH
      ? path.resolve(process.env.APPKITS_CORE_UI_PATH)
      : path.join(coreRoot, "packages/ui"),
  };
}

function prepareCore() {
  const repository =
    process.env.APPKITS_CORE_REPOSITORY || "https://github.com/appkits-ai/core";
  const ref = process.env.APPKITS_CORE_REF || CORE_REF;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "appkits-core-sdk-"));
  const coreRoot = path.join(tempRoot, "core");

  execFileSync(
    "git",
    ["clone", "--filter=blob:none", "--no-checkout", repository, coreRoot],
    { stdio: "inherit" },
  );
  execFileSync("git", ["checkout", ref], { cwd: coreRoot, stdio: "inherit" });
  execFileSync("pnpm", ["install", "--frozen-lockfile"], {
    cwd: coreRoot,
    stdio: "inherit",
  });
  execFileSync("pnpm", ["--filter", "@appkits-ai/sdk", "build"], {
    cwd: coreRoot,
    stdio: "inherit",
  });
  execFileSync("pnpm", ["--filter", "@appkits-ai/ui", "build"], {
    cwd: coreRoot,
    stdio: "inherit",
  });

  return coreRoot;
}

function copyPackage(sourceRoot, installRoot, label) {
  copyRequiredPackageFile(sourceRoot, installRoot, "package.json", label);
  copyRequiredPackageFile(sourceRoot, installRoot, "dist", label);
  copyOptionalPackageFile(sourceRoot, installRoot, "README.md");
  copyOptionalPackageFile(sourceRoot, installRoot, "src/styles/globals.css");
  copyOptionalPackageFile(sourceRoot, installRoot, "postcss.config.mjs");
}

function copyRequiredPackageFile(sourceRoot, installRoot, relativePath, label) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(installRoot, relativePath);
  if (!fs.existsSync(source)) throw new Error(`${label}_file_missing:${source}`);
  copyPath(source, target);
}

function copyOptionalPackageFile(sourceRoot, installRoot, relativePath) {
  const source = path.join(sourceRoot, relativePath);
  if (fs.existsSync(source)) copyPath(source, path.join(installRoot, relativePath));
}

function copyPath(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}
