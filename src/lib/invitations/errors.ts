export class InvitationLimitError extends Error {
  constructor() {
    super("The active invitation limit has been reached");
    this.name = "InvitationLimitError";
  }
}

export class InvitationResendTooSoonError extends Error {
  constructor(readonly nextAllowedAt: Date) {
    super("The invitation cannot be resent yet");
    this.name = "InvitationResendTooSoonError";
  }
}

export class InvitationEmailError extends Error {
  constructor(message = "The invitation email is invalid") {
    super(message);
    this.name = "InvitationEmailError";
  }
}

export class InvitationNotActionableError extends Error {
  constructor() {
    super("The invitation is not available for this operation");
    this.name = "InvitationNotActionableError";
  }
}
