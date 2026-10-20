export class ResumeTrashedError extends Error {
  constructor() { super("resume_trashed"); this.name = "ResumeTrashedError"; }
}
export class ResumeTrashExpiredError extends Error {
  constructor() { super("resume_trash_expired"); this.name = "ResumeTrashExpiredError"; }
}
export class ResumeTrashBusyError extends Error {
  constructor() { super("resume_trash_busy"); this.name = "ResumeTrashBusyError"; }
}
