import { beforeEach, describe, expect, it, vi } from "vitest";

const userFind = vi.fn();
const orgFind = vi.fn();
const membershipFind = vi.fn();

function query(value: unknown) {
  return { select: () => ({ lean: async () => value }) };
}

vi.mock("../../model/user.model", () => ({ default: { findOne: (...args: unknown[]) => userFind(...args) } }));
vi.mock("../../model/organisation.model", () => ({ default: { findOne: (...args: unknown[]) => orgFind(...args) } }));
vi.mock("../../model/membership.model", () => ({
  default: { findOne: (...args: unknown[]) => membershipFind(...args) },
}));

import { clearAuthLookupCache, forgetMembership } from "../../utils/auth-lookup-cache";
import { assertOrgRole } from "../../utils/org-access.util";

describe("assertOrgRole membership cache", () => {
  beforeEach(() => {
    clearAuthLookupCache();
    userFind.mockReset().mockImplementation(() => query({ _id: "user" }));
    orgFind.mockReset().mockImplementation(() => query({ _id: "org" }));
    membershipFind.mockReset().mockImplementation(() => query({ role: "member" }));
  });

  it("skips the database on the second check for the same member", async () => {
    await assertOrgRole("user-1", "org-1", "member");
    await assertOrgRole("user-1", "org-1", "member");
    expect(membershipFind).toHaveBeenCalledTimes(1);
    expect(userFind).toHaveBeenCalledTimes(1);
    expect(orgFind).toHaveBeenCalledTimes(1);
  });

  it("reads the database again after the membership is forgotten", async () => {
    await assertOrgRole("user-1", "org-1", "member");
    forgetMembership("user-1", "org-1");
    await assertOrgRole("user-1", "org-1", "member");
    expect(membershipFind).toHaveBeenCalledTimes(2);
  });

  it("still rejects a cached role that is too low", async () => {
    await assertOrgRole("user-1", "org-1", "member");
    await expect(assertOrgRole("user-1", "org-1", "admin")).rejects.toThrow(/admin/);
    expect(membershipFind).toHaveBeenCalledTimes(1);
  });
});
