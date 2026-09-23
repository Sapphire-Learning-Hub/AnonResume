import { UserInvitationManager } from "@/components/invitations/UserInvitationManager";
import { requireSession } from "@/lib/auth/session";
import { listUserInvitations } from "@/lib/invitations/service";

export default async function InvitationsPage() {
  const session = await requireSession();
  const data = await listUserInvitations(session.user.id);

  return (
    <UserInvitationManager
      initialData={{
        ...data,
        now: new Date().toISOString(),
        items: data.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          lastSentAt: item.lastSentAt.toISOString(),
          expiresAt: item.expiresAt.toISOString(),
          nextResendAt: item.nextResendAt.toISOString(),
        })),
      }}
    />
  );
}
