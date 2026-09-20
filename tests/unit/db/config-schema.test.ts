import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import * as database from "@/db";

describe("configuration database schema", () => {
  it("exports the complete configuration persistence model", () => {
    expect(Object.keys(database)).toEqual(
      expect.arrayContaining([
        "systemConfigRevisions",
        "systemConfigValues",
        "systemConfigRuntimeStates",
      ]),
    );
  });

  it("keeps revision versions unique and limits mutable states to one row", () => {
    const config = getTableConfig(database.systemConfigRevisions);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        "system_config_revisions_version_unique",
        "system_config_revisions_active_unique",
        "system_config_revisions_draft_unique",
      ]),
    );
    expect(
      config.indexes.find(
        (index) => index.config.name === "system_config_revisions_active_unique",
      )?.config.where,
    ).toBeDefined();
    expect(
      config.indexes.find(
        (index) => index.config.name === "system_config_revisions_draft_unique",
      )?.config.where,
    ).toBeDefined();
  });

  it("keys values by revision and key and deletes draft values with the revision", () => {
    const config = getTableConfig(database.systemConfigValues);
    const revisionForeignKey = config.foreignKeys.find(
      (foreignKey) =>
        foreignKey.reference().foreignTable === database.systemConfigRevisions,
    );

    expect(
      config.primaryKeys[0]?.columns.map((column) => column.name),
    ).toEqual(["revision_id", "key"]);
    expect(revisionForeignKey?.onDelete).toBe("cascade");
    expect(config.checks.map((check) => check.name)).toContain(
      "system_config_values_payload_check",
    );
  });

  it("records independent consumer runtime state and fallback diagnostics", () => {
    const columns = getTableColumns(database.systemConfigRuntimeStates);
    const config = getTableConfig(database.systemConfigRuntimeStates);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "consumer",
        "desiredRevisionId",
        "loadedHotRevisionId",
        "loadedRestartRevisionId",
        "fallbackRevisionId",
        "healthState",
        "lastError",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "system_config_runtime_states_consumer_seen_idx",
    );
  });
});
