/**
 * 把桌面文件桥接错误码映射到 File Explorer 已翻译文案。
 * Maps desktop file-bridge error codes onto File Explorer translated copy.
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
