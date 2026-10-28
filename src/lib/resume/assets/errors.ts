export type ImageErrorCode =
  | "image_invalid"
  | "image_too_large"
  | "image_quota_exceeded"
  | "image_not_found"
  | "image_upload_disabled"
  | "image_busy"
  | "image_storage_unavailable"
  | "image_storage_in_use";
export class ImageAssetError extends Error {
  constructor(public readonly code: ImageErrorCode) {
    super(code);
    this.name = "ImageAssetError";
  }
}
export function imageErrorStatus(code: ImageErrorCode) {
  if (code === "image_not_found") return 404;
  if (code === "image_too_large") return 413;
  if (code === "image_invalid") return 400;
  if (code === "image_upload_disabled") return 403;
  if (code === "image_storage_unavailable") return 503;
  if (code === "image_busy") return 429;
  return 409;
}
