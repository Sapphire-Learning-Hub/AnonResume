import { redirect } from "next/navigation";

import { AdminMfaResetReviewActions } from "@/components/admin/AdminMfaResetReviewActions";
import {
  AdminIdentity,
  AdminPage,
  AdminStatus,
  AdminTable,
} from "@/components/admin/AdminPage";
import type { AdminMfaResetRequestStatus } from "@/db/schema";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";
import { listAdminMfaResetRequests } from "@/lib/admin-mfa-reset-requests";
import { requireAdminPage } from "@/lib/admin-page";
import {
  parsePageRequest,
  type PaginationSearchParams,
} from "@/lib/pagination";

function statusPresentation(status: AdminMfaResetRequestStatus) {
  switch (status) {
    case "pending":
      return { key: "mfaReset.status.pending" as const, tone: "warning" as const };
    case "approved":
      return { key: "mfaReset.status.approved" as const, tone: "success" as const };
    case "rejected":
      return { key: "mfaReset.status.rejected" as const, tone: "danger" as const };
    case "cancelled":
      return { key: "mfaReset.status.cancelled" as const, tone: "default" as const };
    case "expired":
      return { key: "mfaReset.status.expired" as const, tone: "default" as const };
  }
}

export default async function ManagementMfaResetsPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  const context = await requireAdminPage();
  if (context.kind !== "super_admin") redirect("/app/manage/forbidden");
  const resolvedSearchParams = await searchParams;
  const requests = await listAdminMfaResetRequests(
    parsePageRequest(resolvedSearchParams),
  );
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);

  return (
    <AdminPage title={t("nav.mfaResets")}>
      <AdminTable
        actionColumn
        headers={[
          t("mfaReset.requester"),
          t("mfaReset.status"),
          t("mfaReset.requestedAt"),
          t("mfaReset.expires"),
          t("common.actions"),
        ]}
        pagination={{
          basePath: "/app/manage/mfa-resets",
          page: requests.page,
          pageSize: requests.pageSize,
          searchParams: resolvedSearchParams,
          total: requests.total,
          totalPages: requests.totalPages,
        }}
        rows={requests.items.map((request) => {
          const status = statusPresentation(request.status);
          return [
            <AdminIdentity
              description={request.requesterEmail}
              key="identity"
              title={request.requesterName}
            />,
            <AdminStatus key="status" tone={status.tone}>
              {t(status.key)}
            </AdminStatus>,
            request.createdAt.toLocaleString(locale),
            request.expiresAt.toLocaleString(locale),
            <AdminMfaResetReviewActions
              expiresAt={request.expiresAt.toLocaleString(locale)}
              key="actions"
              reason={request.reason}
              requestId={request.id}
              requestedAt={request.createdAt.toLocaleString(locale)}
              requesterEmail={request.requesterEmail}
              requesterName={request.requesterName}
              reviewReason={request.reviewReason}
              status={request.status}
              statusLabel={t(status.key)}
            />,
          ];
        })}
      />
    </AdminPage>
  );
}
