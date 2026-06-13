import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CORE_REF = "ac97d8d8bf152b6fbe1c7dcace315f63c4f93b21";
const sdkInstallRoot = path.resolve("node_modules/@w3kits/sdk");
const uiInstallRoot = path.resolve("node_modules/@appkits-ai/ui");
const sdkClientTypes = path.join(sdkInstallRoot, "dist/client/index.d.ts");
const uiComponentTypes = path.join(uiInstallRoot, "dist/components/button.d.ts");

if (fs.existsSync(sdkClientTypes) && fs.existsSync(uiComponentTypes)) {
  process.exit(0);
}

const coreRoot = prepareCore();
const sourceSdkRoot = process.env.W3KITS_CORE_SDK_PATH
  ? path.resolve(process.env.W3KITS_CORE_SDK_PATH)
  : path.join(coreRoot, "packages/sdk");
const sourceUiRoot = process.env.W3KITS_CORE_UI_PATH
  ? path.resolve(process.env.W3KITS_CORE_UI_PATH)
  : path.join(coreRoot, "packages/ui");

const builtClientTypes = path.join(sourceSdkRoot, "dist/client/index.d.ts");
if (!fs.existsSync(builtClientTypes)) {
  throw new Error(`w3kits_sdk_client_missing:${sourceSdkRoot}`);
}
const builtUiTypes = path.join(sourceUiRoot, "dist/components/button.d.ts");
if (!fs.existsSync(builtUiTypes)) {
  throw new Error(`appkits_ui_package_missing:${sourceUiRoot}`);
}

fs.rmSync(sdkInstallRoot, { recursive: true, force: true });
fs.mkdirSync(sdkInstallRoot, { recursive: true });
copyPackage(sourceSdkRoot, sdkInstallRoot, "w3kits_sdk");
fs.rmSync(uiInstallRoot, { recursive: true, force: true });
fs.mkdirSync(uiInstallRoot, { recursive: true });
copyPackage(sourceUiRoot, uiInstallRoot, "appkits_ui");

function prepareCore() {
  if (process.env.W3KITS_CORE_ROOT) return path.resolve(process.env.W3KITS_CORE_ROOT);
  if (process.env.W3KITS_CORE_SDK_PATH && process.env.W3KITS_CORE_UI_PATH)
    return process.cwd();

  const repository =
    process.env.W3KITS_CORE_REPOSITORY || "https://github.com/W3Kits/core";
  const ref = process.env.W3KITS_CORE_REF || CORE_REF;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "w3kits-core-sdk-"));
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
  runPnpmBuild(coreRoot, ["@w3kits/sdk", "@appkits-ai/sdk"]);
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

function runPnpmBuild(root, filters) {
  let lastError;
  for (const filter of filters) {
    try {
      execFileSync("pnpm", ["--filter", filter, "build"], {
        cwd: root,
        stdio: "inherit",
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("sdk_build_failed");
}
