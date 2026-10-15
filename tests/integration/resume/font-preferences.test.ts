import { eq } from "drizzle-orm";

import { db, userFontPreferences } from "@/db";
import {
  listUserFontPreferences,
  setUserFontFavorite,
} from "@/lib/resume/fonts/preferences";

describe("font preferences", () => {
  const userIds = ["font-preferences-a", "font-preferences-b"];

  afterEach(async () => {
    for (const userId of userIds) {
      await db
        .delete(userFontPreferences)
        .where(eq(userFontPreferences.userId, userId));
    }
  });

  it("keeps favorites isolated by user and makes repeated updates idempotent", async () => {
    await setUserFontFavorite({
      userId: userIds[0]!,
      fontPresetId: "noto-serif-sc",
      favorite: true,
    });
    await setUserFontFavorite({
      userId: userIds[0]!,
      fontPresetId: "noto-serif-sc",
      favorite: true,
    });

    expect(await listUserFontPreferences(userIds[0]!)).toMatchObject([
      { fontPresetId: "noto-serif-sc", favorite: true },
    ]);
    expect(await listUserFontPreferences(userIds[1]!)).toEqual([]);
  });

  it("rejects identifiers outside the bundled font catalog", async () => {
    await expect(
      setUserFontFavorite({
        userId: userIds[0]!,
        fontPresetId: "unknown-font",
        favorite: true,
      }),
    ).rejects.toThrow("invalid_font_preset");
  });
});
