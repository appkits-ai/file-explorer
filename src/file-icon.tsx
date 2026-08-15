/**
 * 绘制资源管理器文件图标，并在会话内缓存已解析的缩略图与启动器图标。
 * Renders File Explorer file icons and caches resolved thumbnails and launcher icons for the session.
 */

import React from "react";
import { parseAppKitsAppFile } from "@appkits-ai/sdk/app-file";
import * as appkits from "@appkits-ai/sdk/client";
import { getDesktopIconAssetPath } from "@appkits-ai/sdk/desktop-icons";
import {
  desktopFileIconName,
  fileTypeKind,
  filenameFromPath,
  type ExplorerEntry,
} from "./file-model";

const FILE_ICON_BODY_READ_DELAY_MS = 80;
const MAX_CONCURRENT_FILE_ICON_BODY_READS = 2;
const APPKITS_HOST_ORIGIN = "https://appkits.ai";

type FileReadResult = Awaited<ReturnType<typeof appkits.files.read>>;

interface ScheduledFileIconBodyRead {
  path: string;
  cancelled: boolean;
  onRead: (file: FileReadResult) => void;
  onError: () => void;
}

const pendingFileIconBodyReads: ScheduledFileIconBodyRead[] = [];
let activeFileIconBodyReads = 0;
let fileIconBodyReadTimer: number | null = null;

type CachedFileIcon = { kind: "image"; src: string } | { kind: "empty" };

const fileIconCache = new Map<string, CachedFileIcon>();
let installedAppsPromise: Promise<
  readonly { id: string; icon?: string }[]
> | null = null;

/**
 * 把宿主相对路径或绝对 URL 收成 iframe 可加载的图标地址。
 * Resolves a host-relative path or absolute URL into an icon address the plugin iframe can load.
 */
export function resolveHostIconUrl(iconUrl: string | undefined): string {
  const trimmed = iconUrl?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) {
    return new URL(trimmed, appkitsHostOrigin()).toString();
  }
  return trimmed;
}

/** 用 referrer 或生产宿主源解析相对图标。 Uses the document referrer or the production host origin for relative icons. */
function appkitsHostOrigin(): string {
  if (typeof document === "undefined" || !document.referrer) {
    return APPKITS_HOST_ORIGIN;
  }
  try {
    return new URL(document.referrer).origin;
  } catch {
    return APPKITS_HOST_ORIGIN;
  }
}

/**
 * 从任意 .app 文件名推出可匹配已安装插件的 slug；空格与下划线归一为连字符。
 * Derives an installed-plugin slug from any .app filename; spaces and underscores become hyphens.
 */
export function pluginSlugCandidateFromAppFileName(path: string): string | null {
  const name = filenameFromPath(path.replace(/\/+$/, ""));
  if (!/\.app$/i.test(name)) return null;
  const slug = name
    .replace(/\.app$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return /^[a-z0-9][a-z0-9.-]{0,127}$/.test(slug) ? slug : null;
}

/** 会话内图标缓存键；缺省 updatedAt 时保持稳定。 Session icon cache key; stays stable when updatedAt is absent. */
function fileIconCacheKey(entry: ExplorerEntry, kind: "app" | "image"): string {
  return `${kind}:${entry.path}:${entry.size ?? ""}:${entry.updatedAt ?? ""}`;
}

/** 复用一次 apps.list()，避免每个图标各打一枪。 Reuses one apps.list() so each icon does not fetch the registry alone. */
function listInstalledApps(): Promise<readonly { id: string; icon?: string }[]> {
  installedAppsPromise ??= appkits.apps.list().catch(() => []);
  return installedAppsPromise;
}

/**
 * 去掉 image: 前缀，并把宿主相对路径收成可加载 URL。
 * Strips an image: prefix and resolves a host-relative path to a loadable URL.
 */
function iconUrlFromAppIcon(icon: string | undefined): string {
  const trimmed = icon?.trim() ?? "";
  if (!trimmed) return "";
  const withoutPrefix = trimmed.startsWith("image:")
    ? trimmed.slice("image:".length)
    : trimmed;
  if (
    withoutPrefix.startsWith("/") ||
    /^https?:\/\//i.test(withoutPrefix) ||
    /^(data|blob):/i.test(withoutPrefix)
  ) {
    return resolveHostIconUrl(withoutPrefix);
  }
  const asset = getDesktopIconAssetPath(withoutPrefix);
  return asset ? resolveHostIconUrl(asset) : "";
}

/** 用已安装应用注册表图标，而不是过期的 .app 正文 URL。 Prefers the installed app registry icon over a stale .app body URL. */
async function resolveInstalledAppIconUrl(path: string): Promise<string> {
  const slug = pluginSlugCandidateFromAppFileName(path);
  if (!slug) return "";
  const apps = await listInstalledApps();
  const app = apps.find((item) => item.id === `plugin:${slug}`);
  return iconUrlFromAppIcon(app?.icon);
}

function drainFileIconBodyReads(): void {
  while (
    activeFileIconBodyReads < MAX_CONCURRENT_FILE_ICON_BODY_READS &&
    pendingFileIconBodyReads.length > 0
  ) {
    const task = pendingFileIconBodyReads.shift();
    if (!task || task.cancelled) continue;
    activeFileIconBodyReads += 1;
    void appkits.files
      .read(task.path)
      .then((file) => {
        if (!task.cancelled) task.onRead(file);
      })
      .catch(() => {
        if (!task.cancelled) task.onError();
      })
      .finally(() => {
        activeFileIconBodyReads = Math.max(0, activeFileIconBodyReads - 1);
        drainFileIconBodyReads();
      });
  }
}

function scheduleFileIconBodyRead(
  path: string,
  onRead: (file: FileReadResult) => void,
  onError: () => void,
): () => void {
  const task: ScheduledFileIconBodyRead = {
    path,
    cancelled: false,
    onRead,
    onError,
  };
  pendingFileIconBodyReads.push(task);
  if (fileIconBodyReadTimer === null) {
    fileIconBodyReadTimer = window.setTimeout(() => {
      fileIconBodyReadTimer = null;
      drainFileIconBodyReads();
    }, FILE_ICON_BODY_READ_DELAY_MS);
  }
  return () => {
    task.cancelled = true;
  };
}

function decodeReadResult(file: FileReadResult): string {
  if (typeof file.body === "string") return file.body;
  if (!file.bodyBase64) return "";
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(file.bodyBase64), (char) => char.charCodeAt(0)),
    );
  } catch {
    return "";
  }
}

function BlankFileIcon({ large = false }: { large?: boolean }) {
  return (
    <span
      className={
        large ? "file-app-icon-placeholder large" : "file-app-icon-placeholder"
      }
      aria-hidden="true"
    />
  );
}

/**
 * 立即画出类型图标；.app 永不只剩空白占位，切换文件夹时复用缓存。
 * Paints the type icon immediately; .app never stays a blank tile, and folder switches reuse the cache.
 */
export function FileIcon({
  entry,
  large = false,
}: {
  entry: ExplorerEntry;
  large?: boolean;
}) {
  const [thumbnail, setThumbnail] = React.useState("");
  const [appIconUrl, setAppIconUrl] = React.useState("");
  const [appIconFailed, setAppIconFailed] = React.useState(false);
  const [iconAssetFailed, setIconAssetFailed] = React.useState(false);
  const type = fileTypeKind(entry);
  const iconName = desktopFileIconName(entry);
  const iconAsset = getDesktopIconAssetPath(iconName);

  React.useEffect(() => {
    setIconAssetFailed(false);
  }, [iconAsset]);

  React.useEffect(() => {
    if (type !== "image" || entry.temporary) {
      setThumbnail("");
      return;
    }
    const cacheKey = fileIconCacheKey(entry, "image");
    const cached = fileIconCache.get(cacheKey);
    if (cached?.kind === "image") {
      setThumbnail(cached.src);
      return;
    }
    if (cached?.kind === "empty") {
      setThumbnail("");
      return;
    }
    setThumbnail("");
    return scheduleFileIconBodyRead(
      entry.path,
      (file) => {
        if (!file.bodyBase64) {
          fileIconCache.set(cacheKey, { kind: "empty" });
          return;
        }
        const contentType =
          file.contentType || entry.contentType || "image/png";
        const src = `data:${contentType};base64,${file.bodyBase64}`;
        fileIconCache.set(cacheKey, { kind: "image", src });
        setThumbnail(src);
      },
      () => {
        fileIconCache.set(cacheKey, { kind: "empty" });
        setThumbnail("");
      },
    );
  }, [entry, type]);

  React.useEffect(() => {
    if (type !== "app" || entry.temporary) {
      setAppIconUrl("");
      setAppIconFailed(false);
      return;
    }
    const cacheKey = fileIconCacheKey(entry, "app");
    const cached = fileIconCache.get(cacheKey);
    if (cached?.kind === "image") {
      setAppIconUrl(cached.src);
      setAppIconFailed(false);
      return;
    }
    if (cached?.kind === "empty") {
      setAppIconUrl("");
      setAppIconFailed(false);
      return;
    }
    setAppIconUrl("");
    setAppIconFailed(false);
    let cancelled = false;
    let cancelBodyRead: (() => void) | undefined;
    void resolveInstalledAppIconUrl(entry.path).then((registryUrl) => {
      if (cancelled) return;
      if (registryUrl) {
        fileIconCache.set(cacheKey, { kind: "image", src: registryUrl });
        setAppIconUrl(registryUrl);
        return;
      }
      cancelBodyRead = scheduleFileIconBodyRead(
        entry.path,
        (file) => {
          const appFile = parseAppKitsAppFile(decodeReadResult(file));
          const nextUrl = resolveHostIconUrl(
            appFile?.marketplaceIconUrl || appFile?.iconUrl,
          );
          if (nextUrl) {
            fileIconCache.set(cacheKey, { kind: "image", src: nextUrl });
            setAppIconUrl(nextUrl);
            setAppIconFailed(false);
            return;
          }
          fileIconCache.set(cacheKey, { kind: "empty" });
          setAppIconUrl("");
          setAppIconFailed(false);
        },
        () => {
          fileIconCache.set(cacheKey, { kind: "empty" });
          setAppIconUrl("");
          setAppIconFailed(false);
        },
      );
    });
    return () => {
      cancelled = true;
      cancelBodyRead?.();
    };
  }, [entry, type]);

  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        className={large ? "file-thumbnail large" : "file-thumbnail"}
      />
    );
  }
  if (appIconUrl && !appIconFailed) {
    return (
      <img
        src={appIconUrl}
        alt=""
        className={large ? "file-icon-image large" : "file-icon-image"}
        onError={() => {
          fileIconCache.set(fileIconCacheKey(entry, "app"), { kind: "empty" });
          setAppIconFailed(true);
        }}
      />
    );
  }
  if (!iconAsset || iconAssetFailed) return <BlankFileIcon large={large} />;
  return (
    <span
      className="file-icon"
      data-icon={iconName}
      data-large={large ? "true" : undefined}
    >
      <img
        src={iconAsset}
        alt=""
        className="file-icon-asset"
        onError={() => setIconAssetFailed(true)}
      />
    </span>
  );
}
