export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  organizationId: string;
};

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertOrgAccess(
  user: AuthUser,
  organizationId: string | null | undefined,
) {
  if (!organizationId || organizationId !== user.organizationId) {
    throw new AuthorizationError("Cross-organization access denied");
  }
}
