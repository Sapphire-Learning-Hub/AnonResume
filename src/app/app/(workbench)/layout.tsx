import { WorkbenchShell } from "@/components/dashboard/WorkbenchShell";
import { requireSession } from "@/lib/auth-session";
import { listResumeEntries } from "@/lib/resume-repository";

export default async function WorkbenchLayout() {
  const session = await requireSession();

  return (
    <WorkbenchShell
      createAction="/app/create-resume"
      resumes={await listResumeEntries(session.user.id)}
      user={session.user}
    />
  );
}
