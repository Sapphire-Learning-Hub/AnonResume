export async function deliverPostCommitAccountNotice(
  deliver: () => Promise<void>,
  event: string,
) {
  try {
    await deliver();
  } catch (error) {
    console.error(
      `[AnonResume] Failed to deliver post-commit account notice (${event})`,
      error,
    );
  }
}
