import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  assertOrgAccess,
  type AuthUser,
} from "@/server/authz-rules";

const user: AuthUser = {
  id: "user_1",
  email: "a@example.com",
  name: "A",
  role: "member",
  organizationId: "org_1",
};

describe("assertOrgAccess", () => {
  it("allows same-organization access", () => {
    expect(() => assertOrgAccess(user, "org_1")).not.toThrow();
  });

  it("blocks cross-organization access", () => {
    expect(() => assertOrgAccess(user, "org_other")).toThrow(
      AuthorizationError,
    );
  });
});
