import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CORE_REF = "ac97d8d8bf152b6fbe1c7dcace315f63c4f93b21";
const sdkInstallRoot = path.resolve("node_modules/@w3kits/sdk");
const sdkClientTypes = path.join(sdkInstallRoot, "dist/client/index.d.ts");

if (fs.existsSync(sdkClientTypes)) {
  process.exit(0);
}

const sourceSdkRoot = process.env.W3KITS_CORE_SDK_PATH
  ? path.resolve(process.env.W3KITS_CORE_SDK_PATH)
  : prepareSdkFromCore();

const builtClientTypes = path.join(sourceSdkRoot, "dist/client/index.d.ts");
if (!fs.existsSync(builtClientTypes)) {
  throw new Error(`w3kits_sdk_client_missing:${sourceSdkRoot}`);
}

fs.rmSync(sdkInstallRoot, { recursive: true, force: true });
fs.mkdirSync(sdkInstallRoot, { recursive: true });
copyRequiredPackageFile(sourceSdkRoot, "package.json");
copyRequiredPackageFile(sourceSdkRoot, "dist");
copyOptionalPackageFile(sourceSdkRoot, "README.md");

function prepareSdkFromCore() {
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
  execFileSync("pnpm", ["--filter", "@w3kits/sdk", "build"], {
    cwd: coreRoot,
    stdio: "inherit",
  });

  return path.join(coreRoot, "packages/sdk");
}

function copyRequiredPackageFile(sourceRoot, relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(sdkInstallRoot, relativePath);
  if (!fs.existsSync(source)) throw new Error(`w3kits_sdk_file_missing:${source}`);
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
