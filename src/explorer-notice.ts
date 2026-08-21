/**
 * 把桌面文件桥接错误码映射到 File Explorer 已翻译文案，并识别可忽略的刷新取消。
 * Maps desktop file-bridge error codes onto File Explorer translated copy and ignored refresh cancellations.
 */
import type { TranslationKey } from "./i18n";

const WRITES_FROZEN = "writes_frozen";

/**
 * 读取桌面客户端错误上的稳定 code。
 * Reads the stable desktop client error code when present.
 */
export function explorerClientErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = "code" in error ? error.code : null;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

/**
 * 写入被 Computer writer 冻结时用诚实文案，否则用调用方的失败文案。
 * Uses the honest frozen-writer copy when Home writes are frozen; otherwise the caller fallback.
 */
export function explorerNoticeKey(
  error: unknown,
  fallback: TranslationKey,
): TranslationKey {
  return explorerClientErrorCode(error) === WRITES_FROZEN
    ? "notify.writesFrozen"
    : fallback;
}

/**
 * 状态栏使用与通知同一套冻结/失败映射。
 * Status line uses the same frozen-writer or fallback mapping as the notice.
 */
export function explorerStatusKey(
  error: unknown,
  fallback: TranslationKey,
): TranslationKey {
  return explorerClientErrorCode(error) === WRITES_FROZEN
    ? "status.writesFrozen"
    : fallback;
}

/**
 * 判断目录刷新失败是否只是取消或离开后的过期请求，不应向用户报错。
 * Returns whether a directory refresh failed only as a cancelled or leftover request.
 */
export function isExplorerRefreshCancellation(
  error: unknown,
  stillViewingTarget: boolean,
): boolean {
  const name =
    error && typeof error === "object" && "name" in error ? error.name : null;
  const code = explorerClientErrorCode(error);
  if (name === "AbortError") return true;
  if (code === "aborted" || code === "request_aborted") return true;
  return code === "request_timeout" && !stillViewingTarget;
}
