import { db } from "@/db";
import { getResumeFontPreset } from "@/domain/resume/font-presets";
import {
  getResumeRecord,
  ResumeNotFoundError,
  saveResumeRecordWithExecutor,
} from "@/lib/resume/repository";

import {
  InvalidFontPresetError,
  recordUserFontApplied,
} from "./preferences";

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
    const resume = await getResumeRecord(input.userId, input.resumeId);

    if (!resume) {
      throw new ResumeNotFoundError(input.resumeId);
    }

    const document = structuredClone(resume.document);
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
