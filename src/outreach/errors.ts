import type { SendGateFailureCode } from "@/outreach/types";

export class OutreachGateError extends Error {
  constructor(
    readonly code: SendGateFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "OutreachGateError";
  }
}
