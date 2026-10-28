import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
  type ExtraConfigColumn,
} from "drizzle-orm/pg-core";
import { getDatabaseSchemaName } from "./schema";

const columns = {
  id: uuid("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  state: text("state").$type<"uploading" | "ready" | "deleting">().notNull(),
  location: text("location").notNull(),
  bytes: bigint("bytes", { mode: "number" }).notNull(),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  digest: text("digest"),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};
function constraints(t: {
  userId: ExtraConfigColumn;
  createdAt: ExtraConfigColumn;
  state: AnyPgColumn;
  bytes: AnyPgColumn;
}) {
  return [
    index("resume_assets_owner_recent_idx").on(t.userId, t.createdAt.desc()),
    check(
      "resume_assets_state_check",
      sql`${t.state} IN ('uploading','ready','deleting')`,
    ),
    check("resume_assets_bytes_check", sql`${t.bytes} >= 0`),
  ];
}
const schemaName = getDatabaseSchemaName();
export const resumeAssets =
  schemaName === "public"
    ? pgTable("resume_assets", columns, constraints)
    : pgSchema(schemaName).table("resume_assets", columns, constraints);
export const resumeAssetDatabaseTables = { resumeAssets };
