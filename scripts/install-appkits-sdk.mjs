import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CORE_REF = "db7819817f4a8c970bc81df82b61bd8dd12f0a71";
const sdkInstallRoot = path.resolve("node_modules/@appkits-ai/sdk");
const sdkClientTypes = path.join(sdkInstallRoot, "dist/client/index.d.ts");
const sdkPackageJson = path.join(sdkInstallRoot, "package.json");
const sdkClientProtocol = path.join(sdkInstallRoot, "dist/client/protocol.js");

if (installedSdkIsCurrent()) {
  process.exit(0);
}

const sourceSdkRoot = process.env.APPKITS_CORE_SDK_PATH
  ? path.resolve(process.env.APPKITS_CORE_SDK_PATH)
  : prepareSdkFromCore();

const builtClientTypes = path.join(sourceSdkRoot, "dist/client/index.d.ts");
if (!fs.existsSync(builtClientTypes)) {
  throw new Error(`appkits_sdk_client_missing:${sourceSdkRoot}`);
}

fs.rmSync(sdkInstallRoot, { recursive: true, force: true });
fs.mkdirSync(sdkInstallRoot, { recursive: true });
copyRequiredPackageFile(sourceSdkRoot, "package.json");
copyRequiredPackageFile(sourceSdkRoot, "dist");
copyOptionalPackageFile(sourceSdkRoot, "README.md");

if (!installedSdkIsCurrent()) {
  throw new Error(`appkits_sdk_invalid:${sdkInstallRoot}`);
}

function installedSdkIsCurrent() {
  if (!fs.existsSync(sdkClientTypes) || !fs.existsSync(sdkPackageJson)) {
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
  return protocol.includes("APPKITS_DESKTOP_REQUEST") && !protocol.includes("W3KITS_DESKTOP_REQUEST");
}

function prepareSdkFromCore() {
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

  return path.join(coreRoot, "packages/sdk");
}

function copyRequiredPackageFile(sourceRoot, relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(sdkInstallRoot, relativePath);
  if (!fs.existsSync(source)) throw new Error(`appkits_sdk_file_missing:${source}`);
  copyPath(source, target);
}

function copyOptionalPackageFile(sourceRoot, relativePath) {
  const source = path.join(sourceRoot, relativePath);
  if (fs.existsSync(source)) copyPath(source, path.join(sdkInstallRoot, relativePath));
}

function copyPath(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}
