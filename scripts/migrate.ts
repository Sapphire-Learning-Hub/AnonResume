import { migrateDatabase } from "@/db/migrate";
import { getDatabasePool } from "@/lib/database";

try {
  await migrateDatabase();
  console.info("Database migrations applied.");
} finally {
  await getDatabasePool().end();
}
