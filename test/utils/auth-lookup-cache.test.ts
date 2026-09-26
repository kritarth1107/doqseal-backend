import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_LOOKUP_TTL_MS,
  clearAuthLookupCache,
  forgetMembership,
  forgetSession,
  forgetSessionsForUser,
  readMembership,
  readSession,
  rememberMembership,
  rememberSession,
} from "../../utils/auth-lookup-cache";

describe("auth lookup cache", () => {
  afterEach(() => {
    clearAuthLookupCache();
    vi.useRealTimers();
  });

  it("remembers a session for 15 seconds and drops it after logout", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    rememberSession("user-1", "token-a", { user: { userId: "user-1" }, expiresAtMs: null });
    expect(readSession("user-1", "token-a")?.user).toEqual({ userId: "user-1" });

    vi.advanceTimersByTime(AUTH_LOOKUP_TTL_MS);
    expect(readSession("user-1", "token-a")).toBeUndefined();

    rememberSession("user-1", "token-a", { user: { userId: "user-1" }, expiresAtMs: null });
    rememberSession("user-1", "token-b", { user: { userId: "user-1" }, expiresAtMs: null });
    forgetSession("user-1", "token-a");
    expect(readSession("user-1", "token-a")).toBeUndefined();
    expect(readSession("user-1", "token-b")).toBeDefined();

    forgetSessionsForUser("user-1");
    expect(readSession("user-1", "token-b")).toBeUndefined();
  });

  it("does not reuse a session past its own expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    rememberSession("user-1", "token-a", {
      user: { userId: "user-1" },
      expiresAtMs: Date.now() + 1000,
    });
    vi.advanceTimersByTime(1000);
    expect(readSession("user-1", "token-a")).toBeUndefined();
  });

  it("remembers a membership role until it is forgotten", () => {
    rememberMembership("user-1", "org-1", "admin");
    expect(readMembership("user-1", "org-1")).toBe("admin");
    forgetMembership("user-1", "org-1");
    expect(readMembership("user-1", "org-1")).toBeUndefined();
  });
});
