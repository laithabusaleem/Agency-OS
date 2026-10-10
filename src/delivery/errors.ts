export type DeliveryErrorCode =
  | "runs_disabled"
  | "incomplete_brief"
  | "unknown_template"
  | "tool_not_allowed"
  | "tool_failure"
  | "missing_artifact"
  | "invalid_artifact"
  | "qa_failed"
  | "unauthorized_action"
  | "model_code_blocked"
  | "workspace_error"
  | "recovery_required";

export class DeliveryError extends Error {
  readonly code: DeliveryErrorCode;

  constructor(code: DeliveryErrorCode, message: string) {
    super(message);
    this.name = "DeliveryError";
    this.code = code;
  }
}
