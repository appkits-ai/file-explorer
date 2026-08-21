/**
 * 核对 File Explorer 把 writes_frozen 映射成诚实文案，并忽略可取消的刷新。
 * Verifies File Explorer maps writes_frozen onto honest notice keys and ignores cancelled refreshes.
 */
import { describe, expect, it } from "vitest";
import {
  explorerClientErrorCode,
  explorerNoticeKey,
  explorerStatusKey,
  isExplorerRefreshCancellation,
} from "../src/explorer-notice";

describe("explorer notice mapping", () => {
  it("reads a desktop client error code", () => {
    expect(
      explorerClientErrorCode({
        code: "writes_frozen",
        message: "workspace writes are frozen for the Computer writer",
      }),
    ).toBe("writes_frozen");
    expect(explorerClientErrorCode(new Error("fail"))).toBeNull();
    expect(explorerClientErrorCode("writes_frozen")).toBeNull();
  });

  it("uses the frozen-writer copy only for writes_frozen", () => {
    const frozen = { code: "writes_frozen", message: "frozen" };
    expect(explorerNoticeKey(frozen, "notify.createFailed")).toBe(
      "notify.writesFrozen",
    );
    expect(explorerStatusKey(frozen, "status.createFailed")).toBe(
      "status.writesFrozen",
    );
    expect(
      explorerNoticeKey({ code: "path_escape" }, "notify.createFailed"),
    ).toBe("notify.createFailed");
    expect(explorerNoticeKey(new Error("fail"), "notify.pasteFailed")).toBe(
      "notify.pasteFailed",
    );
    expect(explorerNoticeKey(frozen, "notify.renameFailed")).toBe(
      "notify.writesFrozen",
    );
    expect(explorerNoticeKey(frozen, "notify.moveFailed")).toBe(
      "notify.writesFrozen",
    );
    expect(explorerStatusKey(frozen, "status.renameFailed")).toBe(
      "status.writesFrozen",
    );
    expect(explorerStatusKey(frozen, "status.moveFailed")).toBe(
      "status.writesFrozen",
    );
  });

  it("ignores aborted refreshes and leftover request timeouts", () => {
    expect(
      isExplorerRefreshCancellation({ name: "AbortError" }, true),
    ).toBe(true);
    expect(
      isExplorerRefreshCancellation({ code: "aborted" }, true),
    ).toBe(true);
    expect(
      isExplorerRefreshCancellation({ code: "request_aborted" }, false),
    ).toBe(true);
    expect(
      isExplorerRefreshCancellation({ code: "request_timeout" }, false),
    ).toBe(true);
    expect(
      isExplorerRefreshCancellation({ code: "request_timeout" }, true),
    ).toBe(false);
    expect(
      isExplorerRefreshCancellation({ code: "not_found" }, true),
    ).toBe(false);
  });
});
