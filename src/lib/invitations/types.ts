export type UserInvitationStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked"
  | "registered_independently"
  | "accepted_via_other_invitation";

export type UserInvitationSummary = {
  id: string;
  email: string;
  status: UserInvitationStatus;
  createdAt: Date;
  lastSentAt: Date;
  expiresAt: Date;
  nextResendAt: Date;
};

export type InvitationCreateResult =
  | { outcome: "sent"; invitation: UserInvitationSummary }
  | { outcome: "handled" };

export type ProductInvitationDelivery = (input: {
  email: string;
  inviterName: string;
  replacesPreviousLink: boolean;
  url: string;
}) => Promise<void>;
