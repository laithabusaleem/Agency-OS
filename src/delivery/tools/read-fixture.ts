import { getFixture } from "@/delivery/fixtures";
import type { DeliveryTool } from "@/delivery/types";

export const readFixtureTool: DeliveryTool = {
  id: "read_fixture",
  async execute(_ctx, params) {
    const fixtureId = String(params.fixtureId ?? "");
    try {
      const data = getFixture(fixtureId);
      return { ok: true, data: { fixtureId, ...data } };
    } catch (error) {
      return {
        ok: false,
        code: "fixture_missing",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      };
    }
  },
};
