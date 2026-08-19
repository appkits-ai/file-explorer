/**
 * 绘制资源管理器文件图标；.app 只用 host apps.list，图片缩略图才读正文。
 * Renders File Explorer file icons; .app launchers use host apps.list, and only image thumbnails read bodies.
 */

import React from "react";
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
const INSTALLED_APPS_LIST_TTL_MS = 2000;

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
  readonly { id: string; icon?: string; hasUpdate?: boolean }[]
> | null = null;
let installedAppsListedAt = 0;

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

/**
 * 短 TTL 复用 apps.list()，让桌面 catalog 占位稍后能被看到。
 * Reuses apps.list() for a short TTL so later desktop catalog placeholders can appear.
 */
function listInstalledApps(): Promise<
  readonly { id: string; icon?: string; hasUpdate?: boolean }[]
> {
  const now = Date.now();
  if (
    !installedAppsPromise ||
    now - installedAppsListedAt > INSTALLED_APPS_LIST_TTL_MS
  ) {
    installedAppsListedAt = now;
    installedAppsPromise = appkits.apps.list().catch(() => []);
  }
  return installedAppsPromise;
}

/** 只用 host 已安装应用图标，不读 .app 正文。 Uses only the host installed-app icon and never reads the .app body. */
async function resolveInstalledAppMeta(
  path: string,
): Promise<{ iconUrl: string; hasUpdate: boolean }> {
  const slug = pluginSlugCandidateFromAppFileName(path);
  if (!slug) return { iconUrl: "", hasUpdate: false };
  const apps = await listInstalledApps();
  const app = apps.find((item) => item.id === `plugin:${slug}`);
  return {
    iconUrl: app?.icon?.trim() ?? "",
    hasUpdate: app?.hasUpdate === true,
  };
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
  const [appHasUpdate, setAppHasUpdate] = React.useState(false);
  const type = fileTypeKind(entry);
  const iconName = desktopFileIconName(entry);
  const iconAsset = getDesktopIconAssetPath(iconName);

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
    void resolveInstalledAppMeta(entry.path).then((meta) => {
      if (cancelled) return;
      setAppHasUpdate(meta.hasUpdate);
      if (meta.iconUrl) {
        fileIconCache.set(cacheKey, { kind: "image", src: meta.iconUrl });
        setAppIconUrl(meta.iconUrl);
        return;
      }
      setAppIconUrl("");
      setAppIconFailed(false);
    });
    return () => {
      cancelled = true;
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
      <span
        className="file-icon"
        data-icon={iconName}
        data-large={large ? "true" : undefined}
      >
        <img
          src={appIconUrl}
          alt=""
          className={large ? "file-icon-image large" : "file-icon-image"}
          onError={() => {
            fileIconCache.set(fileIconCacheKey(entry, "app"), { kind: "empty" });
            setAppIconFailed(true);
          }}
        />
        {appHasUpdate ? (
          <span
            aria-label="This plugin has an update"
            title="This plugin has an update"
            className="file-update-badge"
          />
        ) : null}
      </span>
    );
  }
  if (!iconAsset) return <BlankFileIcon large={large} />;
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
      />
      {appHasUpdate ? (
        <span
          aria-label="This plugin has an update"
          title="This plugin has an update"
          className="file-update-badge"
        />
      ) : null}
    </span>
  );
}
