import { and, desc, eq, isNull } from "drizzle-orm";

import { db, userFontPreferences } from "@/db";
import { getResumeFontPreset } from "@/domain/resume/font-presets";

export type UserFontPreference = {
  fontPresetId: string;
  favorite: boolean;
  lastAppliedAt?: number;
};

export class InvalidFontPresetError extends Error {
  constructor() {
    super("invalid_font_preset");
    this.name = "InvalidFontPresetError";
  }
}

function requireFontPreset(fontPresetId: string) {
  const preset = getResumeFontPreset(fontPresetId);
  if (!preset) throw new InvalidFontPresetError();
  return preset;
}

export async function listUserFontPreferences(
  userId: string,
): Promise<UserFontPreference[]> {
  const rows = await db
    .select()
    .from(userFontPreferences)
    .where(eq(userFontPreferences.userId, userId))
    .orderBy(desc(userFontPreferences.lastAppliedAt), userFontPreferences.fontPresetId);

  return rows
    .filter((row) => Boolean(getResumeFontPreset(row.fontPresetId)))
    .map((row) => ({
      fontPresetId: row.fontPresetId,
      favorite: row.isFavorite,
      lastAppliedAt: row.lastAppliedAt?.getTime(),
    }));
}

export async function setUserFontFavorite(input: {
  userId: string;
  fontPresetId: string;
  favorite: boolean;
}) {
  requireFontPreset(input.fontPresetId);

  if (!input.favorite) {
    await db
      .delete(userFontPreferences)
      .where(
        and(
          eq(userFontPreferences.userId, input.userId),
          eq(userFontPreferences.fontPresetId, input.fontPresetId),
          isNull(userFontPreferences.lastAppliedAt),
        ),
      );
  }

  if (input.favorite) {
    await db
      .insert(userFontPreferences)
      .values({
        userId: input.userId,
        fontPresetId: input.fontPresetId,
        isFavorite: true,
      })
      .onConflictDoUpdate({
        target: [userFontPreferences.userId, userFontPreferences.fontPresetId],
        set: { isFavorite: true, updatedAt: new Date() },
      });
  } else {
    await db
      .update(userFontPreferences)
      .set({ isFavorite: false, updatedAt: new Date() })
      .where(
        and(
          eq(userFontPreferences.userId, input.userId),
          eq(userFontPreferences.fontPresetId, input.fontPresetId),
        ),
      );
  }

  return listUserFontPreferences(input.userId);
}

type FontPreferenceWriter = Pick<typeof db, "insert">;

export async function recordUserFontApplied(
  writer: FontPreferenceWriter,
  input: { userId: string; fontPresetId: string; now: Date },
) {
  requireFontPreset(input.fontPresetId);
  await writer
    .insert(userFontPreferences)
    .values({
      userId: input.userId,
      fontPresetId: input.fontPresetId,
      lastAppliedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [userFontPreferences.userId, userFontPreferences.fontPresetId],
      set: { lastAppliedAt: input.now, updatedAt: input.now },
    });
}
