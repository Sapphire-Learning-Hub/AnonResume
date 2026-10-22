export type TemplateErrorCode =
  | "invalid_request"
  | "template_not_found"
  | "template_source_conflict"
  | "template_version_conflict"
  | "template_operation_conflict"
  | "template_document_unavailable"
  | "template_account_unavailable";
export class TemplateError extends Error {
  constructor(public readonly code: TemplateErrorCode) {
    super(code);
    this.name = "TemplateError";
  }
}
export function templateErrorStatus(code: TemplateErrorCode) {
  if (code === "invalid_request") return 400;
  if (code === "template_not_found") return 404;
  if (code === "template_document_unavailable") return 422;
  return 409;
}
