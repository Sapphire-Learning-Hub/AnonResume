import { boolean, index, pgSchema, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { getDatabaseSchemaName } from "./schema";

const schemaName = getDatabaseSchemaName();

const userFontPreferenceColumns = {
  userId: text("user_id").notNull(),
  fontPresetId: text("font_preset_id").notNull(),
  isFavorite: boolean("is_favorite").notNull().default(false),
  lastAppliedAt: timestamp("last_applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const userFontPreferences =
  schemaName === "public"
    ? pgTable(
        "user_font_preferences",
        userFontPreferenceColumns,
        (table) => [
          primaryKey({ columns: [table.userId, table.fontPresetId] }),
          index("user_font_preferences_recent_idx").on(
            table.userId,
            table.lastAppliedAt.desc(),
          ),
        ],
      )
    : pgSchema(schemaName).table(
        "user_font_preferences",
        userFontPreferenceColumns,
        (table) => [
          primaryKey({ columns: [table.userId, table.fontPresetId] }),
          index("user_font_preferences_recent_idx").on(
            table.userId,
            table.lastAppliedAt.desc(),
          ),
        ],
      );

export const fontDatabaseTables = { userFontPreferences };
