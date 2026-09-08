import { ResumeDashboardShell } from "@/components/dashboard/ResumeDashboardShell";
import { requireSession } from "@/lib/auth-session";
import { listResumeEntries } from "@/lib/resume-repository";

export default async function DashboardPage() {
  const session = await requireSession();
  return (
    <ResumeDashboardShell
      createAction="/app/create-resume"
      resumes={await listResumeEntries(session.user.id)}
    />
  );
}
