import type {
  SocialRegistrationAttemptState,
  socialRegistrationAttempts,
} from "@/db/social-registration-schema";

export type SocialRegistrationProvider = "github";

export type SocialRegistrationAttempt =
  typeof socialRegistrationAttempts.$inferSelect;

export type SocialRegistrationIntentView = {
  state: "password" | "email";
  displayName: string;
  imageUrl: string | null;
  email: string | null;
};

export type SocialRegistrationMutableState = Exclude<
  SocialRegistrationAttemptState,
  "completed" | "expired" | "cancelled"
>;
