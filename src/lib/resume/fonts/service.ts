import { db } from "@/db";
import { getResumeFontPreset } from "@/domain/resume/font-presets";
import {
  lockOwnedResume,
  saveResumeRecordWithExecutor,
} from "@/lib/resume/repository";
import { validateResumeDocument } from "@/domain/resume/validation";
import { ResumeTrashedError } from "@/lib/resume/trash/errors";

import { InvalidFontPresetError, recordUserFontApplied } from "./preferences";

export async function applyResumeFontPreset(input: {
  userId: string;
  resumeId: string;
  version: number;
  fontPresetId: string;
  now?: Date;
}) {
  const preset = getResumeFontPreset(input.fontPresetId);

  if (!preset) {
    throw new InvalidFontPresetError();
  }

  return db.transaction(async (transaction) => {
    const resume = await lockOwnedResume(
      transaction,
      input.userId,
      input.resumeId,
    );
    if (resume.deletedAt) throw new ResumeTrashedError();
    const document = structuredClone(validateResumeDocument(resume.document));
    document.settings.typography.fontFamily = preset.fontFamily;

    const updated = await saveResumeRecordWithExecutor(transaction, {
      userId: input.userId,
      resumeId: input.resumeId,
      version: input.version,
      document,
    });

    await recordUserFontApplied(transaction, {
      userId: input.userId,
      fontPresetId: input.fontPresetId,
      now: input.now ?? new Date(),
    });

    return updated;
  });
}
