import { describe, expect, it } from "vitest";
import { loginSchema } from "@/lib/validations/auth";
import {
  clientSchema,
  leadSchema,
  projectSchema,
  serviceSchema,
  taskSchema,
} from "@/lib/validations/entities";

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "demo@agency.local",
      password: "DemoPass123!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short passwords", () => {
    const result = loginSchema.safeParse({
      email: "demo@agency.local",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("entity schemas", () => {
  it("validates a lead", () => {
    expect(
      leadSchema.safeParse({
        name: "Ada",
        email: "ada@example.com",
        status: "new",
      }).success,
    ).toBe(true);
  });

  it("allows unknown email for acquisition leads", () => {
    expect(
      leadSchema.safeParse({
        name: "Unknown Contact",
        email: "",
        status: "new",
        emailProvenance: "unknown",
      }).success,
    ).toBe(true);
  });

  it("validates a client", () => {
    expect(
      clientSchema.safeParse({
        name: "Northwind",
        email: "ops@example.com",
        status: "active",
      }).success,
    ).toBe(true);
  });

  it("coerces service price and active flag", () => {
    const result = serviceSchema.safeParse({
      name: "Brand",
      billingType: "fixed",
      unitPriceCents: "1200",
      isActive: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unitPriceCents).toBe(1200);
      expect(result.data.isActive).toBe(true);
    }
  });

  it("validates project and task payloads", () => {
    expect(
      projectSchema.safeParse({
        name: "Site",
        status: "planned",
      }).success,
    ).toBe(true);
    expect(
      taskSchema.safeParse({
        title: "Kickoff",
        status: "todo",
        priority: "high",
      }).success,
    ).toBe(true);
  });
});
